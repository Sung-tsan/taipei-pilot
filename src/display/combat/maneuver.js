// @ts-check
// 空戰主動閃避「翻滾」(barrel roll) —— 純狀態機，vitest 直測，零副作用、零 three/DOM。
// HITL 2026-06-15：以現有技能很難閃飛彈 → 給一招「按一下就甩掉飛彈」的戰技。
// 觸發後的短窗（active）內：
//   1) 視覺：機身做一個平滑的 360° 滾筒翻（dodgeRoll，結束自然回正）。
//   2) 物理：朝側向 jink 一小段位移（真的閃開一點，由呼叫端把位移加到 pos）。
//   3) 機制：拔掉所有正咬著自己的追蹤飛彈的鎖（由 dogfight.breakLocksOn 配合，呼叫端串接）。
// 設計：6 歲也閃得掉，但有冷卻、不能無腦連刷。北極星 ROADMAP §V3 空戰手感。

/** 翻滾閃避調參表（改手感只動這張）。 */
export const DODGE = {
  DURATION_MS: 850,    // 閃避窗（拔鎖有效期）＋翻滾動畫時長
  COOLDOWN_MS: 2200,   // 冷卻：窗結束後再隔這麼久才能再翻（防連刷）
  JINK_MPS: 22,        // 翻滾期間每秒的橫向位移速度（m/s）→ 真的閃開一截
  TURNS: 1,            // 滾筒圈數（1 = 轉一整圈）
};

/**
 * @typedef {{ startAt:number, activeUntil:number, readyAt:number, dir:1|-1 }} DodgeState
 *   startAt＝本次翻滾起點(ms)；activeUntil＝閃避窗結束(ms)；readyAt＝可再次觸發的時間戳；
 *   dir＝翻滾/側移方向（+1 右、-1 左）。
 */

/** @returns {DodgeState} 新的「可立即翻滾」狀態。 */
export function makeDodge() {
  return { startAt: -Infinity, activeUntil: -Infinity, readyAt: 0, dir: 1 };
}

/**
 * 冷卻是否已過（可再次翻滾）。
 * @param {DodgeState} d @param {number} now ms
 * @returns {boolean}
 */
export function dodgeReady(d, now) {
  if (!d) return false;
  const t = typeof now === 'number' && Number.isFinite(now) ? now : 0;
  return t >= (Number.isFinite(d.readyAt) ? d.readyAt : 0);
}

/**
 * 觸發一次翻滾（冷卻內呼叫＝忽略、回 false）。原地改 d。
 * @param {DodgeState} d @param {number} now ms @param {number} [dir] >=0→右、<0→左
 * @returns {boolean} 是否真的觸發
 */
export function triggerDodge(d, now, dir = 1) {
  if (!d || !dodgeReady(d, now)) return false;
  const t = typeof now === 'number' && Number.isFinite(now) ? now : 0;
  d.startAt = t;
  d.activeUntil = t + DODGE.DURATION_MS;
  d.readyAt = t + DODGE.DURATION_MS + DODGE.COOLDOWN_MS;
  d.dir = dir >= 0 ? 1 : -1;
  return true;
}

/**
 * 是否在閃避窗內（這段期間飛彈被拔鎖、機身翻滾、側移）。
 * @param {DodgeState} d @param {number} now ms
 * @returns {boolean}
 */
export function dodging(d, now) {
  if (!d) return false;
  const t = typeof now === 'number' && Number.isFinite(now) ? now : 0;
  return t < d.activeUntil;
}

/**
 * 翻滾進度 0..1（窗外＝0）。
 * @param {DodgeState} d @param {number} now ms
 * @returns {number}
 */
export function dodgePhase(d, now) {
  if (!d) return 0;
  const t = typeof now === 'number' && Number.isFinite(now) ? now : 0;
  if (t < d.startAt || t >= d.activeUntil) return 0;
  const p = (t - d.startAt) / DODGE.DURATION_MS;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/**
 * 視覺滾轉量（rad）：平滑 0 → dir·2π·TURNS（兩端慢中段快，結束 ≡ 回正）。
 * 給 PlaneEntity 疊在 -bank 上。
 * @param {DodgeState} d @param {number} now ms
 * @returns {number}
 */
export function dodgeRoll(d, now) {
  const p = dodgePhase(d, now);
  if (p <= 0) return 0;
  const eased = 0.5 - 0.5 * Math.cos(Math.PI * p); // smoothstep-ish 0..1（單調）
  return d.dir * DODGE.TURNS * 2 * Math.PI * eased;
}
