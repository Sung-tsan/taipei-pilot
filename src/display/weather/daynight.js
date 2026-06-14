// @ts-check
// V3 日夜時段 —— 純參數（光照/天色/夜燈），零 DOM/Three，vitest 直測。
// 「開場可選固定時段」白天/黃昏/夜；純氛圍不懲罰（夜不額外降能見度，除非同時起霧）。
// render 端把這些參數疊在 weather 之上（compose：weather 先 apply、day/night 再 modulate）。

/** 可選時段（開場固定，不做流動循環） */
export const TIMES_OF_DAY = /** @type {const} */ (['day', 'dusk', 'night']);
export const DEFAULT_TIME = 'day';

/**
 * @typedef {{
 *   sunMul:number,      // 陽光強度倍率（疊在 weather 光照上）
 *   hemiMul:number,     // 半球光倍率
 *   sunColor:string,    // 陽光色（黃昏偏橘、夜偏冷藍）
 *   skyTint:string,     // 天色/霧色要混入的色（夜＝深藍）
 *   tintAmt:number,     // 混入比例 0..1（白天 0＝不染）
 *   nightLights:boolean,// 夜燈是否亮（跑道燈/航廈窗光/停機坪燈）
 * }} DayNightParams
 */

/** @type {Record<string, DayNightParams>} */
const PARAMS = {
  day:   { sunMul: 1.00, hemiMul: 1.00, sunColor: '#fff2dc', skyTint: '#bfe0ef', tintAmt: 0.00, nightLights: false },
  dusk:  { sunMul: 0.72, hemiMul: 0.80, sunColor: '#ffb277', skyTint: '#e89a5a', tintAmt: 0.40, nightLights: true },
  night: { sunMul: 0.28, hemiMul: 0.42, sunColor: '#9fb6e8', skyTint: '#0c1530', tintAmt: 0.78, nightLights: true },
};

/** @param {string} t @returns {DayNightParams} 未知 → 白天（不爆） */
export function dayNightParams(t) { return PARAMS[t] ?? PARAMS[DEFAULT_TIME]; }

/** @returns {{ time:string }} 預設時段＝白天 */
export function makeDayNight() { return { time: DEFAULT_TIME }; }
