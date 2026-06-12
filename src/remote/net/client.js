// @ts-check
// 遙控器端連線：帶 token 重連（回原 slot）、指數 backoff、心跳看門狗。
import { parseMsg, encodeMsg } from '../../../shared/protocol.js';
import { PORT } from '../../../shared/constants.js';

const TOKEN_KEY = 'tp_token';

/** 心跳：每 PING_MS 送一次 ping；超過 PONG_TIMEOUT_MS 沒收到任何 server 訊息
 *  → 視為半開（殭屍）連線，主動斷線觸發重連（token 會回原 slot）。
 *  這是「遊戲中自動修復」的連線層：不用孩子重整頁面。 */
const PING_MS = 2000;
const PONG_TIMEOUT_MS = 6000;

export class RemoteNet {
  constructor() {
    /** @type {WebSocket|null} */ this.ws = null;
    /** @type {number|null} */ this.slot = null;
    this.connected = false;
    this.displayConnected = false;
    this.slotsFull = false;
    this._backoff = 1000;
    this._closed = false;
    this._lastServerMsgAt = 0;
    /** @type {ReturnType<typeof setInterval>|null} */ this._heartbeat = null;
    /** @type {(state:this)=>void} */ this.onState = () => {};
    /** @type {(kind:string)=>void} */ this.onFx = () => {};
    /** @type {(gear:boolean, mode:string)=>void} */ this.onPState = () => {};
  }

  connect() {
    this._closed = false;
    const url = `wss://${location.hostname}:${PORT}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) { ws.close(); return; } // 過期 socket 防護
      this._backoff = 1000;
      this._lastServerMsgAt = Date.now();
      this._startHeartbeat();
      const token = localStorage.getItem(TOKEN_KEY) ?? undefined;
      ws.send(encodeMsg({ t: 'hello', role: 'remote', ...(token ? { token } : {}) }));
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      const msg = parseMsg(e.data);
      if (!msg) return;
      this._lastServerMsgAt = Date.now();
      switch (msg.t) {
        case 'welcome':
          this.slot = msg.slot;
          this.connected = true;
          this.slotsFull = false;
          localStorage.setItem(TOKEN_KEY, msg.token);
          break;
        case 'slots_full':
          this.slotsFull = true;
          this.connected = false;
          break;
        case 'display_status':
          this.displayConnected = msg.connected;
          break;
        case 'fx':
          this.onFx(msg.kind);
          return; // fx 不觸發 state render
        case 'pstate':
          this.onPState(msg.gear, msg.mode);
          return;
        default:
          return;
      }
      this.onState(this);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this._stopHeartbeat();
      this.connected = false;
      this.onState(this);
      if (this._closed || this.slotsFull) return;
      setTimeout(() => this.connect(), this._backoff);
      this._backoff = Math.min(this._backoff * 1.6, 5000);
    };
    ws.onerror = () => ws.close();
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeat = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      // 太久沒聽到 server（連 pong 都沒有）→ 半開連線，主動斷掉走重連流程
      if (Date.now() - this._lastServerMsgAt > PONG_TIMEOUT_MS) {
        ws.close();
        return;
      }
      ws.send(encodeMsg({ t: 'ping' }));
    }, PING_MS);
  }

  _stopHeartbeat() {
    if (this._heartbeat) { clearInterval(this._heartbeat); this._heartbeat = null; }
  }

  /**
   * @param {{ s:number, r:number, p:number, th:number, b:number }} input
   */
  sendInput(input) {
    if (this.ws?.readyState === WebSocket.OPEN && this.connected) {
      this.ws.send(encodeMsg({ t: 'in', ...input }));
    }
  }
}
