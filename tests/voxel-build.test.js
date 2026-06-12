// @ts-check
// voxel builder 與 T-34C 模型的健全性（Three geometry 可在 node 無 WebGL 下建立）。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildVoxelGeometry } from '../src/voxel/build.js';
import { t34cBody, t34cProp } from '../src/voxel/models/t34c.js';

describe('buildVoxelGeometry', () => {
  it('box 數 × 24 頂點 merge 正確、含 vertex colors', () => {
    const g = buildVoxelGeometry(t34cBody);
    expect(g.attributes.position.count).toBe(t34cBody.boxes.length * 24);
    expect(g.attributes.color.count).toBe(g.attributes.position.count);
  });

  it('paletteOverride 換 accent 色有生效', () => {
    const red = buildVoxelGeometry(t34cBody);
    const blue = buildVoxelGeometry(t34cBody, { A: '#3d7be0' });
    const c1 = red.attributes.color.array;
    const c2 = blue.attributes.color.array;
    let differs = false;
    for (let i = 0; i < c1.length; i++) {
      if (Math.abs(c1[i] - c2[i]) > 1e-6) { differs = true; break; }
    }
    expect(differs).toBe(true);
  });

  it('T-34C 尺寸近似真機（長 ~8.8m、翼展 ~10.2m、原點在底部中心）', () => {
    const g = buildVoxelGeometry(t34cBody);
    g.computeBoundingBox();
    const bb = /** @type {THREE.Box3} */ (g.boundingBox);
    expect(bb.max.x - bb.min.x).toBeGreaterThan(9);   // 翼展
    expect(bb.max.x - bb.min.x).toBeLessThan(11);
    expect(bb.max.z - bb.min.z).toBeGreaterThan(8);   // 機長
    expect(bb.max.z - bb.min.z).toBeLessThan(10);
    expect(bb.min.y).toBeGreaterThanOrEqual(-0.01);   // 不穿地
    expect(Math.abs(bb.min.x + bb.max.x)).toBeLessThan(0.5); // 左右對稱
  });

  it('螺旋槳是獨立小模型', () => {
    const g = buildVoxelGeometry(t34cProp);
    expect(g.attributes.position.count).toBe(t34cProp.boxes.length * 24);
  });
});
