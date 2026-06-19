// @ts-check
// v4.1 空中走廊視覺：在接下來幾個航點放半透明「穿越環」（torus），孩子跟著環飛（離場爬升/進場下降）。
// 純視覺 glue（瀏覽器/e2e 驗）；航點資料/推進在 air-corridor.js（已測）。
import * as THREE from 'three';

const SHOW = 3; // 同時顯示接下來幾個環
/** @type {Record<string,string>} */
const COLORS = { climb: '#5fd0ff', cross: '#7fe0a0', down: '#7fe0a0', base: '#ffd96b', final: '#ff9d6b' };

export class CorridorMarkers {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    /** @type {THREE.Mesh[]} */
    this._rings = [];
    for (let i = 0; i < SHOW; i++) {
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(95, 8, 8, 24),
        new THREE.MeshBasicMaterial({ color: '#5fd0ff', transparent: true, opacity: 0.5, fog: false, depthWrite: false }),
      );
      m.visible = false; m.renderOrder = 4;
      scene.add(m);
      this._rings.push(m);
    }
    this._t = 0;
  }

  /** 放接下來的環（目標環最亮最大）。 @param {import('./air-corridor.js').CorridorPoint[]} pts @param {number} idx */
  show(pts, idx) {
    for (let k = 0; k < SHOW; k++) {
      const m = this._rings[k];
      const wp = pts[idx + k];
      if (!wp) { m.visible = false; continue; }
      m.position.set(wp.x, wp.alt, wp.z);
      const prev = pts[idx + k - 1] ?? wp; // 面向：前一航點 → 本航點（飛行方向 = 環法線 → 穿過去）
      const dx = wp.x - prev.x, dy = wp.alt - prev.alt, dz = wp.z - prev.z;
      if (dx * dx + dy * dy + dz * dz > 1e-3) m.lookAt(wp.x + dx, wp.alt + dy, wp.z + dz);
      const mat = /** @type {THREE.MeshBasicMaterial} */ (m.material);
      mat.color.set(COLORS[wp.leg] ?? '#5fd0ff');
      mat.opacity = k === 0 ? 0.6 : 0.3 - k * 0.06;
      m.scale.setScalar(k === 0 ? 1 : 0.85);
      m.visible = true;
    }
  }

  clear() { for (const m of this._rings) m.visible = false; }

  /** 目標環脈動。 @param {number} dt */
  update(dt) {
    this._t += dt;
    if (this._rings[0].visible) this._rings[0].scale.setScalar(1 + 0.06 * Math.sin(this._t * 3));
  }
}
