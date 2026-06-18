// @ts-check
// 折線跟隨數學（地面導航「跟我車」用）—— 純函式，vitest 直測、零 THREE/DOM。
// 座標：水平平面 {x,z}（與 flight-model 同制）；heading = atan2(dx, -dz)（0=北/-Z、順時針增）。
// 用途：跟我車沿 taxiway 路線「領先玩家一段」帶路；綠中線燈沿同一條折線鋪。

/** @typedef {{ x:number, z:number }} P2 */

/** 折線總長。 @param {P2[]} pts @returns {number} */
export function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return len;
}

/**
 * 折線上「距起點 d 公尺」的點 + 該處朝向（heading）。d 夾到 [0, 總長]。
 * @param {P2[]} pts @param {number} d
 * @returns {{ x:number, z:number, heading:number, seg:number }}
 */
export function pointAtDistance(pts, d) {
  if (!pts || pts.length === 0) return { x: 0, z: 0, heading: 0, seg: 0 };
  if (pts.length === 1) return { x: pts[0].x, z: pts[0].z, heading: 0, seg: 0 };
  const total = polylineLength(pts);
  let target = Number.isFinite(d) ? d : 0;
  if (target <= 0) {
    const h = segHeading(pts[0], pts[1]);
    return { x: pts[0].x, z: pts[0].z, heading: h, seg: 0 };
  }
  if (target >= total) {
    const n = pts.length - 1;
    return { x: pts[n].x, z: pts[n].z, heading: segHeading(pts[n - 1], pts[n]), seg: n - 1 };
  }
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]; const b = pts[i];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z) || 1e-9;
    if (acc + segLen >= target) {
      const t = (target - acc) / segLen;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: segHeading(a, b), seg: i - 1 };
    }
    acc += segLen;
  }
  const n = pts.length - 1;
  return { x: pts[n].x, z: pts[n].z, heading: segHeading(pts[n - 1], pts[n]), seg: n - 1 };
}

/** 段 a→b 的 heading（atan2(dx, -dz)）。 @param {P2} a @param {P2} b */
export function segHeading(a, b) { return Math.atan2(b.x - a.x, -(b.z - a.z)); }

/**
 * 點 p 投影到折線後「沿線距起點」的距離（玩家走多遠了）。
 * @param {P2[]} pts @param {P2} p @returns {number}
 */
export function projectDistance(pts, p) {
  if (!pts || pts.length < 2) return 0;
  let best = Infinity; let bestAlong = 0; let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]; const b = pts[i];
    const dx = b.x - a.x; const dz = b.z - a.z;
    const segLen2 = dx * dx + dz * dz || 1e-9;
    let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / segLen2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + dx * t; const pz = a.z + dz * t;
    const d2 = (p.x - px) * (p.x - px) + (p.z - pz) * (p.z - pz);
    if (d2 < best) { best = d2; bestAlong = acc + t * Math.sqrt(segLen2); }
    acc += Math.sqrt(segLen2);
  }
  return bestAlong;
}

/**
 * 跟我車 pose：投影玩家到折線、再沿線前進 leadDist（領先帶路）。夾到折線末端。
 * @param {P2[]} pts @param {P2} playerPos @param {number} leadDist
 * @returns {{ x:number, z:number, heading:number, seg:number }}
 */
export function followPose(pts, playerPos, leadDist) {
  const along = projectDistance(pts, playerPos);
  return pointAtDistance(pts, along + (Number.isFinite(leadDist) ? leadDist : 0));
}

/**
 * 點 p 到折線的最近（垂直）距離（公尺）。地面導航「越界」偵測：偏離綠線多遠。
 * @param {P2[]} pts @param {P2} p @returns {number}
 */
export function nearestDistance(pts, p) {
  if (!pts || pts.length === 0) return 0;
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.z - pts[0].z);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]; const b = pts[i];
    const dx = b.x - a.x; const dz = b.z - a.z;
    const segLen2 = dx * dx + dz * dz || 1e-9;
    let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / segLen2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + dx * t; const pz = a.z + dz * t;
    const d2 = (p.x - px) * (p.x - px) + (p.z - pz) * (p.z - pz);
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}
