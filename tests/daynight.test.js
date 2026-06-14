// @ts-check
import { describe, it, expect } from 'vitest';
import { TIMES_OF_DAY, dayNightParams, makeDayNight, DEFAULT_TIME } from '../src/display/weather/daynight.js';

describe('daynight 參數（純氛圍）', () => {
  it('三時段：白天/黃昏/夜', () => {
    expect(TIMES_OF_DAY).toEqual(['day', 'dusk', 'night']);
    expect(makeDayNight().time).toBe(DEFAULT_TIME);
  });
  it('白天＝不染色不夜燈；夜＝壓暗+染深藍+夜燈亮', () => {
    const day = dayNightParams('day');
    expect(day.tintAmt).toBe(0);
    expect(day.nightLights).toBe(false);
    const night = dayNightParams('night');
    expect(night.nightLights).toBe(true);
    expect(night.sunMul).toBeLessThan(day.sunMul);   // 夜更暗
    expect(night.tintAmt).toBeGreaterThan(0.5);       // 強烈染夜色
  });
  it('黃昏介於白天與夜之間（漸暗）', () => {
    const { sunMul: d } = dayNightParams('day');
    const { sunMul: k } = dayNightParams('dusk');
    const { sunMul: n } = dayNightParams('night');
    expect(k).toBeLessThan(d);
    expect(k).toBeGreaterThan(n);
  });
  it('未知時段 → 退回白天（不爆）', () => {
    expect(dayNightParams('???')).toEqual(dayNightParams('day'));
  });
});
