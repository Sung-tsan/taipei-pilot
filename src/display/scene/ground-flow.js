// @ts-check
// 雙人地面/航班流程狀態（per-slot）：離場（登機→後推→滑行→等待→許可）、到場（脫離→滑行→停妥）、
// 空中走廊，各 slot 一份。純資料 + 轉移，無 Three/DOM 依賴 → 可單元測試。
//
// 為什麼要 per-slot（P1 bug 根因）：這些狀態原本是 main.js 的模組層級單例，第二位玩家加入時
// `startDeparture(1)` 直接覆寫共用的 departSlot/departPhase/departGate，第一位玩家從此失去
// 後推/滑行引導與 ATC 指示。改成一 slot 一份 record 後，任一 slot 的轉移都碰不到另一 slot。

/** @typedef {'none'|'boarding'|'pushback'|'taxiOut'|'holdShort'|'cleared'} DepartPhase */
/** @typedef {'none'|'exit'|'taxi'|'parked'} ArrivalPhase */
/** @typedef {{from:{x:number,z:number}, to:{x:number,z:number}, h0:number, h1:number}} PushPath */

/**
 * 一個 slot 的離場流程狀態。
 * @returns {{
 *   phase: DepartPhase, gate: string|null, boardT: number, pushT: number,
 *   pushPath: PushPath|null, holdT: number, pushDoneT: number,
 *   prepHoldSaid: boolean, boardReady: boolean, pendingConfirm: boolean,
 * }}
 */
export function makeDepartState() {
  return {
    phase: 'none',
    gate: null,
    boardT: 0,      // 登機動畫計時（秒）
    pushT: 0,       // pushback 進度 0..1
    pushPath: null, // scripted 後推起終姿態
    holdT: 0,       // hold-short 排序計時（秒）
    pushDoneT: 0,   // 後推完成緩衝計時（宣告交還操控的拍點）
    prepHoldSaid: false, // 「接近等待點」預告只念一次
    boardReady: false,   // 登機完成、等玩家確認後推
    pendingConfirm: false, // 確認鍵脈衝閂鎖（該 slot 自己的遙控器/Enter）
  };
}

/**
 * 一個 slot 的到場流程狀態。navGate＝目前導航目標節點 id（離場/到場共用，null＝需重算路線）。
 * @returns {{ phase: ArrivalPhase, exit: string|null, gate: string|null, parkedAt: number }}
 */
export function makeArrivalState() {
  return { phase: 'none', exit: null, gate: null, parkedAt: 0 };
}

/**
 * 一個 slot 的空中走廊狀態。pending＝已起飛、等爬過門檻高度才開走廊。
 * @returns {{ active: boolean, idx: number, pts: import('./air-corridor.js').CorridorPoint[], pending: boolean }}
 */
export function makeCorridorState() {
  return { active: false, idx: 0, pts: [], pending: false };
}

// 以下 reset* 一律「就地重置」（保留物件身分，呼叫端持有的參照不失效）。

/** 就地重置離場狀態。 @param {ReturnType<typeof makeDepartState>} d */
export function resetDepart(d) { return Object.assign(d, makeDepartState()); }

/** 就地重置到場狀態。 @param {ReturnType<typeof makeArrivalState>} a */
export function resetArrival(a) { return Object.assign(a, makeArrivalState()); }

/** 就地重置走廊狀態。 @param {ReturnType<typeof makeCorridorState>} c */
export function resetCorridor(c) { return Object.assign(c, makeCorridorState()); }

/**
 * 開新一班離場（spawn-at-gate 後 / 到場過站後）：先清乾淨再進登機階段。
 * 只動傳進來的這一份 record —— 這就是「兩位玩家互不搶」的不變式。
 * @param {ReturnType<typeof makeDepartState>} d @param {string|null} gate
 */
export function beginDepart(d, gate) {
  resetDepart(d);
  d.phase = 'boarding';
  d.gate = gate;
  return d;
}
