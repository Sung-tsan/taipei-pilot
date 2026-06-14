// @ts-check
import { describe, it, expect } from 'vitest';
import {
  WEATHER_TYPES, WEATHER_PROFILES, weatherProfile, makeWeather,
  gateProbs, rollWeather, isRough, weatherForces, DEFAULT_AIRPORT,
} from '../src/display/weather/weather.js';

describe('weatherProfile / 登記', () => {
  it('松山(tsa) 數值已定、機率和≈1；其餘機場標 DRAFT', () => {
    expect(WEATHER_PROFILES.tsa.draft).toBe(false);
    const p = WEATHER_PROFILES.tsa.probs;
    expect(p.clear + p.cloudy + p.rain + p.fog).toBeCloseTo(1, 5);
    const others = Object.keys(WEATHER_PROFILES).filter((k) => k !== 'tsa');
    expect(others.length).toBeGreaterThanOrEqual(5); // schema 支援多機場（航網 V5）
    for (const k of others) expect(WEATHER_PROFILES[k].draft).toBe(true);
  });

  it('未知機場 → 退回松山（不爆）', () => {
    expect(weatherProfile('nope')).toBe(WEATHER_PROFILES[DEFAULT_AIRPORT]);
  });

  it('makeWeather 起始＝晴；isRough 只認雨/霧', () => {
    expect(makeWeather().type).toBe(WEATHER_TYPES.CLEAR);
    expect(isRough(WEATHER_TYPES.RAIN)).toBe(true);
    expect(isRough(WEATHER_TYPES.FOG)).toBe(true);
    expect(isRough(WEATHER_TYPES.CLEAR)).toBe(false);
    expect(isRough(WEATHER_TYPES.CLOUDY)).toBe(false);
  });
});

describe('gateProbs（後果軸天氣閘）', () => {
  const base = { clear: 0.5, cloudy: 0.28, rain: 0.14, fog: 0.08 };
  it('安全＝永遠晴', () => {
    expect(gateProbs(base, 'safe')).toEqual({ clear: 1, cloudy: 0, rain: 0, fog: 0 });
  });
  it('溫和＝拿掉雨/霧、重新正規化（和=1）', () => {
    const g = gateProbs(base, 'gentle');
    expect(g.rain).toBe(0);
    expect(g.fog).toBe(0);
    expect(g.clear + g.cloudy).toBeCloseTo(1, 5);
    expect(g.clear).toBeCloseTo(0.5 / 0.78, 5);
  });
  it('真實＝全開、正規化（和=1、雨霧>0）', () => {
    const g = gateProbs(base, 'real');
    expect(g.clear + g.cloudy + g.rain + g.fog).toBeCloseTo(1, 5);
    expect(g.rain).toBeGreaterThan(0);
    expect(g.fog).toBeGreaterThan(0);
  });
});

describe('rollWeather', () => {
  it('安全模式：任何 rng 都回晴', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      expect(rollWeather(WEATHER_PROFILES.tsa, 'safe', () => r)).toBe(WEATHER_TYPES.CLEAR);
    }
  });
  it('溫和模式：永不回雨/霧', () => {
    for (let i = 0; i < 20; i++) {
      const t = rollWeather(WEATHER_PROFILES.tsa, 'gentle', () => i / 20);
      expect([WEATHER_TYPES.CLEAR, WEATHER_TYPES.CLOUDY]).toContain(t);
    }
  });
  it('真實模式：rng 落在各區間 → 對應天氣（確定性）', () => {
    // tsa real 正規化＝原值（和已=1）：clear[0,.5) cloudy[.5,.78) rain[.78,.92) fog[.92,1)
    expect(rollWeather(WEATHER_PROFILES.tsa, 'real', () => 0.10)).toBe(WEATHER_TYPES.CLEAR);
    expect(rollWeather(WEATHER_PROFILES.tsa, 'real', () => 0.60)).toBe(WEATHER_TYPES.CLOUDY);
    expect(rollWeather(WEATHER_PROFILES.tsa, 'real', () => 0.85)).toBe(WEATHER_TYPES.RAIN);
    expect(rollWeather(WEATHER_PROFILES.tsa, 'real', () => 0.96)).toBe(WEATHER_TYPES.FOG);
  });
  it('壞 rng（NaN/超界）→ 安全側回晴，不爆', () => {
    expect(rollWeather(WEATHER_PROFILES.tsa, 'real', () => NaN)).toBe(WEATHER_TYPES.CLEAR);
    expect(rollWeather(WEATHER_PROFILES.tsa, 'real', () => 5)).toBe(WEATHER_TYPES.CLEAR);
  });
});

describe('weatherForces（天氣→側風/亂流強度）', () => {
  it('晴＝無風無亂流；雨最兇、霧/多雲較弱', () => {
    expect(weatherForces(WEATHER_TYPES.CLEAR)).toEqual({ windSpeed: 0, turb: 0 });
    const rain = weatherForces(WEATHER_TYPES.RAIN);
    const fog = weatherForces(WEATHER_TYPES.FOG);
    expect(rain.windSpeed).toBeGreaterThan(0);
    expect(rain.turb).toBeGreaterThan(fog.turb); // 雨亂流 > 霧
  });
  it('未知型別 → 無風（安全側）', () => {
    expect(weatherForces('???')).toEqual({ windSpeed: 0, turb: 0 });
  });
});
