// @ts-check
// V5 油量機制 —— 純邏輯，零 THREE/DOM，vitest 直測。
// 教「飛行計畫」：飛之前看夠不夠油。系統閉環＝油量(V5) × 迫降(v1.1-2) × 真實模式。
// 北極星 ROADMAP §5B 油量/航程 gates / handoff v5.0-2。
//
// 後果軸三檔：安全/溫和＝油量寬鬆（不消耗、無限），只真實模式才會油盡 → 油低警告 → 油盡迫降。
// fuelSec＝該機種「滿油可飛秒數」（plane-specs，全油門）；耗油率隨油門（怠速耗一半）。

/** 航程 gate 係數：滿油秒 × K ＝ 可飛公里（rangeKm）。調這顆＝調整「哪台飛得到哪」。 */
export const RANGE_K = 0.18;
/** 油低警告門檻（剩餘比例）。 */
export const LOW_FUEL_FRAC = 0.2;

/** @typedef {{ sec:number, max:number }} Fuel */

/** @param {number} maxSec @returns {Fuel} 滿油狀態 */
export function makeFuel(maxSec) { return { sec: maxSec, max: maxSec }; }

/** 機種滿油航程（公里）。 @param {number} maxSec @returns {number} */
export function rangeKm(maxSec) { return maxSec * RANGE_K; }

/** 一條航線要耗多少油（秒）＝距離 / K。 @param {number} distanceKm @returns {number} */
export function routeFuelCostSec(distanceKm) { return distanceKm / RANGE_K; }

/** 該機種飛得到這條航線嗎（航程 gate）。 @param {number} maxSec @param {number} distanceKm @returns {boolean} */
export function canReach(maxSec, distanceKm) { return rangeKm(maxSec) >= distanceKm; }

/** 剩餘比例 0..1。 @param {Fuel} f */
export function fuelFrac(f) { return f.max > 0 ? Math.max(0, Math.min(1, f.sec / f.max)) : 0; }

/** 是否油量偏低（≤ 門檻）。 @param {Fuel} f @param {number} [thresh] */
export function isLow(f, thresh = LOW_FUEL_FRAC) { return fuelFrac(f) <= thresh; }

/**
 * 消耗油料（就地改 f）。回傳是否「剛好耗盡」（這次扣到 0 而上次>0）＝觸發油盡迫降一次性。
 * @param {Fuel} f @param {number} seconds 本次耗油秒數（>0）
 * @returns {{ empty:boolean, justEmptied:boolean, frac:number }}
 */
export function burn(f, seconds) {
  const was = f.sec;
  if (seconds > 0) f.sec = Math.max(0, f.sec - seconds);
  const empty = f.sec <= 0;
  return { empty, justEmptied: empty && was > 0, frac: fuelFrac(f) };
}

/**
 * 本地飛行耗油率（秒/秒）：全油門 1.0（滿油＝fuelSec 秒），怠速耗一半。
 * @param {number} throttle 0..1 @returns {number}
 */
export function burnRate(throttle) { return 0.5 + 0.5 * Math.max(0, Math.min(1, throttle)); }

/** 加滿油（落地/重生/補給）。 @param {Fuel} f */
export function refuel(f) { f.sec = f.max; }
