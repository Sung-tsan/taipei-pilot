// @ts-check
// V4 地面導航「三合一」（handoff v4.0-1 P3）：跟我車(CC0 GLB) + 綠中線燈高亮路線 + ATC 文字框架。
// 設計：地面版的「回家箭頭」——孩子跟著引導車走就好，不必看懂滑行道圖（v4.0-2 GO/NO-GO 6 歲跟得上）。
// 純路徑數學在 path-follow.js（已測）；本檔只把它接上 Three（glue，瀏覽器/e2e 驗）。
import * as THREE from 'three';
import { loadToyModel } from '../assets/glb-model.js';
import { followPose, pointAtDistance, polylineLength } from './path-follow.js';

const CAR_GLB = '/models/follow-me.glb';
const CAR_LEN = 4.6;       // 跟我車目標長度（Kenney sedan）
const CAR_YAW = 0;         // 車頭朝向修正（待 HITL，同 GLB 朝向議題）
const LEAD_DIST = 45;      // m 跟我車領先玩家（帶路距離）
const LIGHT_SPACING = 24;  // m 綠中線燈間距
const MAX_LIGHTS = 256;

export class GroundNav {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    /** @type {{x:number,z:number}[]} 世界點折線 */
    this._route = [];
    this._label = ''; // ATC 文字（佔位；真 phraseology v4.1-2）
    this._t = 0;

    // 綠中線燈：InstancedMesh（1 draw call），rebuild 時設 count/matrix
    this._lightGeo = new THREE.BoxGeometry(3.2, 0.3, 3.2);
    this._lightMat = new THREE.MeshBasicMaterial({ color: '#39e36b' });
    this._lights = new THREE.InstancedMesh(this._lightGeo, this._lightMat, MAX_LIGHTS);
    this._lights.count = 0;
    this._lights.frustumCulled = false;
    this._lights.visible = false;
    scene.add(this._lights);

    // 跟我車（CC0 GLB，async；過 normalize 管線）
    this._carReady = false;
    this._carHolder = new THREE.Group();
    this._carHolder.visible = false;
    scene.add(this._carHolder);
    loadToyModel(CAR_GLB, { lengthM: CAR_LEN }).then((tmpl) => {
      const car = tmpl.clone(true);
      car.rotation.y = CAR_YAW;
      this._carHolder.add(car);
      this._carReady = true;
      this._carHolder.visible = this.active;
    }).catch(() => { /* 載入失敗：仍有中線燈+ATC，不爆 */ });
  }

  /**
   * 設導航路線（世界點折線）+ ATC 文字。少於 2 點＝關閉。
   * @param {{x:number,z:number}[]} worldPoints @param {string} [label]
   */
  setRoute(worldPoints, label = '') {
    this._route = Array.isArray(worldPoints) ? worldPoints.filter(Boolean) : [];
    this._label = label;
    this.active = this._route.length >= 2;
    this._buildLights();
    this._lights.visible = this.active;
    this._carHolder.visible = this.active && this._carReady;
  }

  /** 關閉導航（離開地面/換非民航機）。 */
  clear() {
    this.active = false;
    this._route = [];
    this._label = '';
    this._lights.visible = false;
    this._lights.count = 0;
    this._carHolder.visible = false;
  }

  /** ATC 指示文字（HUD 顯示）；未啟用＝空。 */
  get atcText() { return this.active ? this._label : ''; }

  /** 沿路線鋪綠中線燈（等距）。 */
  _buildLights() {
    if (!this.active) { this._lights.count = 0; return; }
    const total = polylineLength(this._route);
    const n = Math.min(MAX_LIGHTS, Math.max(2, Math.floor(total / LIGHT_SPACING) + 1));
    const m = new THREE.Matrix4();
    let idx = 0;
    for (let i = 0; i < n && idx < MAX_LIGHTS; i++) {
      const p = pointAtDistance(this._route, (i / (n - 1)) * total);
      m.makeTranslation(p.x, 0.4, p.z);
      this._lights.setMatrixAt(idx++, m);
    }
    this._lights.count = idx;
    this._lights.instanceMatrix.needsUpdate = true;
  }

  /**
   * 每幀：跟我車領先玩家沿路線帶路 + 中線燈綠閃脈動。
   * @param {number} dt @param {{x:number,z:number}|null} playerPos @param {number} now ms
   */
  update(dt, playerPos, now) {
    if (!this.active) return;
    this._t = (Number.isFinite(now) ? now : 0) / 1000;
    if (this._carReady && playerPos) {
      const pose = followPose(this._route, playerPos, LEAD_DIST);
      this._carHolder.position.set(pose.x, 0, pose.z);
      this._carHolder.rotation.y = -pose.heading;
      this._carHolder.visible = true;
    }
    const k = 0.55 + 0.45 * Math.sin(this._t * 4); // 綠閃（好跟）
    this._lightMat.color.setRGB(0.12 * k, 0.89 * k, 0.42 * k);
  }
}
