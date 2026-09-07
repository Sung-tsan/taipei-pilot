// @ts-check
// P1-2 巡航世界標記 —— 航點穿越環（複用 race/corridor torus 語彙，不另造重美術）。
// 純視覺 glue（THREE）；節拍/穿圈判定在 route-engine.js（已測）。
import * as THREE from 'three';

const RING_NEXT = '#5fd0ff';   // 下一航點（亮青，同 corridor climb）
const RING_AHEAD = '#f2b94b';  // 後續航點（琥珀，同 race）
const RING_DONE = '#5ac46b';   // 已穿過（綠）
const BEAM = '#7ec8e3';

export class CruiseMarkers {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {THREE.Mesh[]} */
    this.rings = [];
    /** @type {THREE.Mesh[]} 航路方向小環（路徑可見，不只 HUD） */
    this.pathRings = [];
    /** @type {string[]} beatId 對應 rings 順序 */
    this._ids = [];
    this._t = 0;
  }

  /**
   * 建閘門環 + 沿航向的路徑小環（世界內可見航路）。
   * @param {{beatId:string,x:number,y:number,z:number,r:number}[]} gates
   * @param {{x:number,y:number,z:number}} origin 進雲位置
   */
  build(gates, origin) {
    this.clear();
    if (!gates.length) return;
    let prev = new THREE.Vector3(origin.x, origin.y, origin.z);
    gates.forEach((g, i) => {
      const mesh = this._ring(g.x, g.y, g.z, (g.r ?? 140) * 0.9, i === 0 ? RING_NEXT : RING_AHEAD);
      mesh.lookAt(prev);
      this.rings.push(mesh);
      this._ids.push(g.beatId);
      // 路徑小環：origin→gate 中點，讓航路在世界裡看得見
      const mid = new THREE.Vector3((prev.x + g.x) * 0.5, (prev.y + g.y) * 0.5, (prev.z + g.z) * 0.5);
      const pr = this._ring(mid.x, mid.y, mid.z, 42, BEAM);
      pr.lookAt(new THREE.Vector3(g.x, g.y, g.z));
      const mat = /** @type {THREE.MeshBasicMaterial} */ (pr.material);
      mat.opacity = 0.35;
      this.pathRings.push(pr);
      prev = new THREE.Vector3(g.x, g.y, g.z);
    });
  }

  /** @param {number} x @param {number} y @param {number} z @param {number} radius @param {string} color */
  _ring(x, y, z, radius, color) {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 6, 8, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, fog: false, depthWrite: false }),
    );
    mesh.position.set(x, y, z);
    mesh.renderOrder = 5;
    this.scene.add(mesh);
    return mesh;
  }

  /**
   * 依已解決閘門數淡化；下一座加亮。
   * @param {string[]} resolvedIds 已 hit/miss 的 beatId
   * @param {string|null} nextId 下一座 gate beatId
   */
  setProgress(resolvedIds, nextId) {
    const done = new Set(resolvedIds);
    this.rings.forEach((m, i) => {
      const id = this._ids[i];
      const mat = /** @type {THREE.MeshBasicMaterial} */ (m.material);
      if (done.has(id)) {
        mat.color.set(RING_DONE);
        mat.opacity = 0.28;
        m.scale.setScalar(0.9);
      } else if (id === nextId) {
        mat.color.set(RING_NEXT);
        mat.opacity = 0.85;
        m.scale.setScalar(1);
      } else {
        mat.color.set(RING_AHEAD);
        mat.opacity = 0.45;
        m.scale.setScalar(0.95);
      }
    });
  }

  /** 下一航點輕微脈動。 @param {number} dt */
  update(dt) {
    this._t += dt;
    const k = 1 + 0.07 * Math.sin(this._t * 3);
    for (let i = 0; i < this.rings.length; i++) {
      const mat = /** @type {THREE.MeshBasicMaterial} */ (this.rings[i].material);
      if (mat.opacity > 0.5) this.rings[i].scale.setScalar(k);
    }
  }

  clear() {
    for (const m of this.rings) { this.scene.remove(m); m.geometry.dispose(); /** @type {THREE.Material} */ (m.material).dispose(); }
    for (const m of this.pathRings) { this.scene.remove(m); m.geometry.dispose(); /** @type {THREE.Material} */ (m.material).dispose(); }
    this.rings = [];
    this.pathRings = [];
    this._ids = [];
  }
}
