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
 * 折線轉角圓弧化（fillet；v5.2-2「導航線拉直」）。
 * taxiway 節點直連是 90° 硬轉角（HITL：綠線「歪歪的」）——本函式把每個轉角 > minAngle 的頂點
 * 換成內切圓弧的取樣點，輸出仍是折線（{x,z} 點列），pointAtDistance / followPose 等下游零改動。
 * 切線距夾在相鄰段長的一半內（兩個近轉角不互吃）；半徑隨之自動縮。純函式、無副作用。
 * @param {P2[]} pts 原折線
 * @param {number} [radius] 目標圓角半徑（m）
 * @param {number} [minAngleRad] 低於此轉角不圓化（近直線不加點）
 * @returns {P2[]} 圓角化後折線（點數 ≥ 原折線；輸入 < 3 點原樣回傳副本）
 */
export function filletPolyline(pts, radius = 26, minAngleRad = (25 * Math.PI) / 180) {
  if (!Array.isArray(pts)) return [];
  if (pts.length < 3) return pts.map((p) => ({ x: p.x, z: p.z }));
  const ARC_STEP = (12 * Math.PI) / 180; // 弧取樣角步（≈每 12° 一點）
  /** @type {P2[]} */
  const out = [{ x: pts[0].x, z: pts[0].z }];
  /** 推點並去重（兩個近轉角相接時 P2/P1 重合 → 零長段會弄壞 heading）。 @param {P2} p */
  const push = (p) => {
    const last = out[out.length - 1];
    if (Math.hypot(p.x - last.x, p.z - last.z) > 1e-6) out.push(p);
  };
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1], B = pts[i], C = pts[i + 1];
    const l1 = Math.hypot(B.x - A.x, B.z - A.z);
    const l2 = Math.hypot(C.x - B.x, C.z - B.z);
    if (l1 < 1e-6 || l2 < 1e-6) continue; // 零長段：跳過重複點
    const v1 = { x: (B.x - A.x) / l1, z: (B.z - A.z) / l1 };
    const v2 = { x: (C.x - B.x) / l2, z: (C.z - B.z) / l2 };
    const dot = Math.min(1, Math.max(-1, v1.x * v2.x + v1.z * v2.z));
    const turn = Math.acos(dot); // 轉角（0=直線、π=回頭）
    if (turn < minAngleRad || turn > Math.PI - 0.05) {
      push({ x: B.x, z: B.z }); // 近直線或近回頭（無法內切）：保留原頂點
      continue;
    }
    // 切線距 t = r·tan(turn/2)，夾相鄰段半長；半徑隨夾後 t 反推（近轉角自動縮小圓角）。
    const tanHalf = Math.tan(turn / 2);
    const t = Math.min(radius * tanHalf, l1 / 2, l2 / 2);
    const r = t / tanHalf;
    const P1 = { x: B.x - v1.x * t, z: B.z - v1.z * t }; // 入弧點
    const P2 = { x: B.x + v2.x * t, z: B.z + v2.z * t }; // 出弧點
    const s = Math.sign(v1.x * v2.z - v1.z * v2.x) || 1; // 轉向（x-z 平面叉積）
    const center = { x: P1.x - s * v1.z * r, z: P1.z + s * v1.x * r };
    const n = Math.max(1, Math.ceil(turn / ARC_STEP));
    const a0 = Math.atan2(P1.z - center.z, P1.x - center.x);
    push(P1);
    for (let j = 1; j < n; j++) {
      const a = a0 + s * turn * (j / n);
      push({ x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r });
    }
    push(P2);
  }
  push({ x: pts[pts.length - 1].x, z: pts[pts.length - 1].z });
  return out;
}

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
