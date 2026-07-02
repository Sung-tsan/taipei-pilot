// @ts-check
// v5.2 競速收集簿：純狀態 + 注入 storage 直測（load/save/破紀錄/壞資料防護）。
import { describe, it, expect } from 'vitest';
import { courseKey, loadRaceRecords, saveRaceRecords, recordRaceRun } from '../src/display/missions/race-records.js';

/** 記憶體 storage（模仿 localStorage 介面）。 */
function memStorage() {
  /** @type {Record<string,string>} */ const m = {};
  return { getItem: (/** @type {string} */ k) => m[k] ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => { m[k] = v; } };
}

describe('race-records — 競速收集簿', () => {
  it('首次完賽＝新紀錄；再跑更快＝破紀錄（回前紀錄）；更慢＝只加次數', () => {
    /** @type {any} */ const rec = {};
    const key = courseKey('tsa', 'rings');
    expect(recordRaceRun(rec, key, 42000)).toEqual({ isNewBest: true, prevBestMs: null });
    expect(recordRaceRun(rec, key, 39000)).toEqual({ isNewBest: true, prevBestMs: 42000 });
    expect(recordRaceRun(rec, key, 50000).isNewBest).toBe(false);
    expect(rec[key]).toEqual({ bestMs: 39000, runs: 3 });
  });

  it('save → load 往返一致；不同賽道分開記', () => {
    const st = memStorage();
    /** @type {any} */ const rec = {};
    recordRaceRun(rec, courseKey('tsa', 'rings'), 40000);
    recordRaceRun(rec, courseKey('tsa', 'landmark'), 21000);
    saveRaceRecords(st, rec);
    expect(loadRaceRecords(st)).toEqual(rec);
  });

  it('壞資料防護：非法 JSON / 負時間 / NaN 都不爆、不污染', () => {
    const st = memStorage();
    st.setItem('tp_race_records', '{bad json');
    expect(loadRaceRecords(st)).toEqual({});
    st.setItem('tp_race_records', JSON.stringify({ 'tsa:rings': { bestMs: -5, runs: 2 }, 'tsa:landmark': { bestMs: 30000, runs: 'x' } }));
    const loaded = loadRaceRecords(st);
    expect(loaded['tsa:rings']).toBeUndefined();          // 負時間丟棄
    expect(loaded['tsa:landmark']).toEqual({ bestMs: 30000, runs: 1 }); // 壞 runs 回 1
    /** @type {any} */ const rec = {};
    expect(recordRaceRun(rec, 'k', NaN).isNewBest).toBe(false);
    expect(rec.k).toBeUndefined();
  });
});
