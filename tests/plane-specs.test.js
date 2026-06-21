// @ts-check
// 機型諸元登記表：登記正確性 + 「T-34C 手感位元不變」鐵律的回歸守門。
import { describe, it, expect } from 'vitest';
import { P, makePlane, makeFlatEnv, stepPlane } from '../src/display/flight/flight-model.js';
import {
  PLANE_SPECS, PLANE_IDS, DEFAULT_PLANE, planeSpec, flightParams, isGlbModel,
} from '../src/display/planes/plane-specs.js';

const DT = 1 / 60;
const env = makeFlatEnv();

describe('plane-specs 登記', () => {
  it('PLANE_IDS 至少含 t34c + f16 + atr72，且每個 id 都有 spec', () => {
    expect(PLANE_IDS).toContain('t34c');
    expect(PLANE_IDS).toContain('f16');
    expect(PLANE_IDS).toContain('atr72');
    for (const id of PLANE_IDS) expect(PLANE_SPECS[id].id).toBe(id);
  });

  it('未知 id → 退回預設機（不爆）', () => {
    expect(planeSpec('does-not-exist')).toBe(PLANE_SPECS[DEFAULT_PLANE]);
  });

  it('每架都起得來：GROUND_TOP >= V_ROTATE（滾行極速須達離地速，否則永遠起不來）', () => {
    for (const id of PLANE_IDS) {
      const p = flightParams(id);
      expect(p.GROUND_TOP).toBeGreaterThanOrEqual(p.V_ROTATE); // 回歸守 A330 GROUND_TOP<V_ROTATE 的坑（接地判定用 >=）
    }
  });

  it('每個 spec 都有完整欄位（name/tone/dims/fuelSec/model）；voxel 機有 body/gear、GLB 機有 glb/lengthM', () => {
    for (const id of PLANE_IDS) {
      const s = planeSpec(id);
      expect(typeof s.name).toBe('string');
      expect(['cartoon', 'combat', 'airliner']).toContain(s.tone);
      expect(s.dims.wingspan).toBeGreaterThan(0);
      expect(s.dims.minRunwayLength).toBeGreaterThan(0);
      expect(s.fuelSec).toBeGreaterThan(0);
      if (isGlbModel(s.model)) {
        expect(s.model.glb).toMatch(/\.glb$/);
        expect(s.model.lengthM).toBeGreaterThan(0);
      } else {
        expect(s.model.body).toBeTruthy();
        expect(s.model.gear).toBeTruthy();
      }
    }
  });

  it('T-34C 有螺旋槳、F-16 無（噴射機）', () => {
    const t = planeSpec('t34c').model; const f = planeSpec('f16').model;
    expect(isGlbModel(t) || isGlbModel(f)).toBe(false); // 兩者皆 voxel
    if (!isGlbModel(t)) { expect(t.prop).toBeTruthy(); expect(t.propPos).toBeTruthy(); }
    if (!isGlbModel(f)) expect(f.prop).toBeUndefined();
  });

  it('ATR-72＝GLB 民航機（airliner tone、長跑道、寬翼展）', () => {
    const s = planeSpec('atr72');
    expect(s.tone).toBe('airliner');
    expect(isGlbModel(s.model)).toBe(true);
    expect(s.dims.minRunwayLength).toBeGreaterThan(planeSpec('f16').dims.minRunwayLength); // 民航機要更長跑道
    expect(s.dims.wingspan).toBeGreaterThan(planeSpec('f16').dims.wingspan);
  });

  it('A330＝GLB 廣體客機（airliner tone、比 ATR 更重：更長跑道、更寬翼展、更多油）', () => {
    const a = planeSpec('a330'); const atr = planeSpec('atr72');
    expect(a.tone).toBe('airliner');
    expect(isGlbModel(a.model)).toBe(true);
    expect(a.dims.minRunwayLength).toBeGreaterThan(atr.dims.minRunwayLength);
    expect(a.dims.wingspan).toBeGreaterThan(atr.dims.wingspan);
    expect(a.fuelSec).toBeGreaterThan(atr.fuelSec);
  });

  it('tone ladder：T-34C=cartoon、F-16=combat、ATR-72/B737/A330=airliner', () => {
    expect(planeSpec('t34c').tone).toBe('cartoon');
    expect(planeSpec('f16').tone).toBe('combat');
    expect(planeSpec('atr72').tone).toBe('airliner');
    expect(planeSpec('b737').tone).toBe('airliner');
    expect(planeSpec('a330').tone).toBe('airliner');
  });

  it('B737（V5.1-2）＝GLB 窄體幹線：airliner、大油箱（> ATR、< A330）、起得來', () => {
    const b = planeSpec('b737');
    expect(b.tone).toBe('airliner');
    expect(isGlbModel(b.model)).toBe(true);
    expect(b.fuelSec).toBeGreaterThan(planeSpec('atr72').fuelSec); // 大油箱（遠航線靠它）
    expect(b.fuelSec).toBeLessThan(planeSpec('a330').fuelSec);     // 仍小於廣體
    expect(flightParams('b737').GROUND_TOP).toBeGreaterThanOrEqual(flightParams('b737').V_ROTATE);
  });
});

