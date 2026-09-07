// @ts-check
// 第三人稱追焦相機：機尾後上方、前視偏移（6 歲減暈：地平線水平、不甩鏡頭）。
import * as THREE from 'three';
import { angDiff, expDamp } from '../../lib/math.js';

const BACK = 22;   // 機尾後方距離
const UP = 8;      // 上方高度
const AHEAD = 45;  // 注視點前移（看得到要飛去哪）
/** 航向突變超過此值（rad）→ 瞬間對齊（重生/瞬移），避免繞半圈斜視。 */
const HEADING_SNAP = 1.0;

export class ChaseCam {
  constructor() {
    this.cam = new THREE.PerspectiveCamera(60, 16 / 9, 1, 5200);
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._heading = 0;
    this._init = false;
  }

  /**
   * @param {import('../flight/flight-model.js').PlaneState} s
   * @param {number} dt
   * @param {number} [shake] 亂流鏡頭微晃幅度 0..1（v3.0-2，極輕、可關；減暈）
   * @param {number} [scale] 機體大小倍率（大機如 A330 把鏡頭往後/上拉，避免鑽進機身；小機=1）
   * @param {{back?:number, up?:number}} [mul] 機種鏡頭倍率微調（plane-specs model.cam；高尾翼機下降時需更高更遠）
   */
  update(s, dt, shake = 0, scale = 1, mul = {}) {
    // P0-1（2026-09-07 HITL 回歸）：幾何正後方。
    // 舊法＝方位角域平滑算目標後再對世界座標 lerp → 轉彎時目標沿弧走、lerp 抄近路，
    // 相機離開「機尾 −heading 軸」→ 穩態橫偏（0.5 rad/s ≈ 2.5 m）＝斜後方鎖死感。
    // 新法＝位置與注視的 XZ 永遠落在 s.heading 軸上（橫向分量 by construction = 0）；
    // 只對高度做輕平滑減暈。航向突變（重生）則整組瞬間對齊。
    const snapped = !this._init || Math.abs(angDiff(this._heading, s.heading)) > HEADING_SNAP;
    this._heading = s.heading;

    const back = BACK * scale * (mul.back ?? 1), up = UP * scale * (mul.up ?? 1);
    // P1-3：下降時略拉遠視注點，跑道／下滑更易讀（不改 XZ 幾何正後方鎖）。
    const descentBoost = s.mode === 'flying' && s.pitch < -0.04
      ? Math.min(0.35, (-s.pitch - 0.04) * 2.2)
      : 0;
    const ahead = AHEAD * scale * (1 + descentBoost);
    const dx = Math.sin(s.heading), dz = -Math.cos(s.heading);
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

    if (snapped) {
      this._pos.copy(targetPos);
      this._look.copy(targetLook);
      this._init = true;
    } else {
      // XZ 幾何鎖正後方（不 lerp，避免抄近路橫偏）；Y 輕平滑吸高度噪
      this._pos.x = targetPos.x;
      this._pos.z = targetPos.z;
      this._pos.y += (targetPos.y - this._pos.y) * expDamp(14.0, dt);
      this._look.x = targetLook.x;
      this._look.z = targetLook.z;
      this._look.y += (targetLook.y - this._look.y) * expDamp(11.0, dt);
    }
    this.cam.position.copy(this._pos);
    this.cam.lookAt(this._look);
    // 不再隨 bank 傾斜鏡頭（地平線恆水平）→ 起降對正最直覺、減暈；亂流微晃仍保留。
    if (shake > 0) {
      const t = performance.now() / 1000;
      const jz = (Math.sin(t * 23) + Math.sin(t * 37 + 1)) * 0.5;
      const jx = (Math.sin(t * 29 + 2) + Math.sin(t * 41 + 3)) * 0.5;
      this.cam.rotateZ(jz * 0.012 * shake);
      this.cam.rotateX(jx * 0.010 * shake);
    }
  }
}
