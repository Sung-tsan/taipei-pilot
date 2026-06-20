// @ts-check
// V5 油量機制：耗油、航程 gate、油盡一次性、油低警告。
import { describe, it, expect } from 'vitest';
import {
  makeFuel, rangeKm, routeFuelCostSec, canReach, fuelFrac, isLow, burn, burnRate, refuel, RANGE_K, LOW_FUEL_FRAC,
} from '../src/display/missions/fuel.js';

describe('油量基本', () => {
  it('makeFuel 滿油；fuelFrac=1；耗油後遞減', () => {
    const f = makeFuel(900);
    expect(f.sec).toBe(900);
    expect(fuelFrac(f)).toBe(1);
    burn(f, 450);
    expect(fuelFrac(f)).toBeCloseTo(0.5, 5);
  });

  it('burn 夾到 0、justEmptied 一次性（這次扣到 0 才 true）', () => {
    const f = makeFuel(10);
    let r = burn(f, 6); expect(r.empty).toBe(false); expect(r.justEmptied).toBe(false);
    r = burn(f, 6); expect(r.empty).toBe(true); expect(r.justEmptied).toBe(true); // 4→0
    r = burn(f, 1); expect(r.empty).toBe(true); expect(r.justEmptied).toBe(false); // 已空，不再 justEmptied
    expect(f.sec).toBe(0);
  });

  it('refuel 加滿', () => {
    const f = makeFuel(900); burn(f, 800); refuel(f);
    expect(f.sec).toBe(900);
  });

  it('isLow：≤ 門檻才低', () => {
    const f = makeFuel(100);
    expect(isLow(f)).toBe(false);
    burn(f, 100 * (1 - LOW_FUEL_FRAC) + 1); // 落到門檻下
    expect(isLow(f)).toBe(true);
  });

  it('burnRate：怠速耗一半、全油門 1.0', () => {
    expect(burnRate(0)).toBe(0.5);
    expect(burnRate(1)).toBe(1);
    expect(burnRate(0.5)).toBe(0.75);
  });
});

describe('航程 gate', () => {
  it('rangeKm = maxSec × K；routeFuelCostSec = 距離 / K（互逆）', () => {
    expect(rangeKm(1000)).toBeCloseTo(1000 * RANGE_K, 5);
    expect(routeFuelCostSec(rangeKm(1000))).toBeCloseTo(1000, 5);
  });

  it('canReach：滿油航程 ≥ 航線距離才飛得到（教練機飛不到最遠離島）', () => {
    // T-34C fuelSec 900 → range 162km；近線可達、遠離島不可
    expect(canReach(900, 130)).toBe(true);   // ~台中
    expect(canReach(900, 300)).toBe(false);  // ~金門（遠）
    // A330 fuelSec 3000 → range 540km → 全部可達
    expect(canReach(3000, 310)).toBe(true);
  });
});
