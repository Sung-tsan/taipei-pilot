// @ts-check
// 翻滾閃避（barrel roll）狀態機 —— 純邏輯直測（觸發/冷卻/閃避窗/視覺滾轉/方向）。
import { describe, it, expect } from 'vitest';
import {
  makeDodge, dodgeReady, triggerDodge, dodging, dodgePhase, dodgeRoll, DODGE,
} from '../src/display/combat/maneuver.js';

describe('翻滾閃避 maneuver', () => {
  it('新狀態可立即觸發；觸發後進入閃避窗', () => {
    const d = makeDodge();
    expect(dodgeReady(d, 0)).toBe(true);
    expect(dodging(d, 0)).toBe(false);
    expect(triggerDodge(d, 1000)).toBe(true);
    expect(dodging(d, 1000)).toBe(true);
    expect(dodging(d, 1000 + DODGE.DURATION_MS - 1)).toBe(true);
    expect(dodging(d, 1000 + DODGE.DURATION_MS)).toBe(false); // 窗結束
  });

  it('冷卻：窗內/冷卻內不可再觸發，冷卻過後可再翻', () => {
    const d = makeDodge();
    triggerDodge(d, 0);
    expect(triggerDodge(d, 100)).toBe(false); // 窗內
    const stillCooling = DODGE.DURATION_MS + DODGE.COOLDOWN_MS - 1;
    expect(dodgeReady(d, stillCooling)).toBe(false);
    expect(triggerDodge(d, stillCooling)).toBe(false);
    const ready = DODGE.DURATION_MS + DODGE.COOLDOWN_MS;
    expect(dodgeReady(d, ready)).toBe(true);
    expect(triggerDodge(d, ready)).toBe(true);
  });

  it('方向：dir>=0→右(+1)、dir<0→左(-1)；滾轉量符號跟著 dir', () => {
    const right = makeDodge(); triggerDodge(right, 0, 1);
    const left = makeDodge(); triggerDodge(left, 0, -1);
    expect(right.dir).toBe(1);
    expect(left.dir).toBe(-1);
    const mid = DODGE.DURATION_MS / 2;
    expect(dodgeRoll(right, mid)).toBeGreaterThan(0);
    expect(dodgeRoll(left, mid)).toBeLessThan(0);
  });

  it('視覺滾轉：窗外＝0、起點≈0、終點回正(≡2π整圈)；進度單調 0..1', () => {
    const d = makeDodge();
    expect(dodgeRoll(d, 0)).toBe(0);     // 還沒觸發
    triggerDodge(d, 0, 1);
    expect(dodgeRoll(d, 0)).toBeCloseTo(0, 5);                 // 起點回正
    expect(dodgePhase(d, DODGE.DURATION_MS / 2)).toBeCloseTo(0.5, 5);
    // 終點：轉滿一圈（2π·TURNS）
    expect(dodgeRoll(d, DODGE.DURATION_MS - 1)).toBeCloseTo(DODGE.TURNS * 2 * Math.PI, 1);
    expect(dodgeRoll(d, DODGE.DURATION_MS)).toBe(0);           // 窗外＝0
  });

  it('安全網：壞輸入不爆（NaN now / null 狀態）', () => {
    expect(dodgeReady(/** @type {any} */ (null), 0)).toBe(false);
    expect(dodging(/** @type {any} */ (null), 0)).toBe(false);
    expect(dodgeRoll(/** @type {any} */ (null), 0)).toBe(0);
    const d = makeDodge();
    expect(triggerDodge(d, /** @type {any} */ (NaN))).toBe(true); // NaN now → 視為 0，仍可觸發
    expect(Number.isFinite(dodgeRoll(d, /** @type {any} */ (NaN)))).toBe(true);
  });
});
