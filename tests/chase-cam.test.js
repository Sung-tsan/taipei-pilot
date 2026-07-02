// @ts-check
// v5.2-1 追焦相機「正後方」回歸測試：
// HITL 回報轉彎時相機偏側後（四分之一斜視）。修法＝方位角域平滑。
// 本測試模擬直飛與等速轉彎，驗證收斂後相機恆在機尾正後方（角度誤差小）。
import { describe, it, expect } from 'vitest';
import { ChaseCam } from '../src/display/render/chase-cam.js';
import { wrapAngle } from '../src/lib/math.js';

const DT = 1 / 60;

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

/** 相機相對飛機的方位誤差：0＝正後方。 @param {ChaseCam} cc @param {any} s */
function behindError(cc, s) {
  const camBearing = Math.atan2(s.pos.x - cc.cam.position.x, -(s.pos.z - cc.cam.position.z));
  return Math.abs(wrapAngle(camBearing - s.heading));
}

describe('ChaseCam — 正後方（v5.2-1）', () => {
  it('直飛收斂後：相機在正後方（誤差 < 1°）', () => {
    const cc = new ChaseCam();
    const s = makeState();
    for (let i = 0; i < 300; i++) { step(s, 0); cc.update(/** @type {any} */ (s), DT); }
    expect(behindError(cc, s)).toBeLessThan((1 * Math.PI) / 180);
  });

  it('等速轉彎（0.5 rad/s）穩態：相機仍近正後方（誤差 < 8°，無四分之三斜視）', () => {
    const cc = new ChaseCam();
    const s = makeState();
    for (let i = 0; i < 600; i++) { step(s, 0.5); cc.update(/** @type {any} */ (s), DT); }
    // 角域平滑的穩態角差 ≈ ω/λ = 0.5/6 ≈ 4.8°；舊位置域 lerp 會拖到 20°+（斜視）。
    expect(behindError(cc, s)).toBeLessThan((8 * Math.PI) / 180);
  });

  it('轉彎中相機距離不塌陷（維持在機尾後方合理距離）', () => {
    const cc = new ChaseCam();
    const s = makeState();
    for (let i = 0; i < 600; i++) { step(s, 0.5); cc.update(/** @type {any} */ (s), DT); }
    const d = Math.hypot(s.pos.x - cc.cam.position.x, s.pos.z - cc.cam.position.z);
    expect(d).toBeGreaterThan(15); // BACK=22 的合理鄰域
    expect(d).toBeLessThan(30);
  });
});
