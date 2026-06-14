// @ts-check
// 氣球靶 voxel 模型 + 移動軌跡純函式的健全性測試。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildVoxelGeometry } from '../src/voxel/build.js';
import { balloonModel, balloonDriftPos } from '../src/voxel/models/balloon.js';

describe('氣球靶 voxel 模型', () => {
  it('box 數 × 24 頂點 merge 正確、含 vertex colors', () => {
    const g = buildVoxelGeometry(balloonModel);
    expect(g.attributes.position.count).toBe(balloonModel.boxes.length * 24);
    expect(g.attributes.color.count).toBe(g.attributes.position.count);
  });

  it('paletteOverride 換氣球色（多彩）有生效', () => {
    const a = buildVoxelGeometry(balloonModel);
    const b = buildVoxelGeometry(balloonModel, { C: '#3d7be0' });
    const c1 = a.attributes.color.array;
    const c2 = b.attributes.color.array;
    let differs = false;
    for (let i = 0; i < c1.length; i++) {
      if (Math.abs(c1[i] - c2[i]) > 1e-6) { differs = true; break; }
    }
    expect(differs).toBe(true);
  });

  it('玩具尺寸、原點底部中心、左右對稱、不穿地', () => {
    const g = buildVoxelGeometry(balloonModel);
    g.computeBoundingBox();
    const bb = /** @type {THREE.Box3} */ (g.boundingBox);
    const width = bb.max.x - bb.min.x;   // 球體最寬處
    const height = bb.max.y - bb.min.y;  // 含繩總高
    expect(width).toBeGreaterThan(3);    // 直徑 ~3~5m
    expect(width).toBeLessThan(5);
    expect(height).toBeGreaterThan(4);   // 含繩、玩具感
    expect(height).toBeLessThan(7);
    expect(bb.min.y).toBeGreaterThanOrEqual(-0.01);          // 不穿地
    expect(Math.abs(bb.min.x + bb.max.x)).toBeLessThan(0.5); // 左右對稱
    expect(Math.abs(bb.min.z + bb.max.z)).toBeLessThan(0.5); // 前後也對稱（球）
  });
});

describe('balloonDriftPos 移動軌跡純函式', () => {
  const center = { x: 10, y: 30, z: -5 };

  it('radius=0（固定靶）直接回 center', () => {
    const p = balloonDriftPos(center, 12.34, { radius: 0 });
    expect(p).toEqual(center);
  });

  it('無 opts 預設視為固定靶（radius 預設 0）', () => {
    expect(balloonDriftPos(center, 99)).toEqual(center);
  });

  it('t=0 在起點附近（xz 繞圈：起點偏 +x radius）', () => {
    const r = 8;
    const p = balloonDriftPos(center, 0, { radius: r, axis: 'xz' });
    // t=0 → cos=1,sin=0 → x = center.x + r、z = center.z
    expect(p.x).toBeCloseTo(center.x + r, 6);
    expect(p.y).toBeCloseTo(center.y, 6);
    expect(p.z).toBeCloseTo(center.z, 6);
  });

  it('不同 t 會動、且座標有界（|偏移| <= radius）', () => {
    const r = 6;
    const a = balloonDriftPos(center, 0, { radius: r, speed: 1 });
    const b = balloonDriftPos(center, 1.5, { radius: r, speed: 1 });
    expect(a).not.toEqual(b);
    for (let t = 0; t < 20; t += 0.37) {
      const p = balloonDriftPos(center, t, { radius: r, speed: 1.3 });
      expect(Math.abs(p.x - center.x)).toBeLessThanOrEqual(r + 1e-9);
      expect(Math.abs(p.z - center.z)).toBeLessThanOrEqual(r + 1e-9);
    }
  });

  it('相同輸入同輸出（決定性，不靠 Date.now / random）', () => {
    const opts = { radius: 5, speed: 0.8, axis: 'xz', phase: 0.5 };
    const p1 = balloonDriftPos(center, 7.77, opts);
    const p2 = balloonDriftPos(center, 7.77, opts);
    expect(p1).toEqual(p2);
  });

  it('單軸 axis=y 來回擺盪、有界且只動 y', () => {
    const r = 4;
    const p = balloonDriftPos(center, Math.PI / 2, { radius: r, speed: 1, axis: 'y' });
    // sin(PI/2)=1 → y = center.y + r；x、z 不動
    expect(p.x).toBeCloseTo(center.x, 6);
    expect(p.z).toBeCloseTo(center.z, 6);
    expect(p.y).toBeCloseTo(center.y + r, 6);
  });

  it('平面 axis=xy 在垂直面繞圓、z 不動', () => {
    const r = 3;
    const p = balloonDriftPos(center, 1.1, { radius: r, axis: 'xy' });
    expect(p.z).toBeCloseTo(center.z, 6);
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    expect(Math.sqrt(dx * dx + dy * dy)).toBeCloseTo(r, 6); // 在圓周上
  });
});
