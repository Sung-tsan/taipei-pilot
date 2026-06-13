// @ts-check
// 任務框架 —— 純判定/挑選邏輯，零 DOM/Three，vitest 直測。UI 在 v1.1-4。
// 四型：地標尋寶 / 穿圈航線 / 高度挑戰 / 起降練習。適應性挑選＝純 JS 規則（端側無模型，全靜態）。
// 北極星 handoff v1.1-3 / ROADMAP §4 任務四型。

export const MISSION_TYPES = /** @type {const} */ ({
  LANDMARK_FIND: 'landmark_find',
  RING_ROUTE: 'ring_route',
  ALTITUDE: 'altitude',
  TAKEOFF_LANDING: 'takeoff_landing',
});

// —— 四型判定（皆純函式）——

/**
 * 地標尋寶：飛進目標光圈（水平距離容差；高度不卡，6 歲友善）。
 * @param {number} px @param {number} pz @param {{x:number,z:number}} target @param {number} [radius]
 */
export function inLandmarkRing(px, pz, target, radius = 280) {
  return Math.hypot(px - target.x, pz - target.z) <= radius;
}

/**
 * 沿折線等距取 N 個圈位（rings 從既有 rivers.js 折線取，不硬編座標）。
 * @param {[number,number][]} points 河流折線
 * @param {number} count 圈數
 * @returns {{x:number,z:number}[]}
 */
export function ringsAlongRiver(points, count) {
  if (points.length < 2 || count < 1) return [];
  // 累計弧長 → 等距取點
  const segLen = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const d = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
    segLen.push(d); total += d;
  }
  /** @type {{x:number,z:number}[]} */
  const rings = [];
  for (let k = 0; k < count; k++) {
    let target = (total * (k + 0.5)) / count; // 段中心均分
    let i = 0;
    while (i < segLen.length && target > segLen[i]) { target -= segLen[i]; i++; }
    const t = segLen[i] ? target / segLen[i] : 0;
    rings.push({
      x: points[i][0] + (points[i + 1][0] - points[i][0]) * t,
      z: points[i][1] + (points[i + 1][1] - points[i][1]) * t,
    });
  }
  return rings;
}

/**
 * 穿圈航線：依序穿過 rings。回傳更新後的 index（穿到下一個就 +1）；index===rings.length 即完成。
 * @param {number} index 目前該穿第幾個
 * @param {number} px @param {number} pz @param {{x:number,z:number}[]} rings @param {number} [radius]
 * @returns {number}
 */
export function advanceRings(index, px, pz, rings, radius = 200) {
  if (index < rings.length && inLandmarkRing(px, pz, rings[index], radius)) return index + 1;
  return index;
}

/**
 * 高度挑戰：到達/維持高度帶。
 * @param {number} altY 目前高度（m）
 * @param {{kind:'above'|'below'|'band', value?:number, min?:number, max?:number}} rule
 */
export function checkAltitude(altY, rule) {
  if (rule.kind === 'above') return altY >= (rule.value ?? 0);
  if (rule.kind === 'below') return altY <= (rule.value ?? 0);
  return altY >= (rule.min ?? 0) && altY <= (rule.max ?? Infinity); // band
}

/**
 * 起降練習：回松機跑道落地 或 真實模式機場外迫降成功（接 v1.1-2 事件）。
 * @param {'landed_runway'|'forced_landing_success'|string} event
 */
export function isTakeoffLandingDone(event) {
  return event === 'landed_runway' || event === 'forced_landing_success';
}

// —— 適應性挑選（純 JS 規則）——

/** @param {any} m */
function difficulty(m) { return m.difficulty ?? 1; }

/** 分數：先近後遠、先大後小（無座標的任務給中性距離） @param {any} m @param {{x:number,z:number}} p */
function score(m, p) {
  const dist = m.pos ? Math.hypot(m.pos.x - p.x, m.pos.z - p.z) : 5000;
  return dist - (m.size ?? 1) * 200; // size 大（地標大）→ 減分 → 先選
}

/**
 * 挑下一題：先近後遠、先大後小；上一題失敗 → 回填最簡單；雙人各自獨立（傳各自 doneIds）。
 * @param {any[]} pool 全部任務（landmark 類已附 pos/size）
 * @param {{x:number,z:number}} planePos
 * @param {Set<string>} doneIds 此玩家已完成
 * @param {boolean} [lastFailed]
 * @returns {any|null}
 */
export function pickNextMission(pool, planePos, doneIds, lastFailed = false) {
  const remaining = pool.filter((m) => !doneIds.has(m.id));
  if (!remaining.length) return null;
  if (lastFailed) return remaining.slice().sort((a, b) => difficulty(a) - difficulty(b))[0];
  return remaining.slice().sort((a, b) => score(a, planePos) - score(b, planePos))[0];
}
