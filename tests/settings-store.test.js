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
  it('空 storage → 預設（safe / 3 / 鏡頭晃動開 / 天氣自動）', () => {
    expect(loadSettings(mockStorage())).toEqual({ mode: DEFAULTS.mode, heartsMax: 3, camShake: true, weather: 'auto' });
  });

  it('讀回 gentle + 上限 4', () => {
    const s = mockStorage({ tp_consequence_mode: 'gentle', tp_mishap_limit: '4' });
    expect(loadSettings(s)).toEqual({ mode: 'gentle', heartsMax: 4, camShake: true, weather: 'auto' });
  });

  it('上限 inf → Infinity', () => {
    const s = mockStorage({ tp_consequence_mode: 'gentle', tp_mishap_limit: 'inf' });
    expect(loadSettings(s).heartsMax).toBe(Infinity);
  });

  it('壞值 → 退回預設（mode hacker / limit 99 / weather 亂填 都不採信）', () => {
    expect(loadSettings(mockStorage({ tp_consequence_mode: 'hacker', tp_mishap_limit: '99', tp_weather_pref: 'sunny' })))
      .toEqual({ mode: 'safe', heartsMax: 3, camShake: true, weather: 'auto' });
  });

  it('鏡頭晃動可關、save→load 保留', () => {
    const s = mockStorage();
    saveSettings(s, { mode: 'real', heartsMax: 3, camShake: false, weather: 'auto' });
    expect(loadSettings(s).camShake).toBe(false);
  });

  it('天氣偏好可鎖定（關掉雨）、save→load 保留', () => {
    const s = mockStorage();
    saveSettings(s, { mode: 'real', heartsMax: 3, camShake: true, weather: 'clear' });
    expect(loadSettings(s).weather).toBe('clear');
  });

  it('save → load 往返（含 Infinity + weather）', () => {
    const s = mockStorage();
    saveSettings(s, { mode: 'real', heartsMax: Infinity, camShake: true, weather: 'fog' });
    expect(loadSettings(s)).toEqual({ mode: 'real', heartsMax: Infinity, camShake: true, weather: 'fog' });
    saveSettings(s, { mode: 'gentle', heartsMax: 2, camShake: false, weather: 'auto' });
    expect(loadSettings(s)).toEqual({ mode: 'gentle', heartsMax: 2, camShake: false, weather: 'auto' });
  });
});
