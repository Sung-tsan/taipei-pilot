// @ts-check
// V3 機場/城市生活感（解「停機坪前面沒飛機」）：停機坪靜態飛機 / 跑道·滑行道燈 / 航廈窗光 /
// 風向袋 / 旋轉雷達 / 靜態地面車輛。**靜態為主軸、全 merged/instanced**（draws 紀律：perf GO/NO-GO）。
// 套件先行註：通用件 CC0 low-poly GLB 大量引入＝V4（canon §11 + 正規化 spike）；本階段為 perf gate
// 用 merged voxel（最低 draws），車輛＝trivial 小件自建（套件先行允許）。GLB 待 V4。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildVoxelGeometry, paintGeometry, voxelMaterial } from '../../voxel/build.js';
import { t34cBody } from '../../voxel/models/t34c.js';
import { RUNWAY } from './airport.js';

const yawForX = Math.PI / 2 - (RUNWAY.headingDeg * Math.PI) / 180; // 與 airport 同旋轉（跑道-local 座標）

/** 小工具：把 box 清單建成 voxel geometry @param {(string|number)[][]} boxes @param {Record<string,string>} palette */
const vox = (boxes, palette) => buildVoxelGeometry({ scale: 1, palette, boxes });

export class AirportLife {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.rotation.y = yawForX; // 跑道-local 座標（與 airport.js 對齊）
    scene.add(this.group);
    this._buildStatic();
    this._buildNightLights();
    this._buildAnimated();
    this.setNight(false);
  }

  /** 停機坪靜態飛機 + 地面車輛 + 風向袋桿（全 merged 成 1 mesh＝1 draw） */
  _buildStatic() {
    const geos = [];
    // 停機坪靜態飛機（重用 T-34C voxel 當 prop，數架不同塗裝、朝航廈停）
    const liveries = ['#d8d8d8', '#e0c060', '#88b0d0', '#d09090'];
    for (let i = 0; i < 4; i++) {
      const g = buildVoxelGeometry(t34cBody, { A: liveries[i], W: '#f4f1e8' });
      g.scale(1, 1, 1);
      g.rotateY(Math.PI); // 機鼻朝南（面向航廈/跑道）
      g.translate(-150 + i * 100, 0, -170); // 停機坪一排
      geos.push(g);
    }
    // 靜態地面車輛（trivial 小 voxel：車身+車頂+輪），停在航廈前服務道
    for (let i = 0; i < 3; i++) {
      const c = ['#d24b4b', '#e0e0e0', '#4b78d2'][i];
      const car = vox([
        [-2.4, 0.5, -1.2, 4.8, 1.2, 2.4, 'C'], // 車身
        [-1.6, 1.7, -1.0, 3.0, 1.0, 2.0, 'W'], // 車頂
        [-2.2, 0.0, -1.3, 0.8, 0.6, 0.8, 'T'], [1.4, 0.0, -1.3, 0.8, 0.6, 0.8, 'T'],
        [-2.2, 0.0, 0.5, 0.8, 0.6, 0.8, 'T'], [1.4, 0.0, 0.5, 0.8, 0.6, 0.8, 'T'],
      ], { C: c, W: '#cfe0ee', T: '#22252e' });
      car.translate(-90 + i * 90, 0, -300);
      geos.push(car);
    }
    // 風向袋桿（白紅桿；袋本體在 _buildAnimated 隨風擺）
    const pole = vox([[-0.3, 0, -0.3, 0.6, 11, 0.6, 'P']], { P: '#d8d8d8' });
    pole.translate(1180, 0, -110);
    geos.push(pole);

    const mesh = new THREE.Mesh(mergeGeometries(geos), voxelMaterial());
    geos.forEach((g) => g.dispose());
    this.group.add(mesh);
  }

  /** 夜燈（跑道/滑行道燈 + 航廈窗光 + 停機坪燈）：emissive、merged、夜間才顯（純氛圍） */
  _buildNightLights() {
    const geos = [];
    // 跑道邊燈（兩側，沿長軸；小亮塊）
    for (let x = -RUNWAY.length / 2 + 60; x <= RUNWAY.length / 2 - 60; x += 120) {
      for (const z of [-RUNWAY.width / 2 - 2, RUNWAY.width / 2 + 2]) {
        const g = new THREE.BoxGeometry(2, 1, 2); g.translate(x, 0.6, z); geos.push(g);
      }
    }
    // 滑行道燈（跑道 → 停機坪一條）
    for (let z = -RUNWAY.width / 2 - 10; z >= -170; z -= 18) {
      const g = new THREE.BoxGeometry(1.6, 1, 1.6); g.translate(0, 0.6, z); geos.push(g);
    }
    // 航廈玻璃窗光（沿玻璃帶）
    for (let x = -150; x <= 150; x += 12) {
      const g = new THREE.BoxGeometry(7, 5, 1.5); g.translate(x, 8, -332); geos.push(g);
    }
    // 停機坪泛光（幾盞高燈）
    for (const x of [-180, -60, 60, 180]) {
      const g = new THREE.BoxGeometry(3, 3, 3); g.translate(x, 14, -180); geos.push(g);
    }
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    // 暖白燈光：MeshBasic 全亮 + 不吃霧（霧夜仍看得到機場輪廓）
    this.nightLights = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: '#ffe6a0', fog: false }));
    this.group.add(this.nightLights);
  }

  /** 動態件：風向袋（隨風擺）+ 旋轉雷達（轉），各 1 mesh */
  _buildAnimated() {
    // 風向袋（橘白錐袋，掛在桿頂；rotation.y 跟風向、傾角隨風速）
    this.windsock = new THREE.Mesh(
      vox([
        [-0.2, -0.5, 0, 0.4, 1.0, 5.0, 'O'], // 錐袋主體（沿 +Z）
        [-0.25, -0.6, 1.6, 0.5, 1.2, 1.2, 'W'], // 紅白條
      ], { O: '#e8852f', W: '#f4f1e8' }),
      voxelMaterial(),
    );
    this.windsock.position.set(1180, 9.5, -110);
    this.group.add(this.windsock);

    // 旋轉雷達（塔台旁，水平天線轉）
    this.radar = new THREE.Mesh(
      vox([
        [-0.2, 0, -0.2, 0.4, 2, 0.4, 'G'],   // 短柱
        [-3.2, 2, -0.4, 6.4, 0.4, 0.8, 'D'], // 天線臂
        [-3.2, 1.4, -0.4, 1.0, 1.4, 0.8, 'D'], // 反射板
      ], { G: '#6a7078', D: '#cdd6dd' }),
    );
    this.radar.position.set(120, 56, -318); // 塔台機艙頂
    this.group.add(this.radar);
  }

  /** 夜燈開關（日夜時段呼叫；純氛圍） @param {boolean} on */
  setNight(on) { if (this.nightLights) this.nightLights.visible = on; }

  /**
   * 每幀：雷達轉 + 風向袋對風（指示功能，接 v3.0-2 風向）。
   * @param {number} dt
   * @param {number} windFromRad 風來向（rad）
   * @param {number} windSpeed m/s
   */
  update(dt, windFromRad, windSpeed) {
    if (this.radar) this.radar.rotation.y += dt * 0.9; // 緩慢掃描
    if (this.windsock) {
      // 袋飄向「風吹去」的方向（風來向+π）；風速越大越水平（傾角從垂下到水平）
      this.windsock.rotation.y = (windFromRad ?? 0) + Math.PI - yawForX; // 抵銷 group 旋轉 → 對世界風向
      const lift = Math.min(1, (windSpeed ?? 0) / 8); // 0=垂下、1=水平
      this.windsock.rotation.x = -Math.PI / 2 * lift;
    }
  }
}
