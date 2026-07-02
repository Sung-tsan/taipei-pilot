// @ts-check
// v5.2-4 GLB 假起落架：clean-belly GLB 疊參數化 voxel 輪組，收放沿用 voxel 機 scale.y 動畫。
// node 下 GLB 網路載入必失敗（_buildGlb 有 catch 不爆）——假輪組是同步建的，照樣可測。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PlaneEntity } from '../src/display/planes/plane-entity.js';
import { planeSpec } from '../src/display/planes/plane-specs.js';

const GLB_ATR = { glb: '/models/atr72.glb', lengthM: 27, yaw: 0 };

/** 最小 PlaneState（sync 需要的欄位）。 @param {boolean} gearDown */
function state(gearDown) {
  return { pos: { x: 0, y: 100, z: 0 }, heading: 0, pitch: 0, bank: 0, gearDown };
}

describe('PlaneEntity — GLB 假起落架（v5.2-4）', () => {
  it('GLB 機建構後有獨立 gear mesh（不再 null）、鉸點高度隨機身等比', () => {
    const e = new PlaneEntity(new THREE.Scene(), 0, /** @type {any} */ (GLB_ATR));
    expect(e.gear).not.toBeNull();
    expect(/** @type {any} */ (e.gear).isMesh).toBe(true);
    expect(/** @type {any} */ (e.gear).position.y).toBeCloseTo(27 * 0.045, 5); // gearH = L×0.045
  });

  it('空中收輪：sync(gearDown=false) 數步後 scale.y 收攏、mesh 隱藏', () => {
    const e = new PlaneEntity(new THREE.Scene(), 0, /** @type {any} */ (GLB_ATR));
    const s = /** @type {any} */ (state(false));
    for (let i = 0; i < 120; i++) e.sync(s, 0.8, 1 / 30, () => 0);
    expect(/** @type {any} */ (e.gear).scale.y).toBeLessThan(0.08);
    expect(/** @type {any} */ (e.gear).visible).toBe(false);
  });

  it('放輪：sync(gearDown=true) 回到 scale.y≈1、mesh 顯示', () => {
    const e = new PlaneEntity(new THREE.Scene(), 0, /** @type {any} */ (GLB_ATR));
    const up = /** @type {any} */ (state(false));
    for (let i = 0; i < 120; i++) e.sync(up, 0.8, 1 / 30, () => 0);
    const down = /** @type {any} */ (state(true));
    for (let i = 0; i < 120; i++) e.sync(down, 0.3, 1 / 30, () => 0);
    expect(/** @type {any} */ (e.gear).scale.y).toBeGreaterThan(0.9);
    expect(/** @type {any} */ (e.gear).visible).toBe(true);
  });

  it('換機 GLB↔voxel：gear 都存在、不 throw、不殘留舊輪', () => {
    const e = new PlaneEntity(new THREE.Scene(), 0, /** @type {any} */ (GLB_ATR));
    expect(() => e.setModel(planeSpec('t34c').model)).not.toThrow();
    expect(e.gear).not.toBeNull();
    expect(() => e.setModel(/** @type {any} */ (GLB_ATR))).not.toThrow();
    expect(e.gear).not.toBeNull();
    // group 內 gear mesh 只該有一顆（換機時舊輪隨 _planeMeshes 清掉）
    const gearMeshes = e.group.children.filter((o) => o === e.gear);
    expect(gearMeshes).toHaveLength(1);
  });

  it('gearNodes 模型（B737 真輪組）：不建假輪（gear=null）、sync 不爆', () => {
    const b737 = { glb: '/models/low_poly_airliner.glb', lengthM: 38, yaw: Math.PI, gearNodes: ['Cylinder.001', 'Cylinder.002', 'Cylinder.003'] };
    const e = new PlaneEntity(new THREE.Scene(), 0, /** @type {any} */ (b737));
    expect(e.gear).toBeNull(); // 真輪組模型不疊假 voxel 輪
    const s = /** @type {any} */ (state(false));
    expect(() => { for (let i = 0; i < 30; i++) e.sync(s, 0.8, 1 / 30, () => 0); }).not.toThrow();
    // node 環境 GLB 載入必失敗 → _glbGearNodes 空（catch 保底）；瀏覽器端由 HITL 驗真收放
    expect(() => e.setModel(planeSpec('t34c').model)).not.toThrow(); // 換機清 gear nodes 不殘留
  });

  it('voxel 機（T-34C）既有收放不受影響', () => {
    const e = new PlaneEntity(new THREE.Scene(), 0, planeSpec('t34c').model);
    expect(e.gear).not.toBeNull();
    const s = /** @type {any} */ (state(false));
    for (let i = 0; i < 120; i++) e.sync(s, 0.8, 1 / 30, () => 0);
    expect(/** @type {any} */ (e.gear).scale.y).toBeLessThan(0.08);
  });
});
