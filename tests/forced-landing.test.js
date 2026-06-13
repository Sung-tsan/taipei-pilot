// @ts-check
import { describe, it, expect } from 'vitest';
import {
  judgeForcedLanding, roadClearLength, roadLandable, onFuelEmpty, TERRAIN, T34C_DIMS,
} from '../src/display/flight/forced-landing.js';
import { P } from '../src/display/flight/flight-model.js';

describe('迫降地形 × 品質判定真值表', () => {
  it('建築 → 必墜毀', () => {
    expect(judgeForcedLanding({ terrain: TERRAIN.BUILDING, speed: 30, sinkRate: 0, bank: 0 })).toBe('destroyed');
  });

  it('水上輕降 → 濺水成功', () => {
    expect(judgeForcedLanding({ terrain: TERRAIN.WATER, speed: 30, sinkRate: 3, bank: 0.1 })).toBe('success');
  });

  it('公園/草地輕降 → 安全成功', () => {
    expect(judgeForcedLanding({ terrain: TERRAIN.PARK, speed: 30, sinkRate: 5, bank: 0.2 })).toBe('success');
    expect(judgeForcedLanding({ terrain: TERRAIN.GRASS, speed: 30, sinkRate: 5, bank: 0.2 })).toBe('success');
  });

  it('馬路：roadOk 才有機會成功；窄/短(roadOk=false) → 墜毀', () => {
    expect(judgeForcedLanding({ terrain: TERRAIN.ROAD, speed: 30, sinkRate: 2, bank: 0, roadOk: false })).toBe('destroyed');
    expect(judgeForcedLanding({ terrain: TERRAIN.ROAD, speed: 30, sinkRate: 2, bank: 0, roadOk: true })).toBe('success');
  });

  it('太陡/太快 → 即使地形對也受損(冒煙) → 更嚴重墜毀', () => {
    expect(judgeForcedLanding({ terrain: TERRAIN.GRASS, speed: 40, sinkRate: P.LAND_MAX_SINK * 2.5, bank: 0 })).toBe('smoking');
    expect(judgeForcedLanding({ terrain: TERRAIN.GRASS, speed: 40, sinkRate: P.LAND_MAX_SINK * 5, bank: 0 })).toBe('destroyed');
  });

  it('安全區比馬路寬鬆：同樣下沉率，草地成功、馬路只到冒煙', () => {
    const sink = P.LAND_MAX_SINK * 1.5; // 介於馬路嚴 / 安全寬之間
    expect(judgeForcedLanding({ terrain: TERRAIN.GRASS, speed: 30, sinkRate: sink, bank: 0 })).toBe('success');
    expect(judgeForcedLanding({ terrain: TERRAIN.ROAD, speed: 30, sinkRate: sink, bank: 0, roadOk: true })).toBe('smoking');
  });

  it('跑道 → 成功（既有落點）', () => {
    expect(judgeForcedLanding({ terrain: TERRAIN.RUNWAY, speed: 30, sinkRate: 10, bank: 0 })).toBe('success');
  });
});

describe('馬路幾何', () => {
  it('roadLandable：寬>翼展 且 長>=最短起降長', () => {
    expect(roadLandable(26, 300, T34C_DIMS)).toBe(true);
    expect(roadLandable(8, 300, T34C_DIMS)).toBe(false);  // 太窄
    expect(roadLandable(26, 100, T34C_DIMS)).toBe(false); // 太短
  });

  it('roadClearLength：沿軸累計連續道路（兩向）', () => {
    const sample = (/** @type {number} */ x) => (Math.abs(x) <= 200 ? TERRAIN.ROAD : TERRAIN.BUILDING);
    const len = roadClearLength((x) => sample(x), 0, 0, 'x', { step: 10, cap: 600 });
    expect(len).toBeGreaterThanOrEqual(400); // 自身10 + 左右各 ~200
    expect(len).toBeLessThanOrEqual(420);
  });

  it('roadClearLength：非道路立即停（只剩自身 step）', () => {
    expect(roadClearLength(() => TERRAIN.GRASS, 0, 0, 'x')).toBe(12);
  });
});

describe('onFuelEmpty stub（V5 油盡→迫降接點）', () => {
  it('回傳 forced flag、不丟例外（本輪僅 hook）', () => {
    expect(onFuelEmpty(0)).toEqual({ forced: true });
  });
});
