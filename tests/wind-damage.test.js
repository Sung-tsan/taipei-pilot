// @ts-check
import { describe, it, expect } from 'vitest';
import { crosswindDamagePct, turbulenceDamagePct } from '../src/display/flight/wind-damage.js';

describe('crosswindDamagePct（側風劣質著陸）', () => {
  it('中線容差內 + 不超速 → 0（磁吸接住）', () => {
    expect(crosswindDamagePct({ offsetM: 20, speedMps: 50 })).toBe(0); // tol 30 / max 60
  });
  it('偏離越多、越快 → 受損% 越大', () => {
    const small = crosswindDamagePct({ offsetM: 50, speedMps: 50 });
    const big = crosswindDamagePct({ offsetM: 90, speedMps: 75 });
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThanOrEqual(100);
  });
  it('壞輸入不爆、夾在 0..100', () => {
    expect(crosswindDamagePct({ offsetM: NaN, speedMps: NaN })).toBe(0);
    expect(crosswindDamagePct({ offsetM: 9999, speedMps: 9999 })).toBe(100);
  });
});

describe('turbulenceDamagePct（甩出安全包絡）', () => {
  it('包絡內 → 0（磁吸接住）', () => {
    expect(turbulenceDamagePct({ bank: 0.8, pitch: 0.3 })).toBe(0); // safe 1.1 / 0.6
  });
  it('甩超安全角 → 受損% 隨超量增加', () => {
    const a = turbulenceDamagePct({ bank: 1.3, pitch: 0.3 });
    const b = turbulenceDamagePct({ bank: 1.6, pitch: 0.9 });
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
  });
});
