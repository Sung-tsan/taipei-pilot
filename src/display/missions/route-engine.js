// @ts-check
// V5 航線巡航引擎 —— 純狀態機，零 THREE/DOM，vitest 直測。
// A→B 跨海不渲染 300km → 雲上抽象：起飛(細節)→拉高觸發雲上低細節→時間壓縮 + 半自動 →
// 近目的地 → 降回細節（main.js 接 load 到達 airspace）。北極星 ROADMAP §4 V5 / handoff v5.0-1 P3。
//
// 半自動：巡航段 progress 自動推進（孩子不必一直握桿飛 300km），玩家可微調航向（headingAdjust）
// 影響到達精準度（cosmetic），近目的地恢復全控。時間壓縮：整段航線壓到 [MIN,MAX] 秒的「快轉」。

/** 巡航段時間壓縮範圍（秒）：再遠也不無聊、再近也有儀式感。 */
export const CRUISE_MIN_SEC = 22;
export const CRUISE_MAX_SEC = 48;
/** 爬到此高度（m）＋有選定航線 → 觸發進入雲上巡航（雲在 ~500，CLIMB_CEIL 1000）。 */
export const CRUISE_ENTER_ALT = 600;

/** @typedef {'climb'|'cruise'|'descent'|'arrived'} CruisePhase */
/**
 * @typedef {{
 *   route: import('../scene/airports.js').Route,
 *   distanceKm: number,
 *   durationSec: number,
 *   phase: CruisePhase,
 *   progress: number,    // 巡航段進度 0..1
 *   elapsed: number,     // 巡航段已過秒數
 *   headingErr: number,  // 累積航向偏差（半自動微調；近目的地化作到達精準度）
 * }} Cruise
 */

/**
 * 依航程算壓縮後巡航秒數（線性，夾在 [MIN,MAX]）。
 * @param {number} distanceKm @returns {number}
 */
export function cruiseDuration(distanceKm) {
  const raw = distanceKm / 6; // ~280km → 46s；~50km → 8s（會被 MIN 夾到 22s）
  return Math.max(CRUISE_MIN_SEC, Math.min(CRUISE_MAX_SEC, raw));
}

/**
 * 建一段巡航（起飛後選定航線即建；phase 從 'climb' 起，等爬高觸發 'cruise'）。
 * @param {import('../scene/airports.js').Route} route @param {number} distanceKm
 * @returns {Cruise}
 */
export function makeCruise(route, distanceKm) {
  return {
    route,
    distanceKm,
    durationSec: cruiseDuration(distanceKm),
    phase: 'climb',
    progress: 0,
    elapsed: 0,
    headingErr: 0,
  };
}

/**
 * 推進巡航一步（main.js 每物理步呼叫）。
 * - climb：等高度 ≥ CRUISE_ENTER_ALT → 進 cruise（justEnteredCruise）。
 * - cruise：progress 依 dt/durationSec 自動推進（半自動）；headingAdjust 累積偏差；progress≥1 → descent（justArrived）。
 * - descent / arrived：不再推進（main.js 已接管 load 到達 airspace）。
 * @param {Cruise} c
 * @param {{ dt:number, alt:number, headingAdjust?:number }} p
 *   dt＝秒；alt＝目前高度 m；headingAdjust＝玩家航向微調 -1..1（半自動，cosmetic）。
 * @returns {{ phase:CruisePhase, progress:number, justEnteredCruise:boolean, justArrived:boolean }}
 */
export function stepCruise(c, { dt, alt, headingAdjust = 0 }) {
  let justEnteredCruise = false;
  let justArrived = false;
  if (c.phase === 'climb') {
    if (alt >= CRUISE_ENTER_ALT) { c.phase = 'cruise'; c.progress = 0; c.elapsed = 0; justEnteredCruise = true; }
  } else if (c.phase === 'cruise') {
    c.elapsed += dt;
    c.progress = Math.min(1, c.elapsed / c.durationSec);
    c.headingErr += (headingAdjust || 0) * dt; // 半自動微調累積（化作到達精準度）
    if (c.progress >= 1) { c.phase = 'descent'; justArrived = true; }
  }
  return { phase: c.phase, progress: c.progress, justEnteredCruise, justArrived };
}

/** 到達精準度（半自動微調太多 → 略降；給 HUD/到達品質參考，0..1）。 @param {Cruise} c */
export function arrivalAccuracy(c) {
  return Math.max(0, 1 - Math.min(1, Math.abs(c.headingErr) / 8));
}

/** 巡航 HUD 文字標籤。 @param {CruisePhase} phase */
export function cruisePhaseLabel(phase) {
  switch (phase) {
    case 'climb': return '爬升中…飛上雲端開始巡航';
    case 'cruise': return '雲上巡航中';
    case 'descent': return '下降進場';
    default: return '抵達';
  }
}

/** 剩餘巡航秒數（整數，給 ETA）。 @param {Cruise} c */
export function cruiseEtaSec(c) {
  if (c.phase !== 'cruise') return c.phase === 'climb' ? Math.round(c.durationSec) : 0;
  return Math.max(0, Math.round(c.durationSec - c.elapsed));
}
