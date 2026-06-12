// @ts-check
// 飛機實體：PlaneState ↔ Three group 同步、螺旋槳轉速跟油門。
import * as THREE from 'three';
import { buildVoxelGeometry, voxelMaterial } from '../../voxel/build.js';
import { t34cBody, t34cProp, t34cPropPos, t34cGear } from '../../voxel/models/t34c.js';
import { SLOT_COLORS } from '../../../shared/constants.js';
import { expDamp } from '../../lib/math.js';

const GEAR_TOP = 0.62; // 起落架收進機腹的鉸點高度

export class PlaneEntity {
  /**
   * @param {THREE.Scene} scene
   * @param {number} slot
   */
  constructor(scene, slot) {
    this.slot = slot;
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ'; // yaw → pitch → roll

    const body = new THREE.Mesh(
      buildVoxelGeometry(t34cBody, { A: SLOT_COLORS[slot] }),
      voxelMaterial(),
    );
    this.group.add(body);

    this.prop = new THREE.Mesh(buildVoxelGeometry(t34cProp), voxelMaterial());
    this.prop.position.set(t34cPropPos.x, t34cPropPos.y, t34cPropPos.z);
    this.group.add(this.prop);

    // 起落架：geometry 平移到鉸點下方 → scale.y 收放（往機腹縮）
    const gearGeo = buildVoxelGeometry(t34cGear);
    gearGeo.translate(0, -GEAR_TOP, 0);
    this.gear = new THREE.Mesh(gearGeo, voxelMaterial());
    this.gear.position.y = GEAR_TOP;
    this.group.add(this.gear);
    this._gearK = 1; // 1=放下 0=收起

    // 假影子（貼地黑橢圓，廉價的高度感線索）
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(5, 12),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);

    this.group.visible = false;
    scene.add(this.group);
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
    this.prop.rotation.z += (6 + throttle * 30) * dt;

    // 起落架收放動畫（~0.8s 平滑縮放）
    const gearTarget = s.gearDown ? 1 : 0.04;
    this._gearK += (gearTarget - this._gearK) * expDamp(4, dt);
    this.gear.scale.y = this._gearK;
    this.gear.visible = this._gearK > 0.05;

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
