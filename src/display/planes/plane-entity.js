// @ts-check
// 飛機實體：PlaneState ↔ Three group 同步、螺旋槳轉速跟油門。
// 機型 voxel 由 plane spec 的 model 提供（v2.0-1 起多機種）；換機＝setModel() 重建網格。
import * as THREE from 'three';
import { buildVoxelGeometry, voxelMaterial } from '../../voxel/build.js';
import { planeSpec, DEFAULT_PLANE } from './plane-specs.js';
import { SLOT_COLORS } from '../../../shared/constants.js';
import { expDamp } from '../../lib/math.js';

const GEAR_TOP = 0.62; // 起落架收進機腹的鉸點高度

export class PlaneEntity {
  /**
   * @param {THREE.Scene} scene
   * @param {number} slot
   * @param {import('./plane-specs.js').PlaneModel} [model] 機型 voxel（缺省＝預設機 T-34C）
   */
  constructor(scene, slot, model = planeSpec(DEFAULT_PLANE).model) {
    this.slot = slot;
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ'; // yaw → pitch → roll

    /** @type {THREE.Mesh[]} 機型相關網格（換機時銷毀重建） */
    this._planeMeshes = [];
    /** @type {THREE.Mesh|null} 螺旋槳（噴射機＝null） */
    this.prop = null;
    this._gearK = 1; // 1=放下 0=收起
    this.gear = this._buildModel(model); // 直接在 constructor 賦值（TS 認得確定初始化）

    // 假影子（貼地黑橢圓，廉價的高度感線索）
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(5, 12),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);

    // 受損冒煙（真實模式 damage=smoking）：機尾後上方一團深煙，預設隱藏
    this.smoke = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#3a3a3a', transparent: true, opacity: 0.55 }),
    );
    this.smoke.position.set(0, 1.4, 3.2);
    this.smoke.visible = false;
    this._smoking = false;
    this.group.add(this.smoke);

    this.group.visible = false;
    scene.add(this.group);
  }

  /**
   * 建（或重建）機型網格：機身（slot 色 accent）+ 螺旋槳（有才建）+ 起落架。
   * 換機時先銷毀舊網格再建新的，避免幾何洩漏。回傳起落架 mesh（供 caller 賦值 this.gear）。
   * @param {import('./plane-specs.js').PlaneModel} model
   * @returns {THREE.Mesh} 起落架 mesh
   */
  _buildModel(model) {
    for (const m of this._planeMeshes) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this._planeMeshes = [];

    const body = new THREE.Mesh(
      buildVoxelGeometry(model.body, { A: SLOT_COLORS[this.slot] }),
      voxelMaterial(),
    );
    this.group.add(body);
    this._planeMeshes.push(body);

    if (model.prop && model.propPos) {
      this.prop = new THREE.Mesh(buildVoxelGeometry(model.prop), voxelMaterial());
      this.prop.position.set(model.propPos.x, model.propPos.y, model.propPos.z);
      this.group.add(this.prop);
      this._planeMeshes.push(this.prop);
    } else {
      this.prop = null; // 噴射機無螺旋槳
    }

    // 起落架：geometry 平移到鉸點下方 → scale.y 收放（往機腹縮）
    const gearGeo = buildVoxelGeometry(model.gear);
    gearGeo.translate(0, -GEAR_TOP, 0);
    const gear = new THREE.Mesh(gearGeo, voxelMaterial());
    gear.position.y = GEAR_TOP;
    gear.scale.y = this._gearK; // 維持目前收放狀態（換機不重置）
    this.group.add(gear);
    this._planeMeshes.push(gear);
    return gear;
  }

  /** 換機型（保留 slot 色 / 收放狀態） @param {import('./plane-specs.js').PlaneModel} model */
  setModel(model) {
    this.gear = this._buildModel(model);
  }

  /** 受損冒煙開關（真實模式） @param {boolean} smoking */
  setDamaged(smoking) {
    this._smoking = smoking;
    this.smoke.visible = smoking;
  }

  /**
   * @param {import('../flight/flight-model.js').PlaneState} s
   * @param {number} throttle
   * @param {number} dt
   * @param {(x:number, z:number)=>number} groundY
   */
  sync(s, throttle, dt, groundY) {
    this.group.position.set(s.pos.x, s.pos.y, s.pos.z);
    this.group.rotation.y = -s.heading;
    this.group.rotation.x = s.pitch;
    this.group.rotation.z = -s.bank;
    if (this.prop) this.prop.rotation.z += (6 + throttle * 30) * dt; // 噴射機無螺旋槳

    // 起落架收放動畫（~0.8s 平滑縮放）
    const gearTarget = s.gearDown ? 1 : 0.04;
    this._gearK += (gearTarget - this._gearK) * expDamp(4, dt);
    this.gear.scale.y = this._gearK;
    this.gear.visible = this._gearK > 0.05;

    // 冒煙脈動（toy 風：縮放 + 透明度輕微抖動）
    if (this._smoking) {
      const k = 1 + 0.25 * Math.sin(performance.now() / 90);
      this.smoke.scale.setScalar(k);
      /** @type {THREE.MeshBasicMaterial} */ (this.smoke.material).opacity = 0.45 + 0.15 * Math.sin(performance.now() / 70);
    }

    const gy = groundY(s.pos.x, s.pos.z);
    const agl = Math.max(s.pos.y - gy, 0);
    this.shadow.position.set(s.pos.x, gy + 0.5, s.pos.z);
    const k = Math.max(0.25, 1 - agl / 400);
    this.shadow.scale.setScalar(k);
    /** @type {THREE.MeshBasicMaterial} */ (this.shadow.material).opacity = 0.28 * k;
  }

  /** @param {boolean} v */
  setVisible(v) {
    this.group.visible = v;
    this.shadow.visible = v;
  }
}
