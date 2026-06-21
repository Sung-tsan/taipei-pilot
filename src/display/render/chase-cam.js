// @ts-check
// 第三人稱追焦相機：機尾後上方、前視偏移、重阻尼平滑（6 歲減暈：不甩鏡頭）。
import * as THREE from 'three';
import { expDamp } from '../../lib/math.js';

const BACK = 22;   // 機尾後方距離
const UP = 8;      // 上方高度
const AHEAD = 45;  // 注視點前移（看得到要飛去哪）

export class ChaseCam {
  constructor() {
    this.cam = new THREE.PerspectiveCamera(60, 16 / 9, 1, 5200);
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._init = false;
  }

  /**
   * @param {import('../flight/flight-model.js').PlaneState} s
   * @param {number} dt
   * @param {number} [shake] 亂流鏡頭微晃幅度 0..1（v3.0-2，極輕、可關；減暈）
   * @param {number} [scale] 機體大小倍率（大機如 A330 把鏡頭往後/上拉，避免鑽進機身；小機=1）
   */
  update(s, dt, shake = 0, scale = 1) {
    const dx = Math.sin(s.heading), dz = -Math.cos(s.heading);
    const back = BACK * scale, up = UP * scale, ahead = AHEAD * scale;
    const targetPos = new THREE.Vector3(
      s.pos.x - dx * back,
      Math.max(s.pos.y + up, 3), // 地面滾行時不鑽進地下
      s.pos.z - dz * back,
    );
    const targetLook = new THREE.Vector3(
      s.pos.x + dx * ahead,
      s.pos.y + s.pitch * 30 + 2, // 俯仰時注視點跟著抬/壓一點
      s.pos.z + dz * ahead,
    );
    if (!this._init) {
      this._pos.copy(targetPos);
      this._look.copy(targetLook);
      this._init = true;
    } else {
      // HITL 2026-06-21 第二輪：起降/轉彎「對正」——相機要緊跟「正後方」。原本位置追太慢(3.2)→轉彎時
      // 相機落在機身側後方＝四分之三斜視（看起來偏右後）。位置追快一點 + 注視點貼機身（plane 恆置中）。
      this._pos.lerp(targetPos, expDamp(6.0, dt));
      this._look.lerp(targetLook, expDamp(11.0, dt));
    }
    this.cam.position.copy(this._pos);
    this.cam.lookAt(this._look);
    // 不再隨 bank 傾斜鏡頭（地平線恆水平）→ 起降對正最直覺、減暈；亂流微晃仍保留（下方 shake）。
    // 亂流微晃（極輕、平滑噪音；shake=0 或關閉＝完全無晃，減暈鐵律）
    if (shake > 0) {
      const t = performance.now() / 1000;
      const jz = (Math.sin(t * 23) + Math.sin(t * 37 + 1)) * 0.5;
      const jx = (Math.sin(t * 29 + 2) + Math.sin(t * 41 + 3)) * 0.5;
      this.cam.rotateZ(jz * 0.012 * shake);
      this.cam.rotateX(jx * 0.010 * shake);
    }
  }
}
