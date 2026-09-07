// @ts-check
import { describe, it, expect } from 'vitest';
import { loadSettings, saveSettings, DEFAULTS, departPaceFromSettings } from '../src/display/ui/settings-store.js';

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
    expect(loadSettings(mockStorage())).toEqual({ mode: DEFAULTS.mode, heartsMax: 3, camShake: true, weather: 'auto', realisticMode: false });
  });

  it('讀回 gentle + 上限 4', () => {
    const s = mockStorage({ tp_consequence_mode: 'gentle', tp_mishap_limit: '4' });
    expect(loadSettings(s)).toEqual({ mode: 'gentle', heartsMax: 4, camShake: true, weather: 'auto', realisticMode: false });
  });

  it('上限 inf → Infinity', () => {
    const s = mockStorage({ tp_consequence_mode: 'gentle', tp_mishap_limit: 'inf' });
    expect(loadSettings(s).heartsMax).toBe(Infinity);
  });

  it('壞值 → 退回預設（mode hacker / limit 99 / weather 亂填 都不採信）', () => {
    expect(loadSettings(mockStorage({ tp_consequence_mode: 'hacker', tp_mishap_limit: '99', tp_weather_pref: 'sunny' })))
      .toEqual({ mode: 'safe', heartsMax: 3, camShake: true, weather: 'auto', realisticMode: false });
  });

  it('鏡頭晃動可關、save→load 保留', () => {
    const s = mockStorage();
    saveSettings(s, { mode: 'real', heartsMax: 3, camShake: false, weather: 'auto', realisticMode: false });
    expect(loadSettings(s).camShake).toBe(false);
  });

  it('天氣偏好可鎖定（關掉雨）、save→load 保留', () => {
    const s = mockStorage();
    saveSettings(s, { mode: 'real', heartsMax: 3, camShake: true, weather: 'clear', realisticMode: false });
    expect(loadSettings(s).weather).toBe('clear');
  });

  it('save → load 往返（含 Infinity + weather）', () => {
    const s = mockStorage();
    saveSettings(s, { mode: 'real', heartsMax: Infinity, camShake: true, weather: 'fog', realisticMode: false });
    expect(loadSettings(s)).toEqual({ mode: 'real', heartsMax: Infinity, camShake: true, weather: 'fog', realisticMode: false });
    saveSettings(s, { mode: 'gentle', heartsMax: 2, camShake: false, weather: 'auto', realisticMode: true });
    expect(loadSettings(s)).toEqual({ mode: 'gentle', heartsMax: 2, camShake: false, weather: 'auto', realisticMode: true });
  });
});

describe('settings-store：P1-6 真實模式', () => {
  it('預設 realisticMode=false（短航班）', () => {
    expect(DEFAULTS.realisticMode).toBe(false);
    expect(loadSettings(mockStorage()).realisticMode).toBe(false);
  });

  it('tp_realistic_mode=1 → true；其他／缺省 → false', () => {
    expect(loadSettings(mockStorage({ tp_realistic_mode: '1' })).realisticMode).toBe(true);
    expect(loadSettings(mockStorage({ tp_realistic_mode: '0' })).realisticMode).toBe(false);
    expect(loadSettings(mockStorage({ tp_realistic_mode: 'yes' })).realisticMode).toBe(false);
  });

  it('save→load 保留真實模式開關', () => {
    const s = mockStorage();
    saveSettings(s, { mode: 'safe', heartsMax: 3, camShake: true, weather: 'auto', realisticMode: true });
    expect(s.getItem('tp_realistic_mode')).toBe('1');
    expect(loadSettings(s).realisticMode).toBe(true);
    saveSettings(s, { mode: 'safe', heartsMax: 3, camShake: true, weather: 'auto', realisticMode: false });
    expect(s.getItem('tp_realistic_mode')).toBe('0');
    expect(loadSettings(s).realisticMode).toBe(false);
  });

  it('departPaceFromSettings：關→shortHaul、開→realistic', () => {
    expect(departPaceFromSettings(false)).toBe('shortHaul');
    expect(departPaceFromSettings(true)).toBe('realistic');
    expect(departPaceFromSettings({ realisticMode: false })).toBe('shortHaul');
    expect(departPaceFromSettings({ realisticMode: true })).toBe('realistic');
    expect(departPaceFromSettings({})).toBe('shortHaul');
  });
});