describe('flightParams（機型手感疊覆寫）', () => {
  it('鐵律：T-34C 覆寫為空 → flightParams(t34c) 與 P 基準表逐位元一致', () => {
    expect(planeSpec('t34c').flight).toEqual({});
    expect(flightParams('t34c')).toEqual(P); // 所有手感 key 數值與 v1 完全相同
  });

  it('F-16 是不同的參數物件（更快/更靈活/更耗速度）', () => {
    const f = flightParams('f16');
    expect(f.V_MAX).toBeGreaterThan(P.V_MAX);       // 噴射機更快
    expect(f.MAX_BANK).toBeGreaterThan(P.MAX_BANK); // 更靈活
    expect(f.V_ROTATE).toBeGreaterThan(P.V_ROTATE); // 起飛速度更高
    expect(f).not.toBe(P); // 不是同一物件（不會污染基準表）
  });

  it('flightParams 不會就地改到 P（每次新物件）', () => {
    const before = P.V_MAX;
    flightParams('f16').V_MAX = 9999;
    expect(P.V_MAX).toBe(before);
  });
});

describe('多機型飛行回歸', () => {
  it('T-34C：帶 flightParams 與不帶 params 的 stepPlane 逐步逐位元一致（手感不變鐵律）', () => {
    const a = makePlane({ heading: Math.PI / 2 });
    const b = makePlane({ heading: Math.PI / 2 });
    const params = flightParams('t34c');
    const input = { r: 0.3, p: -0.2, th: 1, gearUp: false };
    for (let t = 0; t < 25; t += DT) {
      stepPlane(a, input, DT, env);          // 預設＝P（v1 路徑）
      stepPlane(b, input, DT, env, params);  // 機型路徑（T-34C 覆寫空）
      expect(b.pos.x).toBe(a.pos.x);
      expect(b.pos.y).toBe(a.pos.y);
      expect(b.pos.z).toBe(a.pos.z);
      expect(b.speed).toBe(a.speed);
      expect(b.heading).toBe(a.heading);
      expect(b.bank).toBe(a.bank);
      expect(b.pitch).toBe(a.pitch);
      expect(b.mode).toBe(a.mode);
    }
  });

  it('F-16 同樣滿油門飛行 → 巡航空速明顯高於 T-34C', () => {
    /** @param {string} id */
    const topSpeed = (id) => {
      const s = makePlane({ heading: Math.PI / 2 });
      const params = flightParams(id);
      for (let t = 0; t < 40; t += DT) {
        stepPlane(s, { r: 0, p: 0, th: 1, gearUp: true }, DT, env, params);
      }
      return s.speed;
    };
    const t34c = topSpeed('t34c');
    const f16 = topSpeed('f16');
    expect(f16).toBeGreaterThan(t34c + 15); // 噴射機顯著更快
  });
});
