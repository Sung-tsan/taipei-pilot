// @ts-check
// 後果軸（安全模式開關）—— 純狀態機，零 DOM/Three，vitest 直測。
// 三檔獨立：安全＝彈開不墜；溫和＝❤️ 計數歸零回機場；真實＝漸進 damage（完好→冒煙→墜毀）。
// 北極星 ROADMAP §1 / handoff v1.1-1。後果嚴重度旋鈕＝同一條軸（之後 V3 天氣也吃這檔）。

/** @typedef {'safe'|'gentle'|'real'} ConsequenceMode */
/** @typedef {'intact'|'smoking'|'destroyed'} Damage */
/** @typedef {{ mode:ConsequenceMode, heartsMax:number, hearts:number, damage:Damage }} Conseq */
/** @typedef {'bounce'|'heart_loss'|'reset'|'smoke'|'destroy'} MishapOutcome */

export const CONSEQUENCE_MODES = /** @type {ConsequenceMode[]} */ (['safe', 'gentle', 'real']);

/**
 * @param {ConsequenceMode} mode @param {number} heartsMax （gentle 用；可為 Infinity）
 * @returns {Conseq}
 */
export function makeConsequence(mode, heartsMax) {
  return { mode, heartsMax, hearts: mode === 'gentle' ? heartsMax : 0, damage: 'intact' };
}

/**
 * 切換後果模式：重置該檔的計數/damage（gentle 補滿 ❤️、real 回完好）。
 * @param {Conseq} c @param {ConsequenceMode} mode
 */
export function setMode(c, mode) {
  c.mode = mode;
  c.damage = 'intact';
  c.hearts = mode === 'gentle' ? c.heartsMax : 0;
}

/**
 * 調 ❤️ 上限（僅 gentle 有意義）：即時補滿到新上限。
 * @param {Conseq} c @param {number} heartsMax
 */
export function setHeartsMax(c, heartsMax) {
  c.heartsMax = heartsMax;
  if (c.mode === 'gentle') c.hearts = heartsMax;
}

/**
 * 登記一次「撞擊/失誤」事件，原地改 c，回傳結果。
 * - safe：永遠彈開、不墜、不扣。
 * - gentle：❤️−1；歸零 → 補滿並回機場（reset）。Infinity 上限＝永不歸零。
 * - real：完好→冒煙（smoke，續飛）；冒煙再撞→墜毀（destroy，回跑道、damage 重置）。
 * @param {Conseq} c
 * @returns {{ outcome:MishapOutcome, reset:boolean }} reset=true → 呼叫端把飛機放回跑道
 */
export function registerMishap(c) {
  switch (c.mode) {
    case 'gentle': {
      c.hearts = Math.max(0, c.hearts - 1);
      if (c.hearts === 0) {
        c.hearts = c.heartsMax; // 回機場休息 → 補滿
        return { outcome: 'reset', reset: true };
      }
      return { outcome: 'heart_loss', reset: false };
    }
    case 'real': {
      if (c.damage === 'intact') {
        c.damage = 'smoking';
        return { outcome: 'smoke', reset: false };
      }
      c.damage = 'intact'; // 墜毀 → 回跑道、damage 重置
      return { outcome: 'destroy', reset: true };
    }
    case 'safe':
    default:
      return { outcome: 'bounce', reset: false };
  }
}
