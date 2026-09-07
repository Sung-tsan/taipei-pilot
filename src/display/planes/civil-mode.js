// @ts-check
// P0-2：民航機（airliner tone）敘事鎖 — 不可進入可射擊空戰、選單不顯示空戰。
import { planeSpec } from './plane-specs.js';

/** 是否民航機（ATR / B737 / A330…）。 @param {string} id */
export function isCivilPlane(id) {
  return planeSpec(id).tone === 'airliner';
}

/** 民航機阻擋空戰（tone === 'airliner'）。 @param {string} planeId */
export function civilBlocksDogfight(planeId) {
  return isCivilPlane(planeId);
}

/**
 * 若民航機請求／處於空戰 → 改為 fallback（預設 free）。
 * @param {string} planeId
 * @param {string} mode
 * @param {string} [fallback='free']
 * @returns {string}
 */
export function coercePlayModeForPlane(planeId, mode, fallback = 'free') {
  if (civilBlocksDogfight(planeId) && mode === 'dogfight') return fallback;
  return mode;
}

/** 玩法選單是否應顯示「空戰」選項（凍結 UI：民航＝不出現）。 @param {string} planeId */
export function showDogfightInModeMenu(planeId) {
  return !civilBlocksDogfight(planeId);
}
