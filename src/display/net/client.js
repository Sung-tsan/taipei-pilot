// @ts-check
// display 端連線：收兩支遙控器的輸入、發 fx 回饋、追蹤 slot 狀態。
import { parseMsg, encodeMsg } from '../../../shared/protocol.js';
import { PORT, MAX_SLOTS, INPUT_STALE_MS } from '../../../shared/constants.js';

/**
 * @typedef {{ r:number, p:number, th:number, b:number, s:number, at:number }} SlotInput
 * @typedef {'empty'|'active'|'lost'} SlotStatus  lost = 斷線等重連（display 端開盤旋）
 */

export class DisplayNet {
  constructor() {
    /** @type {WebSocket|null} */ this.ws = null;
    this.connected = false;
    this.replaced = false; // 被另一個視窗接管 → 永久停用
    /** @type {SlotStatus[]} */
    this.slotStatus = Array.from({ length: MAX_SLOTS }, () => /** @type {SlotStatus} */ ('empty'));
    /** @type {(SlotInput|null)[]} */
    this.inputs = Array.from({ length: MAX_SLOTS }, () => null);
    this._backoff = 1000;
    /** @type {(slot:number, status:SlotStatus)=>void} */ this.onSlotChange = () => {};
    /** @type {()=>void} */ this.onState = () => {};
  }

  connect() {
    const ws = new WebSocket(`wss://${location.hostname}:${PORT}`);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) { ws.close(); return; } // 已被新連線取代的舊 socket：不 hello
      this._backoff = 1000;
      ws.send(encodeMsg({ t: 'hello', role: 'display' }));
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      const msg = parseMsg(e.data);
      if (!msg) return;
      switch (msg.t) {
        case 'display_ok':
          this.connected = true;
          break;
        case 'remote_joined':
        case 'remote_back':
          this._setSlot(msg.slot, 'active');
          break;
        case 'remote_left':
          this._setSlot(msg.slot, 'lost');
          break;
        case 'remote_gone':
          this._setSlot(msg.slot, 'empty');
          this.inputs[msg.slot] = null;
          break;
        case 'in':
          if (msg.slot !== undefined) {
            this.inputs[msg.slot] = {
              r: msg.r, p: msg.p, th: msg.th, b: msg.b, s: msg.s, at: performance.now(),
            };
          }
          return; // 高頻訊息不觸發 onState
        case 'display_replaced':
          // 另一個視窗開了遊戲 → 這裡讓位，停止重連（不然會無限互踢）
          this.replaced = true;
          this.connected = false;
          break;
        default:
          return;
      }
      this.onState();
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.connected = false;
      this.onState();
      if (this.replaced) return;
      setTimeout(() => this.connect(), this._backoff);
      this._backoff = Math.min(this._backoff * 1.6, 5000);
    };
    ws.onerror = () => ws.close();
  }

  /**
   * 取 slot 的「有效輸入」：斷流超過 INPUT_STALE_MS 視同放手（歸零，油門保留）。
   * @param {number} slot
   */
  liveInput(slot) {
    const input = this.inputs[slot];
    if (!input) return null;
    if (performance.now() - input.at > INPUT_STALE_MS) {
      return { ...input, r: 0, p: 0 };
    }
    return input;
  }

  /**
   * @param {number} slot @param {'bump'} kind
   */
  sendFx(slot, kind) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encodeMsg({ t: 'fx', slot, kind }));
    }
  }

  /**
   * 機況回報（遙控器 UI 顯示起落架真實狀態）
   * @param {number} slot @param {boolean} gear @param {'parked'|'rolling'|'flying'} mode
   */
  sendPState(slot, gear, mode) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encodeMsg({ t: 'pstate', slot, gear, mode }));
    }
  }

  /**
   * @param {number} slot @param {SlotStatus} status
   */
  _setSlot(slot, status) {
    this.slotStatus[slot] = status;
    this.onSlotChange(slot, status);
  }
}
