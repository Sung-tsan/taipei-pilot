// @ts-check
// Slot 管理 + 訊息路由（純邏輯，不持有 ws —— send/timer 注入，vitest 可直測）。
//
// 每 slot 狀態機：EMPTY → OCCUPIED → GRACE(30s 保留，token 重連可回收) → EMPTY
import { parseMsg, encodeMsg } from '../shared/protocol.js';
import { GRACE_MS, MAX_SLOTS } from '../shared/constants.js';

/**
 * @typedef {{ state:'empty'|'occupied'|'grace', token:string|null,
 *             clientId:string|null, graceTimer:ReturnType<typeof setTimeout>|null,
 *             lastInputAt:number }} SlotState
 * @typedef {{ role:'display'|'remote'|null, slot:number|null }} ClientState
 */

/** 應用層活性：occupied slot 超過此毫秒沒收到 `in` → 視同斷線（ws 心跳抓不到的殭屍連線） */
export const INPUT_LIVENESS_MS = 4000;

export class Relay {
  /**
   * @param {{ send:(clientId:string, data:string)=>void,
   *           close?:(clientId:string)=>void,
   *           makeToken?:()=>string, graceMs?:number, now?:()=>number }} deps
   */
  constructor({ send, close = () => {}, makeToken = () => crypto.randomUUID(), graceMs = GRACE_MS, now = Date.now }) {
    this._send = send;
    this._close = close;
    this._makeToken = makeToken;
    this._graceMs = graceMs;
    this._now = now;
    /** @type {Map<string, ClientState>} */
    this.clients = new Map();
    /** @type {SlotState[]} */
    this.slots = Array.from({ length: MAX_SLOTS }, () => ({
      state: 'empty', token: null, clientId: null, graceTimer: null, lastInputAt: 0,
    }));
    /** @type {string|null} */
    this.displayId = null;
  }

  /** 活性掃描（server 週期呼叫）：殭屍 remote（連線在、輸入停）→ 走斷線流程 */
  sweepStale() {
    const now = this._now();
    this.slots.forEach((slot) => {
      if (slot.state !== 'occupied' || !slot.clientId) return;
      if (now - slot.lastInputAt > INPUT_LIVENESS_MS) {
        const id = slot.clientId;
        this._close(id);
        this.onDisconnect(id);
      }
    });
  }

  /** @param {string} clientId */
  onConnect(clientId) {
    this.clients.set(clientId, { role: null, slot: null });
  }

  /**
   * @param {string} clientId
   * @param {string} raw
   */
  onMessage(clientId, raw) {
    const msg = parseMsg(raw);
    if (!msg) return; // 壞訊息丟棄，不中斷連線
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (msg.t) {
      case 'ping':
        // 應用層心跳：任何角色都回。client 靠 pong 偵測半開（殭屍）連線後自我重連。
        this._send(clientId, encodeMsg({ t: 'pong' }));
        return;
      case 'hello':
        if (msg.role === 'display') this._helloDisplay(clientId, client);
        else this._helloRemote(clientId, client, msg.token);
        return;
      case 'in': {
        if (client.role !== 'remote' || client.slot === null) return;
        this.slots[client.slot].lastInputAt = this._now();
        if (this.displayId) {
          this._send(this.displayId, encodeMsg({ ...msg, slot: client.slot }));
        }
        return;
      }
      case 'fx':
      case 'pstate': {
        if (client.role !== 'display') return;
        const slot = this.slots[msg.slot];
        if (slot?.state === 'occupied' && slot.clientId) {
          this._send(slot.clientId, encodeMsg(msg));
        }
        return;
      }
      case 'reset': {
        if (client.role !== 'display') return;
        this.slots.forEach((slot, i) => {
          if (slot.state === 'empty') return;
          if (slot.graceTimer) { clearTimeout(slot.graceTimer); slot.graceTimer = null; }
          if (slot.clientId) {
            const old = this.clients.get(slot.clientId);
            if (old) old.slot = null;
            this._close(slot.clientId);
            this.clients.delete(slot.clientId);
          }
          slot.state = 'empty';
          slot.token = null;
          slot.clientId = null;
          this._toDisplay({ t: 'remote_gone', slot: i });
        });
        return;
      }
      default:
        return; // 其他型別只由 server 發出，client 端送來一律忽略
    }
  }

