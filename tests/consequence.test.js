// @ts-check
import { describe, it, expect } from 'vitest';
import { makeConsequence, setMode, setHeartsMax, registerMishap, addDamagePct, deriveDamage, SMOKE_PCT } from '../src/display/flight/consequence.js';

describe('後果軸 reducer（safe / gentle / real）', () => {
  it('safe：撞擊永遠彈開、不墜、不扣', () => {
    const c = makeConsequence('safe', 3);
    for (let i = 0; i < 5; i++) expect(registerMishap(c)).toEqual({ outcome: 'bounce', reset: false });
    expect(c.damage).toBe('intact');
  });

  it('gentle：每撞 ❤️−1；歸零 → 補滿 + 回機場(reset)', () => {
    const c = makeConsequence('gentle', 3);
    expect(c.hearts).toBe(3);
    expect(registerMishap(c)).toEqual({ outcome: 'heart_loss', reset: false });
    expect(c.hearts).toBe(2);
    registerMishap(c); // → 1
    const r = registerMishap(c); // → 0 → reset
    expect(r).toEqual({ outcome: 'reset', reset: true });
    expect(c.hearts).toBe(3); // 補滿
  });

  it('gentle ∞ 上限：永不歸零', () => {
    const c = makeConsequence('gentle', Infinity);
    for (let i = 0; i < 20; i++) expect(registerMishap(c).reset).toBe(false);
    expect(c.hearts).toBe(Infinity);
  });

  it('real：intact→smoking(續飛)→destroyed(墜毀reset，damage 重置)', () => {
    const c = makeConsequence('real', 3);
    expect(c.damage).toBe('intact');
    expect(registerMishap(c)).toEqual({ outcome: 'smoke', reset: false });
    expect(c.damage).toBe('smoking');
    expect(registerMishap(c)).toEqual({ outcome: 'destroy', reset: true });
    expect(c.damage).toBe('intact'); // 回跑道重置，下次又是 intact→smoke
    expect(registerMishap(c).outcome).toBe('smoke');
  });

  it('setMode 切換：重置 damage + 補/清 ❤️（三檔獨立）', () => {
    const c = makeConsequence('real', 2);
    registerMishap(c); // smoking
    setMode(c, 'gentle');
    expect(c.damage).toBe('intact');
    expect(c.hearts).toBe(2);
    setMode(c, 'safe');
    expect(c.hearts).toBe(0);
  });

  it('setHeartsMax：gentle 即時補滿到新上限', () => {
    const c = makeConsequence('gentle', 3);
    registerMishap(c); // 2
    setHeartsMax(c, 5);
    expect(c.heartsMax).toBe(5);
    expect(c.hearts).toBe(5);
  });

  // —— v3.0-2：受損百分比（離散 damage 由 % 派生）——
  it('deriveDamage：<40 intact、≥40 smoking、=100 destroyed', () => {
    expect(deriveDamage(0)).toBe('intact');
    expect(deriveDamage(SMOKE_PCT - 1)).toBe('intact');
    expect(deriveDamage(SMOKE_PCT)).toBe('smoking');
    expect(deriveDamage(100)).toBe('destroyed');
  });

  it('addDamagePct（real）：累加 → 跨 40% 冒煙 → 達 100% 毀(reset 並清零)', () => {
    const c = makeConsequence('real', 0);
    expect(addDamagePct(c, 20)).toEqual({ outcome: 'damage', reset: false }); // 20% 未跨檻
    expect(c.damage).toBe('intact');
    expect(addDamagePct(c, 25).outcome).toBe('smoke'); // 45% → 冒煙
    expect(c.damage).toBe('smoking');
    const r = addDamagePct(c, 60); // 105→100 → 毀
    expect(r).toEqual({ outcome: 'destroy', reset: true });
    expect(c.damagePct).toBe(0); // 重置
    expect(c.damage).toBe('intact');
  });

  it('addDamagePct：安全/溫和不受天氣傷（bounce、不累加）', () => {
    const safe = makeConsequence('safe', 3);
    expect(addDamagePct(safe, 80)).toEqual({ outcome: 'bounce', reset: false });
    expect(safe.damagePct).toBe(0);
    const gentle = makeConsequence('gentle', 3);
    expect(addDamagePct(gentle, 80).outcome).toBe('bounce');
    expect(gentle.damagePct).toBe(0);
  });

  it('registerMishap real 同步 damagePct（碰撞也走同一條 damage）', () => {
    const c = makeConsequence('real', 0);
    registerMishap(c); // intact→smoking
    expect(c.damage).toBe('smoking');
    expect(c.damagePct).toBeGreaterThanOrEqual(SMOKE_PCT);
    registerMishap(c); // →destroy
    expect(c.damagePct).toBe(0);
  });
});
