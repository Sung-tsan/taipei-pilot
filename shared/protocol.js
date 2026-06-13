// @ts-check
// WebSocket 訊息協定 —— 三端共用，先寫先凍結。
// server 是啞中繼：只管 slot 與轉發，不跑模擬。

/**
 * @typedef {{ t:'hello', role:'display' }} HelloDisplay
 * @typedef {{ t:'hello', role:'remote', token?:string }} HelloRemote
 * @typedef {{ t:'welcome', slot:number, token:string }} Welcome            // srv→remote
 * @typedef {{ t:'slots_full' }} SlotsFull                                  // srv→remote
 * @typedef {{ t:'display_ok' }} DisplayOk                                  // srv→display
 * @typedef {{ t:'display_status', connected:boolean }} DisplayStatus      // srv→remote
 * @typedef {{ t:'remote_joined', slot:number }} RemoteJoined               // srv→display
 * @typedef {{ t:'remote_left', slot:number }} RemoteLeft                   // srv→display（進 grace）
 * @typedef {{ t:'remote_back', slot:number }} RemoteBack                   // srv→display（grace 內重連）
 * @typedef {{ t:'remote_gone', slot:number }} RemoteGone                   // srv→display（grace 逾時釋放）
 * @typedef {{ t:'in', s:number, r:number, p:number, th:number, b:number, slot?:number,
 *             rudder?:number, flaps?:number, trim?:number }} InputMsg
 *   remote→srv（無 slot）→ srv 蓋上 slot → display。
 *   s=序號, r=roll -1..1, p=pitch -1..1（正=拉桿爬升）, th=油門 0..1, b=按鍵 bitmask
 *   —— 複雜版多送（向後相容，缺值＝中立）——
 *   rudder=方向舵 -1..1（→yaw）, flaps=襟翼段 0..n（整數）, trim=配平 -1..1（pitch 偏置）
 * @typedef {{ t:'fx', slot:number, kind:'bump' }} FxMsg                    // display→srv→remote
 * @typedef {{ t:'pstate', slot:number, gear:boolean, mode:'parked'|'rolling'|'flying',
 *             spd?:number, alt?:number, hdg?:number }} PStateMsg
 *   display→srv→remote：實際機況回報（起落架真實狀態、飛行模式），遙控器 UI 跟著顯示。
 *   —— 複雜版儀表用（向後相容，簡單版忽略）—— spd=空速 km/h, alt=高度 m, hdg=航向 0..359°
 * @typedef {{ t:'display_replaced' }} DisplayReplaced                      // srv→舊 display：被新視窗接管，停止重連
 * @typedef {{ t:'reset' }} ResetMsg                                        // display→srv：清空所有 slot（換場/測試）
 * @typedef {{ t:'ping' }} PingMsg                                          // client→srv：應用層心跳（半開連線偵測）
 * @typedef {{ t:'pong' }} PongMsg                                          // srv→client：心跳回覆
 * @typedef {HelloDisplay|HelloRemote|Welcome|SlotsFull|DisplayOk|DisplayStatus|RemoteJoined|RemoteLeft|RemoteBack|RemoteGone|InputMsg|FxMsg|PStateMsg|ResetMsg|DisplayReplaced|PingMsg|PongMsg} Msg
 */

/** 按鍵 bitmask（`in` 訊息的 b 欄；送「期望狀態」非事件） */
export const BTN = {
  GEAR_UP: 1, // 設起 = 想收起落架（地面上 display 會忽略，離地後自動生效）
  // 喇叭已改為 remote 本地播聲（兩機同玩不互相干擾），不再走 b bitmask。
};

/** @param {unknown} v @returns {v is number} */
const num = (v) => typeof v === 'number' && Number.isFinite(v);
/** @param {unknown} v @param {number} lo @param {number} hi @returns {v is number} */
const inRange = (v, lo, hi) => num(v) && v >= lo && v <= hi;

/**
 * 驗證來路訊息（server 與 client 都用；壞訊息一律丟棄不中斷連線）。
 * @param {unknown} raw
 * @returns {Msg|null}
 */
export function parseMsg(raw) {
  let m;
  try {
    m = typeof raw === 'string' ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object' || typeof m.t !== 'string') return null;
  switch (m.t) {
    case 'hello':
      if (m.role === 'display') return { t: 'hello', role: 'display' };
      if (m.role === 'remote') {
        if (m.token !== undefined && typeof m.token !== 'string') return null;
        return { t: 'hello', role: 'remote', token: m.token };
      }
      return null;
    case 'welcome':
      return inRange(m.slot, 0, 7) && typeof m.token === 'string'
        ? { t: 'welcome', slot: m.slot, token: m.token } : null;
    case 'slots_full': return { t: 'slots_full' };
    case 'reset': return { t: 'reset' };
    case 'ping': return { t: 'ping' };
    case 'pong': return { t: 'pong' };
    case 'display_replaced': return { t: 'display_replaced' };
    case 'display_ok': return { t: 'display_ok' };
    case 'display_status':
      return typeof m.connected === 'boolean'
        ? { t: 'display_status', connected: m.connected } : null;
    case 'remote_joined':
    case 'remote_left':
    case 'remote_back':
    case 'remote_gone':
      return inRange(m.slot, 0, 7) ? { t: m.t, slot: m.slot } : null;
    case 'in': {
      if (!num(m.s) || !inRange(m.r, -1, 1) || !inRange(m.p, -1, 1)
        || !inRange(m.th, 0, 1) || !num(m.b)) return null;
      /** @type {InputMsg} */
      const out = { t: 'in', s: m.s, r: m.r, p: m.p, th: m.th, b: m.b };
      if (m.slot !== undefined) out.slot = m.slot;
      // 複雜版選送欄位：若帶就驗值域，壞值整則丟棄（不靜默忽略）。缺值＝中立，由消費端補 0。
      if (m.rudder !== undefined) { if (!inRange(m.rudder, -1, 1)) return null; out.rudder = m.rudder; }
      if (m.flaps !== undefined) {
        if (!num(m.flaps) || !Number.isInteger(m.flaps) || m.flaps < 0 || m.flaps > 8) return null;
        out.flaps = m.flaps;
      }
      if (m.trim !== undefined) { if (!inRange(m.trim, -1, 1)) return null; out.trim = m.trim; }
      return out;
    }
    case 'fx':
      return inRange(m.slot, 0, 7) && m.kind === 'bump'
        ? { t: 'fx', slot: m.slot, kind: m.kind } : null;
    case 'pstate': {
      if (!(inRange(m.slot, 0, 7) && typeof m.gear === 'boolean'
        && ['parked', 'rolling', 'flying'].includes(m.mode))) return null;
      /** @type {PStateMsg} */
      const ps = { t: 'pstate', slot: m.slot, gear: m.gear, mode: m.mode };
      if (m.spd !== undefined) { if (!num(m.spd)) return null; ps.spd = m.spd; }
      if (m.alt !== undefined) { if (!num(m.alt)) return null; ps.alt = m.alt; }
      if (m.hdg !== undefined) { if (!num(m.hdg)) return null; ps.hdg = m.hdg; }
      return ps;
    }
    default:
      return null;
  }
}

/** @param {Msg} msg */
export function encodeMsg(msg) {
  return JSON.stringify(msg);
}
