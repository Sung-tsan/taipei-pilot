// @ts-check
// 飛機實體：PlaneState ↔ Three group 同步、螺旋槳轉速跟油門。
// 機型 voxel 由 plane spec 的 model 提供（v2.0-1 起多機種）；換機＝setModel() 重建網格。
import * as THREE from 'three';
import { buildVoxelGeometry, voxelMaterial } from '../../voxel/build.js';
import { planeSpec, DEFAULT_PLANE, isGlbModel } from './plane-specs.js';
import { loadToyModel } from '../assets/glb-model.js';
import { SLOT_COLORS } from '../../../shared/constants.js';
import { expDamp } from '../../lib/math.js';

const GEAR_TOP = 0.62; // 起落架收進機腹的鉸點高度

export class PlaneEntity {
  /**
   * @param {THREE.Scene} scene
   * @param {number} slot
   * @param {import('./plane-specs.js').PlaneModel|import('./plane-specs.js').GlbModel} [model] 機型 voxel 或 GLB（缺省＝預設機 T-34C）
   * @param {string} [accent] 機身 accent 色（缺省＝slot 色；敵機可傳專屬色）
   */
  constructor(scene, slot, model = planeSpec(DEFAULT_PLANE).model, accent = SLOT_COLORS[slot]) {
    this.slot = slot;
    this.accent = accent;
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ'; // yaw → pitch → roll

    /** @type {THREE.Mesh[]} 機型相關網格（voxel：換機時銷毀重建） */
    this._planeMeshes = [];
    /** @type {THREE.Object3D|null} GLB 機體 clone（民航機；幾何/材質與模板共用，dispose 時不釋放） */
    this._glbRoot = null;
    /** @type {THREE.Object3D[]} GLB 原生起落架 node（desc.gearNodes；真收放，v5.2-4） */
    this._glbGearNodes = [];
    this._loadToken = 0; // async GLB 載入的作廢序號（換機時 +1，丟棄過期載入）
    this._shadowScale = 1; // 影子半徑倍率（大機放大）
    /** @type {THREE.Mesh|null} 螺旋槳（噴射機/GLB＝null） */
    this.prop = null;
    this.rollSpin = 0; // 額外滾轉量（rad）：翻滾閃避時疊在 -bank 上做 360° 滾筒翻（main 每幀餵）
    this._gearK = 1; // 1=放下 0=收起
    /** @type {THREE.Mesh|null} 起落架 voxel（GLB 機無獨立起落架＝null） */
    this.gear = isGlbModel(model)
      ? null
      : this._buildModel(/** @type {import('./plane-specs.js').PlaneModel} */ (model));
    if (isGlbModel(model)) this._buildGlb(model);

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
      buildVoxelGeometry(model.body, { A: this.accent }),
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

  /** 換機型（voxel 或 GLB；保留 slot 色 / 收放狀態） @param {import('./plane-specs.js').PlaneModel|import('./plane-specs.js').GlbModel} model */
  setModel(model) {
    this._loadToken++;   // 作廢進行中的 GLB 載入
    this._clearGlb();
    if (isGlbModel(model)) {
      for (const m of this._planeMeshes) { this.group.remove(m); m.geometry.dispose(); }
      this._planeMeshes = [];
      this.prop = null;
      this.gear = null;
      this._buildGlb(model);
    } else {
      this._shadowScale = 1;
      this.gear = this._buildModel(/** @type {import('./plane-specs.js').PlaneModel} */ (model));
    }
  }

  /** 移除 GLB clone（幾何/材質與模板共用，故不 dispose）；原生輪組參照一併清（防換機殘留）。 */
  _clearGlb() {
    if (this._glbRoot) { this.group.remove(this._glbRoot); this._glbRoot = null; }
    this._glbGearNodes = [];
  }

  /**
   * 載入 GLB 機體（async；過 normalize 管線）：clone 模板 → 套機鼻朝向 → 掛進 group。
   * 載入期間先無機體（很短）；換機/dispose 用 _loadToken 作廢過期載入。
   * v5.2-4：GLB 皆 clean-belly（CREDITS.md，無外露輪）→ 疊「參數化 voxel 假起落架」，
   * 收放沿用 voxel 機的 scale.y 動畫；機身整體抬高輪高（停機站在輪上、收輪後機腹乾淨）。
   * @param {import('./plane-specs.js').GlbModel} desc
   */
  _buildGlb(desc) {
    this.prop = null;
    this._shadowScale = Math.max(1, (desc.lengthM ?? 20) / 10); // 大機影子放大
    const L = desc.lengthM ?? 20;
    this._glbGearNodes = [];
    const hasRealGear = Array.isArray(desc.gearNodes) && desc.gearNodes.length > 0;
    // 無原生輪組的 clean-belly 模型 → 疊參數化 voxel 假輪組 + 機身抬輪高；
    // 有原生輪組（gearNodes）→ 模型自帶站姿（fitToLength 落地含輪），零假件。
    const gearH = Math.max(0.9, L * 0.045);
    this.gear = hasRealGear ? null : this._buildGlbGear(L, gearH);
    const token = this._loadToken;
    loadToyModel(desc.glb, { lengthM: desc.lengthM }).then((tmpl) => {
      if (token !== this._loadToken) return; // 已切換到別的模型
      const inst = tmpl.clone(true);
      inst.rotation.y = desc.yaw ?? 0;       // 機鼻朝向修正
      if (hasRealGear) {
        for (const name of /** @type {string[]} */ (desc.gearNodes)) {
          const n = inst.getObjectByName(name);
          if (n) { n.scale.y = this._gearK; this._glbGearNodes.push(n); }
        }
      } else {
        inst.position.y += gearH;            // clean-belly 原坐地 → 抬到輪頂（放下時輪子貼地）
      }
      this.group.add(inst);
      this._glbRoot = inst;
    }).catch(() => { /* 載入失敗：保持無機體，不爆 */ });
  }

  /**
   * 參數化 voxel 假起落架（GLB 機用；v5.2-4 方案 B）：鼻輪 + 左右主輪，尺寸隨機身等比。
   * 與 voxel 機同一套鉸點/收放語義：幾何佔 [-gearH, 0]、mesh.position.y = gearH、scale.y 收放。
   * @param {number} L 機身長（m） @param {number} gearH 輪高（m）
   * @returns {THREE.Mesh}
   */
  _buildGlbGear(L, gearH) {
    const strutW = Math.max(0.25, L * 0.012);
    const wheelR = Math.max(0.35, L * 0.02);
    const legs = [
      { x: 0, z: -L * 0.32 },          // 鼻輪（前＝-Z，與 heading forward 同制）
      { x: -L * 0.06, z: L * 0.04 },   // 左主輪
      { x: L * 0.06, z: L * 0.04 },    // 右主輪
    ];
    /** @type {(string|number)[][]} */
    const boxes = [];
    for (const g of legs) {
      boxes.push([g.x - strutW / 2, wheelR, g.z - strutW / 2, strutW, gearH - wheelR, strutW, 'S']);
      boxes.push([g.x - wheelR, 0, g.z - wheelR * 1.1, wheelR * 2, wheelR * 2, wheelR * 2.2, 'W']);
    }
    const geo = buildVoxelGeometry({ scale: 1, palette: { S: '#8a8f99', W: '#22252e' }, boxes });
    geo.translate(0, -gearH, 0);
    const gear = new THREE.Mesh(geo, voxelMaterial());
    gear.position.y = gearH;
    gear.scale.y = this._gearK; // 維持目前收放狀態（換機不重置）
    this.group.add(gear);
    this._planeMeshes.push(gear); // 換機/dispose 隨 voxel 網格一起清
    return gear;
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
    this.group.rotation.z = -s.bank + (this.rollSpin || 0); // 翻滾閃避：疊上 360° 滾筒翻
    if (this.prop) this.prop.rotation.z += (6 + throttle * 30) * dt; // 噴射機/GLB 無螺旋槳

    // 起落架收放動畫（~0.8s 平滑縮放）：voxel 機整組 scale.y 縮進機腹。
    // GLB 機（v5.2-4）：有原生輪組（gearNodes，pivot 在頂）＝真收放；否則假 voxel 輪組同語義。
    const gearNodes = this._glbGearNodes ?? [];
    if (this.gear || gearNodes.length) {
      const gearTarget = s.gearDown ? 1 : 0.04;
      this._gearK += (gearTarget - this._gearK) * expDamp(4, dt);
      const show = this._gearK > 0.05;
      if (this.gear) { this.gear.scale.y = this._gearK; this.gear.visible = show; }
      for (const n of gearNodes) { n.scale.y = this._gearK; n.visible = show; }
    }

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
    this.shadow.scale.setScalar(k * this._shadowScale); // 大機（GLB）影子放大
    /** @type {THREE.MeshBasicMaterial} */ (this.shadow.material).opacity = 0.28 * k;
  }

  /** @param {boolean} v */
  setVisible(v) {
    this.group.visible = v;
    this.shadow.visible = v;
  }

  /** 從場景移除並釋放幾何（敵機換波/清場用）。 */
  dispose() {
    for (const m of this._planeMeshes) m.geometry.dispose();
    this.shadow.geometry.dispose();
    this.smoke.geometry.dispose();
    this.group.parent?.remove(this.group);
    this.shadow.parent?.remove(this.shadow);
  }
}
