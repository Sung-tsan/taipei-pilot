// @ts-check
// P0-2：民航機敘事鎖（不可空戰 / 選單隱藏）純函式守門。
import { describe, it, expect } from 'vitest';
import {
  isCivilPlane, civilBlocksDogfight, coercePlayModeForPlane, showDogfightInModeMenu,
} from '../src/display/planes/civil-mode.js';

describe('civil-mode P0-2 敘事鎖', () => {
  it('isCivilPlane：airliner＝true，cartoon/combat＝false', () => {
    expect(isCivilPlane('atr72')).toBe(true);
    expect(isCivilPlane('b737')).toBe(true);
    expect(isCivilPlane('a330')).toBe(true);
    expect(isCivilPlane('t34c')).toBe(false);
    expect(isCivilPlane('f16')).toBe(false);
  });

  it('civilBlocksDogfight 與 isCivilPlane 一致', () => {
    expect(civilBlocksDogfight('a330')).toBe(true);
    expect(civilBlocksDogfight('f16')).toBe(false);
  });

  it('coercePlayModeForPlane：民航＋dogfight → fallback；其餘原樣', () => {
    expect(coercePlayModeForPlane('atr72', 'dogfight')).toBe('free');
    expect(coercePlayModeForPlane('atr72', 'dogfight', 'mission')).toBe('mission');
    expect(coercePlayModeForPlane('atr72', 'free')).toBe('free');
    expect(coercePlayModeForPlane('atr72', 'race')).toBe('race');
    expect(coercePlayModeForPlane('f16', 'dogfight')).toBe('dogfight');
    expect(coercePlayModeForPlane('t34c', 'dogfight', 'mission')).toBe('dogfight');
  });

  it('showDogfightInModeMenu：民航隱藏、戰鬥機顯示', () => {
    expect(showDogfightInModeMenu('b737')).toBe(false);
    expect(showDogfightInModeMenu('a330')).toBe(false);
    expect(showDogfightInModeMenu('f16')).toBe(true);
    expect(showDogfightInModeMenu('t34c')).toBe(true);
  });
});
