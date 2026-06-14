// @ts-check
// 飛彈 voxel 模型的健全性：可在 node 無 WebGL 下 merge、含 vertex colors、
// accent 可換色，且 bounding box 三軸皆置中（原點 = 幾何中心）、機長合理。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildVoxelGeometry } from '../src/voxel/build.js';
import { missileModel } from '../src/voxel/models/missile.js';

describe('飛彈 voxel 模型', () => {
  it('box 數 × 24 頂點 merge 正確、含 vertex colors', () => {
    const g = buildVoxelGeometry(missileModel);
    expect(g.attributes.position.count).toBe(missileModel.boxes.length * 24);
    expect(g.attributes.color.count).toBe(g.attributes.position.count);
  });

  it('paletteOverride 換 accent（A）色有生效', () => {
    const def = buildVoxelGeometry(missileModel);
    const alt = buildVoxelGeometry(missileModel, { A: '#3d7be0' });
    const c1 = def.attributes.color.array;
    const c2 = alt.attributes.color.array;
    let differs = false;
    for (let i = 0; i < c1.length; i++) {
      if (Math.abs(c1[i] - c2[i]) > 1e-6) { differs = true; break; }
    }
    expect(differs).toBe(true);
  });

  it('bounding box 三軸中心皆 ≈ 0（置中）、機長 Z ≈6~9m、X/Y 跨度合理小於機長', () => {
    const g = buildVoxelGeometry(missileModel);
    g.computeBoundingBox();
    const bb = /** @type {THREE.Box3} */ (g.boundingBox);

    const spanX = bb.max.x - bb.min.x;
    const spanY = bb.max.y - bb.min.y;
    const spanZ = bb.max.z - bb.min.z;

    // 三軸皆置中：min+max ≈ 0
    expect(Math.abs(bb.min.x + bb.max.x)).toBeLessThan(0.5);
    expect(Math.abs(bb.min.y + bb.max.y)).toBeLessThan(0.5);
    expect(Math.abs(bb.min.z + bb.max.z)).toBeLessThan(0.5);

    // 機長（Z 跨度）≈ 6~9m
    expect(spanZ).toBeGreaterThan(6);
    expect(spanZ).toBeLessThan(9);

    // X/Y 跨度（含尾翼）合理小於機長
    expect(spanX).toBeLessThan(spanZ);
    expect(spanY).toBeLessThan(spanZ);
    expect(spanX).toBeGreaterThan(0); // 確有尾翼撐開橫向
    expect(spanY).toBeGreaterThan(0);

    // X/Y 對稱（彈體 + 十字尾翼應左右、上下對稱）
    expect(Math.abs(spanX - spanY)).toBeLessThan(1e-6);
  });
});
