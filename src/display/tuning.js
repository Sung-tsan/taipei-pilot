// @ts-check
// v5.2 手感調參中心（POLISH_BACKLOG 維度 4「旋鈕一次跟孩子調」的 dev 工具面）。
// 這些值全是「agent 初值待手感校」——本模組把它們收成 runtime 可調 + localStorage 暫存 +
// 一鍵匯出。**定稿仍要把匯出的值寫回各源頭常數**（此處只是校準夾具，不是真相源）。
// 純狀態模組（零 DOM；面板 UI 在 ui/tuning-panel.js），vitest 直測。
import { AI } from './combat/enemy-ai.js';
import { RANGE_K } from './missions/fuel.js';

const KEY = 'tp_tuning';

/** @typedef {{ getItem:(k:string)=>string|null, setItem:(k:string,v:string)=>void, removeItem?:(k:string)=>void }} StorageLike */

/** runtime 可調值（glue 層消費；預設＝目前源頭常數）。 */
export const TUNING = {
  rangeK: RANGE_K,   // 航程 gate 係數（fuel.js RANGE_K 的 runtime 覆寫）
  windMul: 1,        // 全域風倍率（疊在各機場 windScale 上）
  turbMul: 1,        // 全域亂流倍率（疊在各機場 turbScale 上）
  xwindDmgMul: 1,    // 側風著陸傷害倍率
  turbDmgMul: 1,     // 亂流甩出傷害倍率
  enemyCap: AI.CURVE_CAP, // 敵機難度上限（寫回 AI.CURVE_CAP）
};

/** 面板旋鈕描述（label/範圍/步進；apply＝把值灌回消費點）。 */
export const KNOBS = /** @type {const} */ ([
  { key: 'rangeK', label: '⛽ 航程係數 K（哪台飛得到哪）', min: 0.08, max: 0.4, step: 0.01 },
  { key: 'windMul', label: '🌬 全域風倍率', min: 0, max: 3, step: 0.1 },
  { key: 'turbMul', label: '🌀 全域亂流倍率', min: 0, max: 3, step: 0.1 },
  { key: 'xwindDmgMul', label: '🛬 側風傷害倍率', min: 0, max: 3, step: 0.1 },
  { key: 'turbDmgMul', label: '⚡ 亂流傷害倍率', min: 0, max: 3, step: 0.1 },
  { key: 'enemyCap', label: '🤖 敵機難度上限', min: 0.3, max: 1, step: 0.05 },
]);

const DEFAULTS = Object.freeze({ ...TUNING });

/** 套用一顆旋鈕（含需要同步到外部表的值）。 @param {string} key @param {number} v */
export function applyKnob(key, v) {
  if (!Number.isFinite(v) || !(key in TUNING)) return;
  /** @type {any} */ (TUNING)[key] = v;
  if (key === 'enemyCap') AI.CURVE_CAP = v; // 難度曲線直接吃 AI 表
}

/** 從 storage 載入覆寫並套用（壞資料忽略）。 @param {StorageLike} [storage] */
export function loadTuning(storage = localStorage) {
  try {
    const obj = JSON.parse(storage.getItem(KEY) ?? '{}');
    for (const [k, v] of Object.entries(obj || {})) applyKnob(k, Number(v));
  } catch { /* 壞資料＝用預設 */ }
}

/** 存目前值（只存與預設不同的鍵，乾淨）。 @param {StorageLike} [storage] */
export function saveTuning(storage = localStorage) {
  /** @type {Record<string, number>} */
  const diff = {};
  for (const k of Object.keys(DEFAULTS)) {
    if (/** @type {any} */ (TUNING)[k] !== /** @type {any} */ (DEFAULTS)[k]) diff[k] = /** @type {any} */ (TUNING)[k];
  }
  try { storage.setItem(KEY, JSON.stringify(diff)); } catch { /* ignore */ }
}

/** 還原全部預設並清 storage。 @param {StorageLike} [storage] */
export function resetTuning(storage = localStorage) {
  for (const [k, v] of Object.entries(DEFAULTS)) applyKnob(k, /** @type {number} */ (v));
  try { storage.removeItem?.(KEY); } catch { /* ignore */ }
}

/** 匯出目前值（定稿用：貼回源頭常數）。 @returns {string} */
export function exportTuning() { return JSON.stringify(TUNING, null, 2); }
