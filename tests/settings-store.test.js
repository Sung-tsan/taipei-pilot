// @ts-check
import { describe, it, expect } from 'vitest';
import { loadSettings, saveSettings, DEFAULTS } from '../src/display/ui/settings-store.js';

/** @param {Record<string,string>} [init] */
function mockStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (/** @type {string} */ k) => m.get(k) ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => { m.set(k, v); },
  };
}

describe('settings-store（後果軸持久化）', () => {
  it('空 storage → 預設（safe / 3 / 鏡頭晃動開）', () => {
    expect(loadSettings(mockStorage())).toEqual({ mode: DEFAULTS.mode, heartsMax: 3, camShake: true });
  });

  it('讀回 gentle + 上限 4', () => {
    const s = mockStorage({ tp_consequence_mode: 'gentle', tp_mishap_limit: '4' });
    expect(loadSettings(s)).toEqual({ mode: 'gentle', heartsMax: 4, camShake: true });
  });

  it('上限 inf → Infinity', () => {
    const s = mockStorage({ tp_consequence_mode: 'gentle', tp_mishap_limit: 'inf' });
    expect(loadSettings(s).heartsMax).toBe(Infinity);
  });

  it('壞值 → 退回預設（mode hacker / limit 99 都不採信）', () => {
    expect(loadSettings(mockStorage({ tp_consequence_mode: 'hacker', tp_mishap_limit: '99' })))
      .toEqual({ mode: 'safe', heartsMax: 3, camShake: true });
  });

  it('鏡頭晃動可關、save→load 保留', () => {
    const s = mockStorage();
    saveSettings(s, { mode: 'real', heartsMax: 3, camShake: false });
    expect(loadSettings(s).camShake).toBe(false);
  });

  it('save → load 往返（含 Infinity）', () => {
    const s = mockStorage();
    saveSettings(s, { mode: 'real', heartsMax: Infinity, camShake: true });
    expect(loadSettings(s)).toEqual({ mode: 'real', heartsMax: Infinity, camShake: true });
    saveSettings(s, { mode: 'gentle', heartsMax: 2, camShake: false });
    expect(loadSettings(s)).toEqual({ mode: 'gentle', heartsMax: 2, camShake: false });
  });
});
