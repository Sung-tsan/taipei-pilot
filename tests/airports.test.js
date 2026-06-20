// @ts-check
// V5 航網地理 registry：九機場/九航線完整性 + 投影 + haversine + 與 weather profile 對齊。
import { describe, it, expect } from 'vitest';
import {
  AIRPORTS, AIRPORT_IDS, HOME_AIRPORT, DEMO_AIRPORTS, ROUTES, ROUTE_IDS,
  airport, route, routesFrom, routeOtherEnd, haversineKm, routeDistanceKm, mapXY, MAP_BOUNDS,
} from '../src/display/scene/airports.js';
import { WEATHER_PROFILES } from '../src/display/weather/weather.js';

describe('九機場 registry', () => {
  it('恰九機場，id 與 key 一致、欄位完整', () => {
    expect(AIRPORT_IDS).toHaveLength(9);
    for (const id of AIRPORT_IDS) {
      const a = AIRPORTS[id];
      expect(a.id).toBe(id);
      expect(typeof a.name).toBe('string');
      expect(a.icao).toMatch(/^RC[A-Z]{2}$/); // 台灣 ICAO 字首 RC
      expect(a.lat).toBeGreaterThan(21); expect(a.lat).toBeLessThan(27);
      expect(a.lng).toBeGreaterThan(118); expect(a.lng).toBeLessThan(123);
      expect(a.runway.lengthM).toBeGreaterThan(0);
      expect(['city', 'coast', 'island', 'mountain']).toContain(a.terrain);
    }
  });

  it('松山＝母場（home）；demo 三場＝松山/高雄/金門', () => {
    expect(HOME_AIRPORT).toBe('tsa');
    expect(AIRPORTS.tsa.home).toBe(true);
    expect([...DEMO_AIRPORTS].sort()).toEqual(['khh', 'knh', 'tsa']);
  });

  it('每機場的 weather key 都存在於 WEATHER_PROFILES（跨模組對齊）', () => {
    for (const id of AIRPORT_IDS) expect(WEATHER_PROFILES[AIRPORTS[id].weather]).toBeTruthy();
  });

  it('未知 id → 退回母場（不爆）', () => {
    expect(airport('does-not-exist')).toBe(AIRPORTS[HOME_AIRPORT]);
  });

  it('馬祖南竿＝最短跑道（最難）；桃園/台中＝長跑道（入門/進階）', () => {
    const lens = AIRPORT_IDS.map((id) => AIRPORTS[id].runway.lengthM);
    expect(AIRPORTS.lzn.runway.lengthM).toBe(Math.min(...lens));
    expect(AIRPORTS.tpe.runway.lengthM).toBeGreaterThan(AIRPORTS.tsa.runway.lengthM);
  });
});

describe('九航線（航網收集）', () => {
  it('恰九航線；from/to 皆有效機場；id 唯一', () => {
    expect(ROUTES).toHaveLength(9);
    expect(new Set(ROUTE_IDS).size).toBe(9);
    for (const r of ROUTES) {
      expect(AIRPORT_IDS).toContain(r.from);
      expect(AIRPORT_IDS).toContain(r.to);
      expect(r.from).not.toBe(r.to);
    }
  });

  it('九航線覆蓋全部九機場（航網全連通＝全通才有意義）', () => {
    const covered = new Set();
    for (const r of ROUTES) { covered.add(r.from); covered.add(r.to); }
    expect([...covered].sort()).toEqual([...AIRPORT_IDS].sort());
  });

  it('route facts 標 DRAFT 待 Sung 校稿（教訓 B5）', () => {
    for (const r of ROUTES) expect(r.fact.draft).toBe(true);
  });

  it('routesFrom 雙向（可去可回）；routeOtherEnd 取另一端', () => {
    const fromTsa = routesFrom('tsa');
    expect(fromTsa.length).toBeGreaterThan(0);
    // 高雄→澎湖航線：在高雄與澎湖兩端都查得到
    const khhMzg = route('khh-mzg');
    expect(khhMzg).toBeTruthy();
    expect(routesFrom('khh')).toContain(khhMzg);
    expect(routesFrom('mzg')).toContain(khhMzg);
    expect(routeOtherEnd(/** @type {any} */(khhMzg), 'khh')).toBe('mzg');
    expect(routeOtherEnd(/** @type {any} */(khhMzg), 'mzg')).toBe('khh');
  });
});

describe('全圖投影 + 航程', () => {
  it('haversine：松山↔高雄 ~250-320km（南北幹線）', () => {
    const km = routeDistanceKm('tsa', 'khh');
    expect(km).toBeGreaterThan(250);
    expect(km).toBeLessThan(340);
    expect(haversineKm(25, 121, 25, 121)).toBe(0); // 同點＝0
  });

  it('mapXY 皆落在 [0,1]；地理相對位置正確（松山在金門東邊、在高雄北邊）', () => {
    for (const id of AIRPORT_IDS) {
      const p = mapXY(AIRPORTS[id].lat, AIRPORTS[id].lng);
      expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(1);
    }
    const tsa = mapXY(AIRPORTS.tsa.lat, AIRPORTS.tsa.lng);
    const knh = mapXY(AIRPORTS.knh.lat, AIRPORTS.knh.lng);
    const khh = mapXY(AIRPORTS.khh.lat, AIRPORTS.khh.lng);
    expect(knh.x).toBeLessThan(tsa.x); // 金門在西（x 小）
    expect(tsa.y).toBeLessThan(khh.y); // 松山在北（y 小，y 向下）
  });

  it('MAP_BOUNDS 含括所有機場（投影不被夾邊）', () => {
    for (const id of AIRPORT_IDS) {
      const a = AIRPORTS[id];
      expect(a.lat).toBeGreaterThanOrEqual(MAP_BOUNDS.latMin);
      expect(a.lat).toBeLessThanOrEqual(MAP_BOUNDS.latMax);
      expect(a.lng).toBeGreaterThanOrEqual(MAP_BOUNDS.lngMin);
      expect(a.lng).toBeLessThanOrEqual(MAP_BOUNDS.lngMax);
    }
  });
});
