// @ts-check
// minimap 的純投影數學（worldToRadar）測試。
// canvas 繪製（Minimap.render）在 node 無 canvas，靠 e2e/HITL，這裡只做「不爆」的煙霧測。
import { describe, it, expect } from 'vitest';
import { worldToRadar, Minimap } from '../src/display/ui/minimap.js';
import { WORLD_RADIUS } from '../shared/constants.js';

const SIZE = 160;
const MARGIN = 8;
const R = SIZE / 2 - MARGIN; // 與 minimap.js 內部一致
const C = SIZE / 2;          // 圓心 px/py

describe('worldToRadar — 北朝上投影', () => {
  it('中心 (0,0) → 雷達正中央，未夾', () => {
    const p = worldToRadar(0, 0, { size: SIZE });
    expect(p.px).toBeCloseTo(C, 6);
    expect(p.py).toBeCloseTo(C, 6);
    expect(p.clamped).toBe(false);
  });

  it('正北 (x:0, z:-5000) → 上半（py < cy），px 仍居中', () => {
    const p = worldToRadar(0, -5000, { size: SIZE });
    expect(p.py).toBeLessThan(C);
    expect(p.px).toBeCloseTo(C, 6);
    expect(p.clamped).toBe(false);
  });

  it('正東 (x:5000, z:0) → 右半（px > cx），py 仍居中', () => {
    const p = worldToRadar(5000, 0, { size: SIZE });
    expect(p.px).toBeGreaterThan(C);
    expect(p.py).toBeCloseTo(C, 6);
    expect(p.clamped).toBe(false);
  });

  it('正南 (x:0, z:5000) → 下半（py > cy）', () => {
    const p = worldToRadar(0, 5000, { size: SIZE });
    expect(p.py).toBeGreaterThan(C);
    expect(p.clamped).toBe(false);
  });

  it('正西 (x:-5000, z:0) → 左半（px < cx）', () => {
    const p = worldToRadar(-5000, 0, { size: SIZE });
    expect(p.px).toBeLessThan(C);
    expect(p.clamped).toBe(false);
  });

  it('半徑等比：worldRadius 一半距離 → 落在半個 R 處', () => {
    const p = worldToRadar(0, -WORLD_RADIUS / 2, { size: SIZE });
    expect(C - p.py).toBeCloseTo(R / 2, 4);
  });

  it('剛好在 worldRadius 上 → 不夾，落在 R 邊緣', () => {
    const p = worldToRadar(0, -WORLD_RADIUS, { size: SIZE });
    expect(p.clamped).toBe(false);
    expect(Math.hypot(p.px - C, p.py - C)).toBeCloseTo(R, 4);
  });

  it('超界 (x:0, z:-99999) → clamped:true 且夾在半徑 R 上', () => {
    const p = worldToRadar(0, -99999, { size: SIZE });
    expect(p.clamped).toBe(true);
    expect(Math.hypot(p.px - C, p.py - C)).toBeCloseTo(R, 6);
    expect(p.py).toBeLessThan(C); // 仍在北（上半）
  });

  it('超界夾邊時保留方向角', () => {
    const x = 30000;
    const z = -40000; // 角度 = atan2(z, x) 應與夾後一致
    const p = worldToRadar(x, z, { size: SIZE });
    expect(p.clamped).toBe(true);
    const wantAng = Math.atan2(z, x);
    const gotAng = Math.atan2(p.py - C, p.px - C);
    expect(gotAng).toBeCloseTo(wantAng, 6);
  });

  it('NaN 輸入 → 回中心，不爆，不夾', () => {
    expect(() => worldToRadar(NaN, 0, { size: SIZE })).not.toThrow();
    const p1 = worldToRadar(NaN, 0, { size: SIZE });
    expect(p1.px).toBeCloseTo(C, 6);
    expect(p1.py).toBeCloseTo(C, 6);
    expect(p1.clamped).toBe(false);

    const p2 = worldToRadar(0, Infinity, { size: SIZE });
    expect(p2.px).toBeCloseTo(C, 6);
    expect(p2.py).toBeCloseTo(C, 6);
    expect(p2.clamped).toBe(false);
  });

  it('worldRadius<=0 等壞 opts → 回中心，不爆', () => {
    const p = worldToRadar(100, 100, { worldRadius: 0, size: SIZE });
    expect(p.px).toBeCloseTo(C, 6);
    expect(p.py).toBeCloseTo(C, 6);
    expect(p.clamped).toBe(false);
  });

  it('決定性：同輸入同輸出', () => {
    const a = worldToRadar(1234, -5678, { size: SIZE });
    const b = worldToRadar(1234, -5678, { size: SIZE });
    expect(a).toEqual(b);
  });

  it('opts.worldRadius 缺省 → 用 WORLD_RADIUS', () => {
    const def = worldToRadar(0, -WORLD_RADIUS, { size: SIZE });
    const exp = worldToRadar(0, -WORLD_RADIUS, { worldRadius: WORLD_RADIUS, size: SIZE });
    expect(def).toEqual(exp);
  });
});

describe('Minimap — 無 canvas 煙霧測（node 無 2d context）', () => {
  it('canvas=null → 建構不爆、render 安靜 return', () => {
    // @ts-expect-error 故意傳 null 測韌性
    const m = new Minimap(null, { size: SIZE });
    expect(() => m.render([{ x: 0, z: 0, kind: 'self' }])).not.toThrow();
  });

  it('getContext 回 null（無 2d）→ render 安靜 return', () => {
    const fakeCanvas = /** @type {any} */ ({ getContext: () => null });
    const m = new Minimap(fakeCanvas, { size: SIZE });
    expect(() => m.render([{ x: 1, z: 2, kind: 'enemy', heading: 1 }])).not.toThrow();
  });

  it('blips 非陣列 → 不爆', () => {
    const fakeCanvas = /** @type {any} */ ({
      getContext: () => null,
    });
    const m = new Minimap(fakeCanvas);
    // @ts-expect-error 故意傳壞值
    expect(() => m.render(undefined)).not.toThrow();
  });
});
