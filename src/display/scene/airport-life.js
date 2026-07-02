// @ts-check
// V3 機場/城市生活感（解「停機坪前面沒飛機」）：停機坪靜態飛機 / 跑道·滑行道燈 / 航廈窗光 /
// 風向袋 / 旋轉雷達 / 靜態地面車輛。**靜態為主軸、全 merged/instanced**（draws 紀律：perf GO/NO-GO）。
// V5.1-2（HITL 2026-06-21）：改 per-airport——依機場跑道方位/長度定向、機隊依機場變化（不再每場一模一樣的小飛機）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildVoxelGeometry, voxelMaterial } from '../../voxel/build.js';
import { t34cBody } from '../../voxel/models/t34c.js';
import { f16Body } from '../../voxel/models/f16.js';

/** 簡易客機 voxel（停機坪變化用；比 T-34C 大、有垂尾，剪影明顯不同）。 */
const airlinerBody = {
  scale: 1,
  palette: { A: '#d8d8d8', W: '#eef2f6', T: '#33405e' },
  boxes: /** @type {(string|number)[][]} */ ([
    [-2.2, 0.8, -13, 4.4, 4.2, 26, 'A'],   // 機身（沿 +Z 長）
    [-2.0, 2.4, -9, 4.0, 2.6, 13, 'W'],    // 上半窗帶
    [-13, 1.4, -1, 26, 1.2, 5, 'A'],       // 主翼
    [-5, 1.4, 10, 10, 1, 3, 'A'],          // 平尾
    [-0.8, 4.2, 10, 1.6, 5, 3, 'T'],       // 垂尾
  ]),
};

/** 機隊剪影池（停機坪變化）：小教練機 / 噴射機 / 客機。 */
const FLEET = [t34cBody, f16Body, airlinerBody];
const LIVERIES = ['#d8d8d8', '#e0c060', '#88b0d0', '#d09090', '#9ec9a0', '#c79bd0'];

export class AirportLife {
  /**
   * @param {THREE.Scene} scene
   * @param {{ headingDeg?:number, runwayLength?:number, variant?:number, fleetCount?:number }} [opts]
   *   headingDeg＝該機場跑道方位（定向 group）；runwayLength＝跑道全長（燈位）；variant＝機場序（決定機隊組合，per-airport 變化）；
   *   fleetCount＝停機坪停放機數（v5.2-3：大場多機、離島小場少機）。
   */
  constructor(scene, { headingDeg = 100, runwayLength = 2605, variant = 0, fleetCount = 4 } = {}) {
    this.group = new THREE.Group();
    this.group.rotation.y = Math.PI / 2 - (headingDeg * Math.PI) / 180; // 跑道-local（與 airport 對齊）
    this._half = runwayLength / 2;
    this._variant = variant;
    this._fleetCount = Math.max(1, Math.min(6, fleetCount));
    scene.add(this.group);
    this._buildStatic();
    this._buildNightLights();
    this._buildAnimated();
    this.setNight(false);
  }

  /** 停機坪靜態飛機（機隊依 variant 變化）+ 地面車輛 + 風向袋桿（全 merged 成 1 mesh＝1 draw） */
  _buildStatic() {
    const geos = [];
    const v = this._variant;
    const n = this._fleetCount; // v5.2-3 per-airport 機數（intro 6 / inter 4 / expert 2）
    for (let i = 0; i < n; i++) {
      const shape = FLEET[(v + i) % FLEET.length];                 // per-airport 不同機隊組合
      const livery = LIVERIES[(v * 2 + i) % LIVERIES.length];
      const big = shape === airlinerBody;
      const g = buildVoxelGeometry(shape, { A: livery, W: '#f4f1e8' });
      g.rotateY(Math.PI); // 機鼻朝南（面向航廈/跑道）
      g.translate(-170 + i * (big ? 130 : 100), 0, -170 - (big ? 18 : 0)); // 客機略大、往後讓位
      geos.push(g);
    }
    // 靜態地面車輛（trivial 小 voxel），停在航廈前服務道
    for (let i = 0; i < 3; i++) {
      const c = ['#d24b4b', '#e0e0e0', '#4b78d2'][(v + i) % 3];
      const car = buildVoxelGeometry({ scale: 1, palette: { C: c, W: '#cfe0ee', T: '#22252e' }, boxes: [
        [-2.4, 0.5, -1.2, 4.8, 1.2, 2.4, 'C'], [-1.6, 1.7, -1.0, 3.0, 1.0, 2.0, 'W'],
        [-2.2, 0.0, -1.3, 0.8, 0.6, 0.8, 'T'], [1.4, 0.0, -1.3, 0.8, 0.6, 0.8, 'T'],
        [-2.2, 0.0, 0.5, 0.8, 0.6, 0.8, 'T'], [1.4, 0.0, 0.5, 0.8, 0.6, 0.8, 'T'],
      ] });
      car.translate(-90 + i * 90, 0, -300);
      geos.push(car);
    }
    // 風向袋桿（白紅桿；袋本體在 _buildAnimated 隨風擺）
    const pole = buildVoxelGeometry({ scale: 1, palette: { P: '#d8d8d8' }, boxes: [[-0.3, 0, -0.3, 0.6, 11, 0.6, 'P']] });
    pole.translate(Math.min(1180, this._half * 0.9), 0, -110);
    geos.push(pole);

    this._static = new THREE.Mesh(mergeGeometries(geos), voxelMaterial());
    geos.forEach((g) => g.dispose());
    this.group.add(this._static);
  }