  /** @param {string} clientId */
  onDisconnect(clientId) {
    const client = this.clients.get(clientId);
    this.clients.delete(clientId);
    if (!client) return;

    if (client.role === 'display' && this.displayId === clientId) {
      this.displayId = null;
      this._broadcastToRemotes({ t: 'display_status', connected: false });
      return;
    }
    if (client.role === 'remote' && client.slot !== null) {
      const slot = this.slots[client.slot];
      if (slot.clientId !== clientId) return; // 已被同 token 新連線接管
      slot.state = 'grace';
      slot.clientId = null;
      const slotIndex = client.slot;
      slot.graceTimer = setTimeout(() => this._expireGrace(slotIndex), this._graceMs);
      this._toDisplay({ t: 'remote_left', slot: slotIndex });
    }
  }

  // --- internal ---

  /**
   * @param {string} clientId
   * @param {ClientState} client
   */
  _helloDisplay(clientId, client) {
    if (this.displayId && this.displayId !== clientId) {
      // 新 display 接管（重整/第二個分頁）；舊的先收 display_replaced → 停止重連，
      // 否則「被踢 → 自動重連 → 反踢」會無限互踢
      this._send(this.displayId, encodeMsg({ t: 'display_replaced' }));
      this._close(this.displayId);
      this.clients.delete(this.displayId);
    }
    client.role = 'display';
    this.displayId = clientId;
    this._send(clientId, encodeMsg({ t: 'display_ok' }));
    // 回放現況：occupied → joined；grace → left（重連的 display 才知道該盤旋等人）
    this.slots.forEach((slot, i) => {
      if (slot.state === 'occupied') this._send(clientId, encodeMsg({ t: 'remote_joined', slot: i }));
      else if (slot.state === 'grace') this._send(clientId, encodeMsg({ t: 'remote_left', slot: i }));
    });
    this._broadcastToRemotes({ t: 'display_status', connected: true });
  }

  /**
   * @param {string} clientId
   * @param {ClientState} client
   * @param {string|undefined} token
   */
  _helloRemote(clientId, client, token) {
    client.role = 'remote';

    // token 重連：grace 內回原 slot；occupied 但帶同 token = 同支手機重整 → 接管
    if (token) {
      const i = this.slots.findIndex((s) => s.token === token && s.state !== 'empty');
      if (i >= 0) {
        const slot = this.slots[i];
        const wasGrace = slot.state === 'grace';
        if (slot.graceTimer) { clearTimeout(slot.graceTimer); slot.graceTimer = null; }
        if (slot.clientId && slot.clientId !== clientId) {
          const old = this.clients.get(slot.clientId);
          if (old) old.slot = null;
          this._close(slot.clientId);
          this.clients.delete(slot.clientId);
        }
        slot.state = 'occupied';
        slot.clientId = clientId;
        slot.lastInputAt = this._now();
        client.slot = i;
        this._send(clientId, encodeMsg({ t: 'welcome', slot: i, token }));
        this._send(clientId, encodeMsg({ t: 'display_status', connected: this.displayId !== null }));
        this._toDisplay(wasGrace ? { t: 'remote_back', slot: i } : { t: 'remote_joined', slot: i });
        return;
      }
    }

    // 新連線：先到先佔
    const i = this.slots.findIndex((s) => s.state === 'empty');
    if (i < 0) {
      this._send(clientId, encodeMsg({ t: 'slots_full' }));
      return;
    }
    const slot = this.slots[i];
    slot.state = 'occupied';
    slot.token = this._makeToken();
    slot.clientId = clientId;
    slot.lastInputAt = this._now();
    client.slot = i;
    this._send(clientId, encodeMsg({ t: 'welcome', slot: i, token: slot.token }));
    this._send(clientId, encodeMsg({ t: 'display_status', connected: this.displayId !== null }));
    this._toDisplay({ t: 'remote_joined', slot: i });
  }

  /** @param {number} i */
  _expireGrace(i) {
    const slot = this.slots[i];
    if (slot.state !== 'grace') return;
    slot.state = 'empty';
    slot.token = null;
    slot.clientId = null;
    slot.graceTimer = null;
    this._toDisplay({ t: 'remote_gone', slot: i });
  }

  /** @param {import('../shared/protocol.js').Msg} msg */
  _toDisplay(msg) {
    if (this.displayId) this._send(this.displayId, encodeMsg(msg));
  }

  /** @param {import('../shared/protocol.js').Msg} msg */
  _broadcastToRemotes(msg) {
    for (const [id, c] of this.clients) {
      if (c.role === 'remote' && c.slot !== null) this._send(id, encodeMsg(msg));
    }
  }
}
