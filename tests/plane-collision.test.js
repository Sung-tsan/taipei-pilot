// @ts-check
import { describe, it, expect } from 'vitest';
import { planesColliding } from '../src/display/flight/plane-collision.js';

describe('planesColliding（兩機相撞判定）', () => {
  it('距離 < 半徑 → 相撞', () => {
    expect(planesColliding({ x: 0, y: 100, z: 0 }, { x: 10, y: 100, z: 0 }, 20)).toBe(true);
  });
  it('距離 > 半徑 → 不撞', () => {
    expect(planesColliding({ x: 0, y: 100, z: 0 }, { x: 100, y: 100, z: 0 }, 20)).toBe(false);
  });
  it('含高度差的 3D 距離', () => {
    expect(planesColliding({ x: 0, y: 100, z: 0 }, { x: 0, y: 140, z: 0 }, 20)).toBe(false); // 垂直差 40 > 20
    expect(planesColliding({ x: 0, y: 100, z: 0 }, { x: 0, y: 115, z: 0 }, 20)).toBe(true);
  });
  it('壞輸入/非正半徑 → false，不爆', () => {
    expect(planesColliding(/** @type {any} */ (null), { x: 0, y: 0, z: 0 }, 20)).toBe(false);
    expect(planesColliding({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0)).toBe(false);
    expect(planesColliding({ x: NaN, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 20)).toBe(false);
  });
});
