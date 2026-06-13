// @ts-check
import { describe, it, expect } from 'vitest';
import { makeConsequence, setMode, setHeartsMax, registerMishap } from '../src/display/flight/consequence.js';

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
});
