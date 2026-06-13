// @ts-check
// 迫降系統（真實模式招牌）—— 純判定，零 DOM/Three，vitest 直測。
// authenticity 即關卡：用機種真實諸元（wingspan/minRunwayLength）判定，不另設規則。
// 北極星 ROADMAP §4 v1.1 迫降地形表；handoff v1.1-2。
import { P } from './flight-model.js';

/** 地形分類 */
export const TERRAIN = /** @type {const} */ ({
  WATER: 'water', PARK: 'park', GRASS: 'grass', ROAD: 'road', BUILDING: 'building', RUNWAY: 'runway',
});

/** 迫降品質結果（接 v1.1-1 damage：smoking/destroyed） */
/** @typedef {'success'|'smoking'|'destroyed'} LandingResult */

/** T-34C 真實諸元（v1.2 完整 roster；本輪先給此機）。minRunwayLength 與「短場挑戰」共用同一參數。 */
export const T34C_DIMS = { wingspan: 10, minRunwayLength: 250 };

/**
 * 迫降品質判定：地形 × 速度 × 下沉率 × 側傾 → success / smoking / destroyed。
 * 地形表（ROADMAP）：水上=濺水成功、公園/草地=安全區、馬路=看幾何(roadOk)、建築=墜毀。
 * 再疊品質：太快/太陡 → 即使地形對也受損/墜毀（安全區寬鬆、馬路嚴一點）。
 * @param {{ terrain:string, speed:number, sinkRate:number, bank:number, roadOk?:boolean }} p
 * @returns {LandingResult}
 */
export function judgeForcedLanding({ terrain, speed, sinkRate, bank, roadOk = false }) {
  if (terrain === TERRAIN.BUILDING) return 'destroyed';
  if (terrain === TERRAIN.ROAD && !roadOk) return 'destroyed'; // 路太窄或太短
  if (terrain === TERRAIN.RUNWAY) return 'success';            // 跑道本來就能落
  const lenient = terrain === TERRAIN.WATER || terrain === TERRAIN.PARK || terrain === TERRAIN.GRASS;
  return quality(speed, sinkRate, Math.abs(bank), lenient);
}

/**
 * @param {number} speed @param {number} sinkRate @param {number} absBank @param {boolean} lenient
 * @returns {LandingResult}
 */
function quality(speed, sinkRate, absBank, lenient) {
  const sinkOk = P.LAND_MAX_SINK * (lenient ? 1.8 : 1.2);
  const bankOk = P.LAND_MAX_BANK * (lenient ? 2.2 : 1.4);
  if (sinkRate <= sinkOk && absBank <= bankOk) return 'success';
  if (sinkRate <= sinkOk * 1.8 && absBank <= bankOk * 1.8 && speed <= P.V_MAX) return 'smoking';
  return 'destroyed';
}

/**
 * 沿車道量測連續道路長度（注入 sampleTerrain → 純函式，可測）。
 * 從 (x,z) 往 axis 兩向走，累計仍是 road 的距離，至 cap 為止。
 * @param {(x:number, z:number)=>string} sampleTerrain
 * @param {number} x @param {number} z @param {'x'|'z'} axis
 * @param {{ step?:number, cap?:number }} [opts]
 * @returns {number} 連續道路長度（公尺）
 */
export function roadClearLength(sampleTerrain, x, z, axis, { step = 12, cap = 600 } = {}) {
  let len = step; // 自身落點
  for (const dir of [1, -1]) {
    for (let d = step; d <= cap; d += step) {
      const sx = axis === 'x' ? x + dir * d : x;
      const sz = axis === 'z' ? z + dir * d : z;
      if (sampleTerrain(sx, sz) !== TERRAIN.ROAD) break;
      len += step;
    }
  }
  return len;
}

/**
 * 馬路可迫降？寬 > 機翼展 且 最長直段 ≥ 機型最短起降長。
 * @param {number} roadWidth @param {number} clearLength @param {{wingspan:number, minRunwayLength:number}} dims
 */
export function roadLandable(roadWidth, clearLength, dims) {
  return roadWidth > dims.wingspan && clearLength >= dims.minRunwayLength;
}

/**
 * V5 接點 stub：油量耗盡 → 強制進入迫降流程（fuel V5 × 迫降 v1.1 × 真實模式 閉環）。
 * 本輪僅留 hook、不觸發（ROADMAP §5B 油量機制 V5 啟用）。
 * @param {number} _slot @returns {{ forced:true }}
 */
export function onFuelEmpty(_slot) {
  return { forced: true }; // V5：呼叫端據此切入迫降。本輪無觸發來源。
}
