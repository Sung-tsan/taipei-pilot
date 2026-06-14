// @ts-check
// 後果軸（安全模式開關）—— 純狀態機，零 DOM/Three，vitest 直測。
// 三檔獨立：安全＝彈開不墜；溫和＝❤️ 計數歸零回機場；真實＝漸進 damage（完好→冒煙→墜毀）。
// 北極星 ROADMAP §1 / handoff v1.1-1。後果嚴重度旋鈕＝同一條軸（之後 V3 天氣也吃這檔）。

/** @typedef {'safe'|'gentle'|'real'} ConsequenceMode */
/** @typedef {'intact'|'smoking'|'destroyed'} Damage */
/** @typedef {{ mode:ConsequenceMode, heartsMax:number, hearts:number, damage:Damage, damagePct:number }} Conseq */
/** @typedef {'bounce'|'heart_loss'|'reset'|'smoke'|'destroy'|'damage'} MishapOutcome */

export const CONSEQUENCE_MODES = /** @type {ConsequenceMode[]} */ (['safe', 'gentle', 'real']);

/** 受損百分比門檻（v3.0-2：離散 damage 改由連續 % 派生）：≥40% 冒煙、=100% 毀。 */
export const SMOKE_PCT = 40;

/** @param {number} pct @returns {Damage} 由受損% 派生離散狀態 */
export function deriveDamage(pct) {
  if (pct >= 100) return 'destroyed';
  if (pct >= SMOKE_PCT) return 'smoking';
  return 'intact';
}

/**
 * @param {ConsequenceMode} mode @param {number} heartsMax （gentle 用；可為 Infinity）
 * @returns {Conseq}
 */
export function makeConsequence(mode, heartsMax) {
  return { mode, heartsMax, hearts: mode === 'gentle' ? heartsMax : 0, damage: 'intact', damagePct: 0 };
}

/**
 * 切換後果模式：重置該檔的計數/damage（gentle 補滿 ❤️、real 回完好）。
 * @param {Conseq} c @param {ConsequenceMode} mode
 */
export function setMode(c, mode) {
  c.mode = mode;
  c.damage = 'intact';
  c.damagePct = 0;
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
        c.damagePct = Math.max(c.damagePct, SMOKE_PCT + 10); // 同步 %（碰撞＝大塊受損）
        return { outcome: 'smoke', reset: false };
      }
      c.damage = 'intact'; // 墜毀 → 回跑道、damage 重置
      c.damagePct = 0;
      return { outcome: 'destroy', reset: true };
    }
    case 'safe':
    default:
      return { outcome: 'bounce', reset: false };
  }
}

/**
 * 連續受損（v3.0-2 天氣：側風劣質著陸 / 亂流甩出包絡）。**只真實模式**累加 damagePct，
 * 由 % 派生 smoking/destroyed；安全/溫和不受天氣傷（回 bounce）。
 * @param {Conseq} c @param {number} pct 本次受損百分點（>0）
 * @returns {{ outcome:MishapOutcome, reset:boolean }} reset=true → 放回跑道（毀）
 */
export function addDamagePct(c, pct) {
  if (c.mode !== 'real' || !(pct > 0)) return { outcome: 'bounce', reset: false };
  const was = c.damage;
  c.damagePct = Math.min(100, c.damagePct + pct);
  c.damage = deriveDamage(c.damagePct);
  if (c.damage === 'destroyed') {
    c.damage = 'intact'; c.damagePct = 0; // 毀 → 回跑道、重置
    return { outcome: 'destroy', reset: true };
  }
  if (c.damage === 'smoking' && was !== 'smoking') return { outcome: 'smoke', reset: false };
  return { outcome: 'damage', reset: false }; // 受損累加但未跨檻
}
