// @ts-check
import { describe, it, expect } from 'vitest';
import { generateCity, mulberry32 } from '../src/display/scene/city-gen.js';
import { RIVERS, inRiverCorridor } from '../src/display/scene/rivers.js';
import { makeTaipei, latLngToXZ } from '../src/display/scene/taipei.js';

describe('mulberry32', () => {
  it('同 seed 決定性、不同 seed 不同序列', () => {
    const a1 = mulberry32(42), a2 = mulberry32(42), b = mulberry32(43);
    const s1 = [a1(), a1(), a1()];
    expect([a2(), a2(), a2()]).toEqual(s1);
    expect([b(), b(), b()]).not.toEqual(s1);
  });
});

describe('generateCity', () => {
  it('同 seed → 相同城市；建築量在合理範圍', () => {
    const c1 = generateCity({ seed: 7 });
    const c2 = generateCity({ seed: 7 });
    expect(c1.stats).toEqual(c2.stats);
    expect(c1.stats.buildings).toBeGreaterThan(1500); // 夠像城市
    expect(c1.stats.buildings).toBeLessThan(15000);   // 不爆量
  });

  it('河道走廊內無建築', () => {
    const city = generateCity({});
    for (const river of RIVERS) {
      for (const [x, z] of river.points) {
        expect(city.buildingAt(x, z)).toBeNull();
      }
    }
  });

  it('exclude 區內無建築', () => {
    const city = generateCity({ exclude: (x, z) => Math.hypot(x - 3000, z - 3000) < 1000 });
    for (let dx = -900; dx <= 900; dx += 300) {
      expect(city.buildingAt(3000 + dx, 3000)).toBeNull();
    }
  });

  it('heightAt：有樓處 > 0、河上 = 0', () => {
    const city = generateCity({});
    let found = 0;
    for (let x = -6000; x <= 6000; x += 500) {
      for (let z = -6000; z <= 6000; z += 500) {
        if (city.heightAt(x, z) > 0) found++;
      }
    }
    expect(found).toBeGreaterThan(30); // 隨機取樣打得到樓
    expect(city.heightAt(RIVERS[0].points[2][0], RIVERS[0].points[2][1])).toBe(0);
  });
});

describe('makeTaipei', () => {
  const taipei = makeTaipei();

  it('跑道中心可降落、機場區是低飛區、跑道上無樓', () => {
    expect(taipei.env.canLandHere(0, 0)).toBe(true);
    expect(taipei.env.inLowFlyZone(0, 0)).toBe(true);
    expect(taipei.env.groundY(0, 0)).toBe(0);
    expect(taipei.env.canLandHere(5000, 5000)).toBe(false);
  });

  it('101 站在正確位置且夠高（>450m，全場最高）', () => {
    const { x, z } = latLngToXZ(25.0339, 121.5645);
    const h = taipei.env.groundY(x, z);
    expect(h).toBeGreaterThan(450);
    const lm101 = taipei.landmarks.find((l) => l.name === '台北 101');
    expect(lm101).toBeTruthy();
    for (const lm of taipei.landmarks) {
      if (lm !== lm101) expect(lm.topY).toBeLessThan(/** @type {any} */ (lm101).topY);
    }
  });

  it('七個地標全部落在 10km 空域內', () => {
    expect(taipei.landmarks).toHaveLength(7);
    for (const lm of taipei.landmarks) {
      expect(Math.hypot(lm.x, lm.z)).toBeLessThan(6000);
    }
  });

  it('地標淨空：地標正下方查 solid 回傳的是地標自己（不是民宅）', () => {
    for (const lm of taipei.landmarks) {
      const hit = taipei.solidAt(lm.x, lm.z);
      expect(hit?.h).toBe(lm.topY);
    }
  });

  it('河流走廊覆蓋松機北側的基隆河', () => {
    expect(inRiverCorridor(600, -650)).toBe(true);  // 基隆河點位
    expect(inRiverCorridor(0, 0)).toBe(false);       // 跑道不在河裡
  });
});
