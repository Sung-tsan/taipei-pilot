// @ts-check
// 折線跟隨數學（地面導航跟我車）：總長 / 定距取點 / 投影距離 / 領先 pose。
import { describe, it, expect } from 'vitest';
import {
  polylineLength, pointAtDistance, segHeading, projectDistance, followPose, nearestDistance,
} from '../src/display/scene/path-follow.js';

// 一條沿 +X 的直線折線（z=0）：(0,0)-(100,0)-(200,0)
const line = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 200, z: 0 }];

describe('path-follow 折線跟隨', () => {
  it('polylineLength：分段加總', () => {
    expect(polylineLength(line)).toBeCloseTo(200, 6);
    expect(polylineLength([])).toBe(0);
    expect(polylineLength([{ x: 5, z: 5 }])).toBe(0);
  });

  it('pointAtDistance：定距取點 + 夾兩端', () => {
    expect(pointAtDistance(line, 50).x).toBeCloseTo(50, 6);
    expect(pointAtDistance(line, 150).x).toBeCloseTo(150, 6);
    expect(pointAtDistance(line, -10).x).toBeCloseTo(0, 6);   // 夾到起點
    expect(pointAtDistance(line, 999).x).toBeCloseTo(200, 6); // 夾到終點
  });

  it('segHeading：+X 方向 heading = atan2(1,0) = +90°(π/2)', () => {
    expect(segHeading({ x: 0, z: 0 }, { x: 1, z: 0 })).toBeCloseTo(Math.PI / 2, 6);
    expect(segHeading({ x: 0, z: 0 }, { x: 0, z: -1 })).toBeCloseTo(0, 6); // -Z = 北
  });

  it('projectDistance：點投影到線上、回沿線距離（含偏移點）', () => {
    expect(projectDistance(line, { x: 60, z: 30 })).toBeCloseTo(60, 6); // 投影到 (60,0)
    expect(projectDistance(line, { x: -50, z: 0 })).toBeCloseTo(0, 6);  // 線外起點側 → 0
    expect(projectDistance(line, { x: 999, z: 0 })).toBeCloseTo(200, 6); // 末端
  });

  it('followPose：玩家投影後領先 leadDist 帶路；末端不超出', () => {
    const a = followPose(line, { x: 40, z: 5 }, 30); // 投影 40 + 領先 30 = 70
    expect(a.x).toBeCloseTo(70, 6);
    expect(a.heading).toBeCloseTo(Math.PI / 2, 6); // 沿 +X
    const end = followPose(line, { x: 190, z: 0 }, 50); // 190+50 夾到 200
    expect(end.x).toBeCloseTo(200, 6);
  });

  it('nearestDistance：垂直距離（越界偵測）；線上≈0、偏移=橫距', () => {
    expect(nearestDistance(line, { x: 50, z: 0 })).toBeCloseTo(0, 6);   // 線上
    expect(nearestDistance(line, { x: 50, z: 30 })).toBeCloseTo(30, 6); // 偏 30m
    expect(nearestDistance(line, { x: 250, z: 0 })).toBeCloseTo(50, 6); // 過末端 → 到終點 50m
  });

  it('防呆：空/單點折線不爆', () => {
    expect(pointAtDistance([], 10)).toEqual({ x: 0, z: 0, heading: 0, seg: 0 });
    expect(followPose([{ x: 3, z: 4 }], { x: 0, z: 0 }, 10).x).toBe(3);
    expect(projectDistance([{ x: 0, z: 0 }], { x: 1, z: 1 })).toBe(0);
  });
});
