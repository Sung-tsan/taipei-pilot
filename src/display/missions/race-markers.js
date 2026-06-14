// @ts-check
// 競速賽道視覺標記（v2.1-1）—— 起點閘門 + 一串航圈（最後一個＝終點）。
// 純視覺 glue（THREE）；競速規則/計時/名次在 missions/race.js（純邏輯、已測）。
// HITL #4：要看得到「從哪飛到哪」——所以賽道要在 3D 世界畫出來，不是只有箭頭。
import * as THREE from 'three';

const RING_GOLD = '#f2b94b';   // 航圈（途中）
const RING_FINISH = '#5ac46b'; // 終點圈（綠）
const RING_START = '#5ad0e0';  // 起點閘門（青）

export class RaceMarkers {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {THREE.Mesh[]} 航圈（含終點） */
    this.rings = [];
    /** @type {THREE.Mesh|null} 起點閘門 */
    this.startMesh = null;
  }

  /**
   * 建賽道：起點閘門 + 依序航圈（最後一個著綠＝終點）。每圈軸朝「上一個點」→ 飛起來像穿越門。
   * @param {{x:number,z:number,y?:number,r?:number}[]} waypoints 依序航圈（最後＝終點）
   * @param {{x:number,z:number,y?:number}} start 起點（通常＝機場）
   */
  build(waypoints, start) {
    this.clear();
    // 起點閘門（矮一點、青色，標示「從這裡出發」）
    this.startMesh = this._ring(start.x, start.y ?? 80, start.z, 60, RING_START);
    this.startMesh.lookAt(waypoints[0] ? new THREE.Vector3(waypoints[0].x, waypoints[0].y ?? 250, waypoints[0].z) : new THREE.Vector3(0, 0, 0));

    let prev = new THREE.Vector3(start.x, start.y ?? 80, start.z);
    waypoints.forEach((w, i) => {
      const y = w.y ?? 250;
      const isFinish = i === waypoints.length - 1;
      const mesh = this._ring(w.x, y, w.z, (w.r ?? 90) * 0.85, isFinish ? RING_FINISH : RING_GOLD);
      mesh.lookAt(prev); // 軸朝上一個點 → 從上一點飛來剛好穿過
      this.rings.push(mesh);
      prev = new THREE.Vector3(w.x, y, w.z);
    });
  }

  /** @param {number} x @param {number} y @param {number} z @param {number} radius @param {string} color */
  _ring(x, y, z, radius, color) {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 5, 8, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
    );
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    return mesh;
  }

  /**
   * 過圈進度回饋：已穿過的圈淡化（用最領先進度，雙人共享賽道；個別導引靠箭頭）。
   * @param {number} passed 已穿過的航圈數
   */
  setProgress(passed) {
    this.rings.forEach((m, i) => {
      const mat = /** @type {THREE.MeshBasicMaterial} */ (m.material);
      mat.opacity = i < passed ? 0.25 : 0.85; // 過了的淡掉，沒過的亮
    });
  }

  /** 賽道輕微脈動（活一點，好找）。 @param {number} t 秒 */
  pulse(t) {
    const k = 1 + 0.06 * Math.sin(t * 2);
    for (const m of this.rings) m.scale.setScalar(k);
  }

  clear() {
    for (const m of this.rings) { this.scene.remove(m); m.geometry.dispose(); }
    this.rings = [];
    if (this.startMesh) { this.scene.remove(this.startMesh); this.startMesh.geometry.dispose(); this.startMesh = null; }
  }
}