  /** 夜燈（跑道/滑行道燈 + 航廈窗光 + 停機坪燈）：emissive、merged、夜間才顯（純氛圍） */
  _buildNightLights() {
    const geos = [];
    const half = this._half;
    for (let x = -half + 60; x <= half - 60; x += 120) {
      for (const z of [-32, 32]) { const g = new THREE.BoxGeometry(2, 1, 2); g.translate(x, 0.6, z); geos.push(g); }
    }
    for (let z = -40; z >= -170; z -= 18) { const g = new THREE.BoxGeometry(1.6, 1, 1.6); g.translate(0, 0.6, z); geos.push(g); }
    for (let x = -150; x <= 150; x += 12) { const g = new THREE.BoxGeometry(7, 5, 1.5); g.translate(x, 8, -332); geos.push(g); }
    for (const x of [-180, -60, 60, 180]) { const g = new THREE.BoxGeometry(3, 3, 3); g.translate(x, 14, -180); geos.push(g); }
    this.nightLights = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ color: '#ffe6a0', fog: false }));
    geos.forEach((g) => g.dispose());
    this.group.add(this.nightLights);
  }

  /** 動態件：風向袋（隨風擺）+ 旋轉雷達（轉），各 1 mesh */
  _buildAnimated() {
    this.windsock = new THREE.Mesh(buildVoxelGeometry({ scale: 1, palette: { O: '#e8852f', W: '#f4f1e8' }, boxes: [
      [-0.2, -0.5, 0, 0.4, 1.0, 5.0, 'O'], [-0.25, -0.6, 1.6, 0.5, 1.2, 1.2, 'W'],
    ] }), voxelMaterial());
    this.windsock.position.set(Math.min(1180, this._half * 0.9), 9.5, -110);
    this.group.add(this.windsock);

    this.radar = new THREE.Mesh(buildVoxelGeometry({ scale: 1, palette: { G: '#6a7078', D: '#cdd6dd' }, boxes: [
      [-0.2, 0, -0.2, 0.4, 2, 0.4, 'G'], [-3.2, 2, -0.4, 6.4, 0.4, 0.8, 'D'], [-3.2, 1.4, -0.4, 1.0, 1.4, 0.8, 'D'],
    ] }));
    this.radar.position.set(120, 56, -318);
    this.group.add(this.radar);
  }

  /** 夜燈開關（日夜時段呼叫；純氛圍） @param {boolean} on */
  setNight(on) { if (this.nightLights) this.nightLights.visible = on; }

  /**
   * 每幀：雷達轉 + 風向袋對風（指示功能，接 v3.0-2 風向）。
   * @param {number} dt @param {number} windFromRad 風來向（rad） @param {number} windSpeed m/s
   */
  update(dt, windFromRad, windSpeed) {
    if (this.radar) this.radar.rotation.y += dt * 0.9;
    if (this.windsock) {
      this.windsock.rotation.y = (windFromRad ?? 0) + Math.PI - this.group.rotation.y; // 抵銷 group 旋轉 → 對世界風向
      const lift = Math.min(1, (windSpeed ?? 0) / 8);
      this.windsock.rotation.x = (-Math.PI / 2) * lift;
    }
  }

  /** 切換機場時釋放（remove + dispose geos）。 */
  dispose() {
    this.group.traverse((o) => { const m = /** @type {THREE.Mesh} */ (o); if (/** @type {any} */ (m).isMesh) m.geometry?.dispose(); });
    this.group.parent?.remove(this.group);
  }
}
