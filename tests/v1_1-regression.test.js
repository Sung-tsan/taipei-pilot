// @ts-check
// v1.1 整合回歸（教訓：bug fix 走 root-cause + 「沒修就會紅」守門）。
// 鎖三個曾被點名的退化點：後果軸誤切、迫降誤判、慶祝重複觸發。
import { describe, it, expect } from 'vitest';
import { makeConsequence, setMode, setHeartsMax, registerMishap } from '../src/display/flight/consequence.js';
import { judgeForcedLanding, roadLandable, TERRAIN, T34C_DIMS } from '../src/display/flight/forced-landing.js';
import { loadCollection, lightLandmark, shouldCelebrate } from '../src/display/missions/collection-store.js';

/** @param {Record<string,string>} [init] */
function mockStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (/** @type {string} */ k) => m.get(k) ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => { m.set(k, v); } };
}

describe('回歸：後果軸誤切', () => {
  it('安全模式 100 次撞擊都彈開：不扣血、不墜、不 reset', () => {
    const c = makeConsequence('safe', 3);
    for (let i = 0; i < 100; i++) {
      const r = registerMishap(c);
      expect(r).toEqual({ outcome: 'bounce', reset: false });
    }
    expect(c.damage).toBe('intact');
    expect(c.hearts).toBe(0);
  });

  it('模式來回切換：每次切回 gentle 都補滿到上限（不殘留舊 damage/血量）', () => {
    const c = makeConsequence('gentle', 3);
    registerMishap(c); // 2
    setMode(c, 'real'); registerMishap(c); // smoking
    setMode(c, 'gentle');
    expect(c.damage).toBe('intact');
    expect(c.hearts).toBe(3);
    setHeartsMax(c, 5); // 調上限即補滿
    expect(c.hearts).toBe(5);
  });
});

describe('回歸：迫降誤判', () => {
  it('建築永遠墜毀（任何速度/角度都不可生還）', () => {
    for (const speed of [10, 40, 65]) {
      for (const sinkRate of [0, 3, 20]) {
        for (const bank of [0, 0.3]) {
          expect(judgeForcedLanding({ terrain: TERRAIN.BUILDING, speed, sinkRate, bank })).toBe('destroyed');
        }
      }
    }
  });

  it('馬路長度邊界：恰達最短起降長可降、差一點就不行', () => {
    expect(roadLandable(26, T34C_DIMS.minRunwayLength, T34C_DIMS)).toBe(true);
    expect(roadLandable(26, T34C_DIMS.minRunwayLength - 1, T34C_DIMS)).toBe(false);
  });

  it('輕柔水上一定濺水成功（不可誤判成墜毀）', () => {
    expect(judgeForcedLanding({ terrain: TERRAIN.WATER, speed: 28, sinkRate: 2, bank: 0 })).toBe('success');
  });
});

describe('回歸：慶祝重複觸發', () => {
  it('台北飛透透只觸發一次（一次性 gate；之後再點亮也不再轟炸）', () => {
    const c = loadCollection(mockStorage());
    const all = ['a', 'b', 'c'];
    all.forEach((id) => lightLandmark(c, id));
    expect(shouldCelebrate(c, all)).toBe(true);
    c.celebrated = true; // 慶祝過
    expect(shouldCelebrate(c, all)).toBe(false);
    lightLandmark(c, 'a'); // 重複點亮（去重 no-op）
    expect(shouldCelebrate(c, all)).toBe(false); // 仍不再觸發
  });
});
