// @ts-check
// P0-1 / v5.2-1 追焦相機「正後方」回歸測試：
// HITL：轉彎時斜後方鎖死、直線飛仍感偏斜。修法＝XZ 幾何鎖在 −heading 軸（不世界 lerp）。
import { describe, it, expect } from 'vitest';
import { ChaseCam } from '../src/display/render/chase-cam.js';
import { wrapAngle } from '../src/lib/math.js';

const DT = 1 / 60;
const EPS_LAT = 1e-4; // 收斂後橫向分量容許（數值噪）

/** 造一個最小 PlaneState（相機只讀 pos/heading/pitch）。 */
function makeState() {
  return { pos: { x: 0, y: 500, z: 0 }, heading: 0, pitch: 0 };
}

/**
 * 前進一幀：等速前飛 + 指定轉速。
 * @param {{pos:{x:number,y:number,z:number},heading:number,pitch:number}} s
 * @param {number} turnRate rad/s
 */
function step(s, turnRate) {
  s.heading = wrapAngle(s.heading + turnRate * DT);
  const v = 60; // m/s
  s.pos.x += Math.sin(s.heading) * v * DT;
  s.pos.z += -Math.cos(s.heading) * v * DT;
}

/**
 * 相機相對飛機的橫向分量（heading 右側為正）與後方距離。
 * 正後方 ⇒ |lateral| ≈ 0、aft ≈ BACK*scale。
 * @param {ChaseCam} cc @param {any} s
 */
function offsetInHeadingFrame(cc, s) {
  const ox = cc.cam.position.x - s.pos.x;
  const oz = cc.cam.position.z - s.pos.z;
  const fx = Math.sin(s.heading), fz = -Math.cos(s.heading);
  const rx = Math.cos(s.heading), rz = Math.sin(s.heading);
  return {
    lateral: ox * rx + oz * rz,
    aft: -(ox * fx + oz * fz),
  };
}

/** 相機相對飛機的方位誤差：0＝正後方。 @param {ChaseCam} cc @param {any} s */
function behindError(cc, s) {
  const camBearing = Math.atan2(s.pos.x - cc.cam.position.x, -(s.pos.z - cc.cam.position.z));
  return Math.abs(wrapAngle(camBearing - s.heading));
}

describe('ChaseCam — 正後方（P0-1）', () => {
  it('直飛收斂後：相機 offset 沿 −heading（橫向 < eps）', () => {
    const cc = new ChaseCam();
    const s = makeState();
    for (let i = 0; i < 300; i++) { step(s, 0); cc.update(/** @type {any} */ (s), DT); }
    const { lateral, aft } = offsetInHeadingFrame(cc, s);
    expect(Math.abs(lateral)).toBeLessThan(EPS_LAT);
    expect(aft).toBeGreaterThan(20);
    expect(aft).toBeLessThan(24);
    expect(behindError(cc, s)).toBeLessThan((0.1 * Math.PI) / 180);
  });

  it('等速轉彎中：仍無橫向分量（不鎖四分之三斜視）', () => {
    const cc = new ChaseCam();
    const s = makeState();
    let maxLat = 0;
    for (let i = 0; i < 600; i++) {
      step(s, 0.5);
      cc.update(/** @type {any} */ (s), DT);
      maxLat = Math.max(maxLat, Math.abs(offsetInHeadingFrame(cc, s).lateral));
    }
    expect(maxLat).toBeLessThan(EPS_LAT);
    expect(behindError(cc, s)).toBeLessThan((0.1 * Math.PI) / 180);
  });

  it('轉彎結束後 1s：橫向仍為 0（無殘留斜視）', () => {
    const cc = new ChaseCam();
    const s = makeState();
    for (let i = 0; i < 300; i++) { step(s, 0.5); cc.update(/** @type {any} */ (s), DT); }
    for (let i = 0; i < 60; i++) { step(s, 0); cc.update(/** @type {any} */ (s), DT); } // 1s settle
    const { lateral } = offsetInHeadingFrame(cc, s);
    expect(Math.abs(lateral)).toBeLessThan(EPS_LAT);
  });

  it('航向突變（重生）瞬間對齊正後方，不繞大弧', () => {
    const cc = new ChaseCam();
    const s = makeState();
    for (let i = 0; i < 60; i++) { step(s, 0); cc.update(/** @type {any} */ (s), DT); }
    s.heading = wrapAngle(s.heading + Math.PI); // 180° snap
    s.pos = { x: 1000, y: 500, z: -1000 };
    cc.update(/** @type {any} */ (s), DT);
    const { lateral, aft } = offsetInHeadingFrame(cc, s);
    expect(Math.abs(lateral)).toBeLessThan(EPS_LAT);
    expect(aft).toBeGreaterThan(20);
    expect(aft).toBeLessThan(24);
  });

  it('轉彎中相機距離不塌陷（維持在機尾後方合理距離）', () => {
    const cc = new ChaseCam();
    const s = makeState();
    for (let i = 0; i < 600; i++) { step(s, 0.5); cc.update(/** @type {any} */ (s), DT); }
    const d = Math.hypot(s.pos.x - cc.cam.position.x, s.pos.z - cc.cam.position.z);
    expect(d).toBeGreaterThan(15); // BACK=22 的合理鄰域
    expect(d).toBeLessThan(30);
  });

  it('camScale / camMul 只拉遠拉高，不引入橫向分量', () => {
    const cc = new ChaseCam();
    const s = makeState();
    const scale = 50 / 28; // A330-ish
    const mul = { back: 1.1, up: 1.3 };
    for (let i = 0; i < 120; i++) { step(s, 0.2); cc.update(/** @type {any} */ (s), DT, 0, scale, mul); }
    const { lateral, aft } = offsetInHeadingFrame(cc, s);
    expect(Math.abs(lateral)).toBeLessThan(EPS_LAT);
    expect(aft).toBeGreaterThan(22 * scale * 1.1 - 0.5);
    expect(aft).toBeLessThan(22 * scale * 1.1 + 0.5);
  });
});
