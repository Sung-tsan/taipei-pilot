// @ts-check
// 機場生活感：在 node 下用 THREE.Scene 直測——擺件建得起來、夜燈可切、merged 低 draws、雷達會轉。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { AirportLife } from '../src/display/scene/airport-life.js';

describe('AirportLife 機場生活感', () => {
  it('建得起來、擺件 merged 成少數 mesh（draws 紀律）', () => {
    const scene = new THREE.Scene();
    const life = new AirportLife(scene);
    // group 內 mesh 數應該很少（靜態 merged 1 + 夜燈 1 + 風向袋 1 + 雷達 1 ≈ 4）→ draws 預算友善
    const meshes = life.group.children.filter((o) => /** @type {any} */ (o).isMesh);
    expect(meshes.length).toBeLessThanOrEqual(8);
    expect(meshes.length).toBeGreaterThanOrEqual(3);
  });

  it('夜燈預設關、setNight 可切', () => {
    const life = /** @type {any} */ (new AirportLife(new THREE.Scene()));
    expect(life.nightLights.visible).toBe(false);
    life.setNight(true);
    expect(life.nightLights.visible).toBe(true);
    life.setNight(false);
    expect(life.nightLights.visible).toBe(false);
  });

  it('update：雷達會轉、不爆', () => {
    const life = /** @type {any} */ (new AirportLife(new THREE.Scene()));
    const before = life.radar.rotation.y;
    expect(() => life.update(0.5, 0.3, 6)).not.toThrow();
    expect(life.radar.rotation.y).toBeGreaterThan(before); // 掃描旋轉推進
  });

  it('v5.2-3 fleetCount：大場(6)靜態幾何比離島(2)多、皆仍 merged 少 mesh', () => {
    const big = /** @type {any} */ (new AirportLife(new THREE.Scene(), { fleetCount: 6 }));
    const small = /** @type {any} */ (new AirportLife(new THREE.Scene(), { fleetCount: 2 }));
    // 靜態擺件仍 merged 成單一 mesh（draws 紀律不破）——差異表現在頂點量
    const vtx = (/** @type {any} */ life) => life._static.geometry.getAttribute('position').count;
    expect(vtx(big)).toBeGreaterThan(vtx(small));
    expect(big.group.children.filter((/** @type {any} */ o) => o.isMesh).length).toBeLessThanOrEqual(8);
    // 夾限：異常值不爆
    expect(() => new AirportLife(new THREE.Scene(), { fleetCount: 99 })).not.toThrow();
  });
});
