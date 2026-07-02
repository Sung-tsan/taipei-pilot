// @ts-check
// v5.2 polish 競速收集簿：per 賽道最佳成績 + 完賽次數 —— 純狀態 + 持久化，可注入 storage 測。
// 補 ROADMAP v2.1「完賽以慶祝呈現、未寫收集簿」的取捨回收：重玩有累積、破紀錄有回饋。
// courseKey ＝ `${airportId}:${raceType}`（賽道跟機場走；目前賽道在松山，未來 per-airport 賽道直接沿用）。

const KEY = 'tp_race_records';

/** @typedef {{ getItem:(k:string)=>string|null, setItem:(k:string,v:string)=>void }} StorageLike */
/** @typedef {{ bestMs:number, runs:number }} CourseRecord */
/** @typedef {Record<string, CourseRecord>} RaceRecords courseKey → 紀錄 */

/** @param {string} airportId @param {string} raceType */
export function courseKey(airportId, raceType) { return `${airportId}:${raceType}`; }

/** @param {StorageLike} [storage] @returns {RaceRecords} 壞資料 → 空表（不爆）。 */
export function loadRaceRecords(storage = localStorage) {
  try {
    const raw = storage.getItem(KEY);
    const obj = raw ? JSON.parse(raw) : {};
    /** @type {RaceRecords} */
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      const bestMs = Number(/** @type {any} */ (v)?.bestMs);
      const runs = Number(/** @type {any} */ (v)?.runs);
      if (Number.isFinite(bestMs) && bestMs > 0) out[k] = { bestMs, runs: Number.isFinite(runs) && runs > 0 ? Math.floor(runs) : 1 };
    }
    return out;
  } catch { return {}; }
}

/** @param {StorageLike} storage @param {RaceRecords} records */
export function saveRaceRecords(storage, records) {
  try { storage.setItem(KEY, JSON.stringify(records)); } catch { /* 滿/私隱模式：靜默 */ }
}

/**
 * 記一次完賽（原地改 records）。回傳是否破紀錄與前紀錄（給「新紀錄！」回饋）。
 * 異常時間（<=0 / NaN）不記、回 isNewBest=false。
 * @param {RaceRecords} records @param {string} key @param {number} finishMs
 * @returns {{ isNewBest:boolean, prevBestMs:number|null }}
 */
export function recordRaceRun(records, key, finishMs) {
  if (!Number.isFinite(finishMs) || finishMs <= 0) return { isNewBest: false, prevBestMs: records[key]?.bestMs ?? null };
  const cur = records[key];
  if (!cur) {
    records[key] = { bestMs: finishMs, runs: 1 };
    return { isNewBest: true, prevBestMs: null };
  }
  cur.runs += 1;
  if (finishMs < cur.bestMs) {
    const prev = cur.bestMs;
    cur.bestMs = finishMs;
    return { isNewBest: true, prevBestMs: prev };
  }
  return { isNewBest: false, prevBestMs: cur.bestMs };
}
