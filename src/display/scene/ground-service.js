// @ts-check
// v4.1-1 地勤車視覺：登機（加油/行李車停在飛機旁）+ pushback（拖車在機鼻推）。
// 重用 Kenney CC0 follow-me.glb（過 normalize 管線，§11）；純視覺 glue（瀏覽器/HITL 驗）。
import * as THREE from 'three';
import { loadToyModel } from '../assets/glb-model.js';

const CAR = '/models/follow-me.glb';
const CAR_LEN = 4.6;
const SIDE = 16; // m 地勤車離機身側向距
const NOSE = 15; // m 拖車離機鼻前向距

export class GroundService {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    /** @type {THREE.Group[]} */
    this._holders = [];
    for (let i = 0; i < 3; i++) {
      const h = new THREE.Group(); h.visible = false; scene.add(h);
      this._holders.push(h);
    }
    this._ready = false;
    loadToyModel(CAR, { lengthM: CAR_LEN }).then((tmpl) => {
      for (const h of this._holders) h.add(tmpl.clone(true));
      this._ready = true;
    }).catch(() => { /* 載入失敗：無地勤車，不爆 */ });
  }

  /** 登機：加油/行李車停在飛機左右側。 @param {{x:number,z:number}} pos @param {number} heading @param {{x:number,z:number}} dir */
  showBoarding(pos, heading, dir) {
    const nx = -dir.z, nz = dir.x; // 側向（lateral）單位向量
    const spots = [
      { dx: nx * SIDE, dz: nz * SIDE, h: heading + Math.PI / 2 },   // 右側（加油車）
      { dx: -nx * SIDE, dz: -nz * SIDE, h: heading - Math.PI / 2 }, // 左側（行李車）
    ];
    for (let i = 0; i < this._holders.length; i++) {
      const h = this._holders[i]; const s = spots[i];
      if (!s) { h.visible = false; continue; }
      h.position.set(pos.x + s.dx, 0, pos.z + s.dz);
      h.rotation.y = -s.h;
      h.visible = this._ready;
    }
  }

  /** pushback：拖車在機鼻前方推。 @param {{x:number,z:number}} pos @param {number} heading */
  showTug(pos, heading) {
    const fwd = { x: Math.sin(heading), z: -Math.cos(heading) };
    const h = this._holders[0];
    h.position.set(pos.x + fwd.x * NOSE, 0, pos.z + fwd.z * NOSE);
    h.rotation.y = -heading;
    h.visible = this._ready;
    this._holders[1].visible = false; this._holders[2].visible = false;
  }

  clear() { for (const h of this._holders) h.visible = false; }
}
