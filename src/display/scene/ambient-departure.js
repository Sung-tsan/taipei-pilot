// @ts-check
// v5.2 polish 排隊環境機：hold short 時「前面那架」真的從跑道頭起飛離場（原本只有 ATC 文字）。
// scripted 運動學（加速→抬頭→爬升→飛遠 despawn），零 AI、零碰撞——純氛圍 transient，
// 補 POLISH_BACKLOG 維度 2「起飛排序可見的前面那架」取捨回收。THREE glue（e2e/HITL 驗）。
import * as THREE from 'three';
import { buildVoxelGeometry, voxelMaterial } from '../../voxel/build.js';
import { airlinerBody } from './airport-life.js';

const ACCEL = 5.5;        // m/s² 滾行加速
const V_ROTATE = 46;      // m/s 抬頭速度
const V_MAX = 78;         // m/s 離場極速
const CLIMB_MAX = 14;     // m/s 最大爬升率
const PITCH_MAX = 0.24;   // rad 爬升姿態
const DESPAWN_ALT = 320;  // m 飛到此高度收掉

export class AmbientDeparture {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {THREE.Group|null} */
    this.group = null;
    this._speed = 0;
    this._vy = 0;
    this._dir = { x: 0, z: -1 };
    this._holdSec = 0; // 起滾前在跑道頭停一拍（有「排到它了」的節奏）
  }

  get active() { return !!this.group; }

  /**
   * 從跑道頭起飛（呼叫端在進 holdShort 時觸發）。已在飛＝忽略（一次一架）。
   * @param {{x:number,z:number}} runwayDir 跑道方向（起飛沿 +dir）
   * @param {number} runwayLength 跑道全長（m）
   */
  start(runwayDir, runwayLength) {
    if (this.group) return;
    const g = new THREE.Group();
    const geo = buildVoxelGeometry(airlinerBody, { A: '#e8e8ee' });
    geo.rotateY(Math.PI); // airlinerBody 機鼻朝 -Z → 轉成朝 +Z，再由 group 對齊跑道向
    g.add(new THREE.Mesh(geo, voxelMaterial()));
    const half = runwayLength / 2;
    g.position.set(runwayDir.x * (-half + 90), 0, runwayDir.z * (-half + 90));
    g.rotation.y = Math.atan2(runwayDir.x, runwayDir.z); // group +Z 對齊 runwayDir
    this.scene.add(g);
    this.group = g;
    this._dir = { x: runwayDir.x, z: runwayDir.z };
    this._speed = 0; this._vy = 0; this._holdSec = 0.9;
  }

  /** 每幀推進；未啟用＝無事（呼叫端可無腦每幀呼叫）。 @param {number} dt */
  update(dt) {
    const g = this.group;
    if (!g || !Number.isFinite(dt)) return;
    if (this._holdSec > 0) { this._holdSec -= dt; return; } // 跑道頭停一拍
    this._speed = Math.min(V_MAX, this._speed + ACCEL * dt);
    if (this._speed >= V_ROTATE) {
      this._vy = Math.min(CLIMB_MAX, this._vy + 6 * dt);
      g.rotation.x = -Math.min(PITCH_MAX, (this._vy / CLIMB_MAX) * PITCH_MAX); // 抬頭（-x＝機鼻上）
    }
    g.position.x += this._dir.x * this._speed * dt;
    g.position.z += this._dir.z * this._speed * dt;
    g.position.y += this._vy * dt;
    if (g.position.y > DESPAWN_ALT) this.clear();
  }

  /** 收掉（換場/離開離場流程）。 */
  clear() {
    if (!this.group) return;
    this.group.traverse((o) => { const m = /** @type {THREE.Mesh} */ (o); if (/** @type {any} */ (m).isMesh) m.geometry?.dispose(); });
    this.scene.remove(this.group);
    this.group = null;
  }
}
