// @ts-check
import { describe, it, expect } from 'vitest';
import {
  loadCollection, saveCollection, lightLandmark, recordMission, allLit, shouldCelebrate,
} from '../src/display/missions/collection-store.js';

/** @param {Record<string,string>} [init] */
function mockStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (/** @type {string} */ k) => m.get(k) ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => { m.set(k, v); },
  };
}

describe('collection-store（收集進度）', () => {
  it('空 storage → 空集合、未慶祝', () => {
    const c = loadCollection(mockStorage());
    expect(c.lit.size).toBe(0);
    expect(c.missionsDone.size).toBe(0);
    expect(c.celebrated).toBe(false);
  });

  it('點亮地標：新點亮回 true、重複回 false（全家共享去重）', () => {
    const c = loadCollection(mockStorage());
    expect(lightLandmark(c, 'taipei101')).toBe(true);
    expect(lightLandmark(c, 'taipei101')).toBe(false);
    expect(c.lit.has('taipei101')).toBe(true);
  });

  it('記錄任務：新完成回 true、重複回 false', () => {
    const c = loadCollection(mockStorage());
    expect(recordMission(c, 'find_taipei101')).toBe(true);
    expect(recordMission(c, 'find_taipei101')).toBe(false);
  });

  it('allLit：全點亮才 true', () => {
    const c = loadCollection(mockStorage());
    const all = ['a', 'b', 'c'];
    lightLandmark(c, 'a'); lightLandmark(c, 'b');
    expect(allLit(c, all)).toBe(false);
    lightLandmark(c, 'c');
    expect(allLit(c, all)).toBe(true);
  });

  it('shouldCelebrate：全點亮且未慶祝過＝一次性 gate', () => {
    const c = loadCollection(mockStorage());
    const all = ['a', 'b'];
    lightLandmark(c, 'a'); lightLandmark(c, 'b');
    expect(shouldCelebrate(c, all)).toBe(true);
    c.celebrated = true; // 慶祝過
    expect(shouldCelebrate(c, all)).toBe(false); // 不再轟炸（收集簿可重看）
  });

  it('save → load 往返（含雙人共享點亮與慶祝旗標）', () => {
    const s = mockStorage();
    const c = loadCollection(s);
    lightLandmark(c, 'a'); lightLandmark(c, 'b');
    recordMission(c, 'm1');
    c.celebrated = true;
    saveCollection(s, c);

    const c2 = loadCollection(s);
    expect([...c2.lit].sort()).toEqual(['a', 'b']);
    expect([...c2.missionsDone]).toEqual(['m1']);
    expect(c2.celebrated).toBe(true);
  });
});
