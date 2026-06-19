// @ts-check
// v4.1 空中走廊（airborne corridor）：一趟完整航班的「空中」段＝離場爬升 + 進場下降的 traffic pattern。
// 起飛 → 爬升出場 → 右轉橫風 → 下風邊（北側，避開南側航廈）→ 左轉基腿 → 對正跑道10 → 五邊進場 → 落地
// （末點通過跑道頭，交回到場地面鏈）。純資料 + 純查詢，vitest 直測；視覺在 corridor-markers.js。
// 座標：runway frame（along 沿 RUNWAY_DIR、lateral 為其法線、alt 高度），轉世界靠 dir。

const HALF = 2605 / 2; // 跑道半長（與 airport.js / taxiway.js 同值）

/**
 * @typedef {{ along:number, lateral:number, alt:number, leg:'climb'|'cross'|'down'|'base'|'final', label:string }} CorridorWP
 * @typedef {{ x:number, z:number, alt:number, leg:string, label:string }} CorridorPoint
 */

/** 離場→進場 traffic pattern 航點（runway frame）。下風走北側（+lateral）避開南側航廈。 */
export const PATTERN = /** @type {CorridorWP[]} */ ([
  { along: HALF + 2200, lateral: 0, alt: 320, leg: 'climb', label: '爬升出場' },
  { along: HALF + 4200, lateral: 0, alt: 560, leg: 'climb', label: '續爬到高度' },
  { along: HALF + 4600, lateral: 2600, alt: 600, leg: 'cross', label: '右轉橫風邊' },
  { along: -HALF - 2400, lateral: 3000, alt: 520, leg: 'down', label: '下風邊（平飛）' },
  { along: -HALF - 4200, lateral: 1500, alt: 360, leg: 'base', label: '左轉基腿、開始下降' },
  { along: -HALF - 3600, lateral: 0, alt: 300, leg: 'final', label: '對正跑道10、放輪襟翼' },
  { along: -HALF - 1600, lateral: 0, alt: 150, leg: 'final', label: '五邊進場' },
  { along: -HALF + 60, lateral: 0, alt: 25, leg: 'final', label: '通過跑道頭，落地' },
]);

/** runway frame → 世界 (x,z)。 @param {number} along @param {number} lateral @param {{x:number,z:number}} dir */
export function corridorWorld(along, lateral, dir) {
  const nx = -dir.z, nz = dir.x;
  return { x: dir.x * along + nx * lateral, z: dir.z * along + nz * lateral };
}

/** 完整 pattern 的世界航點（含 alt/leg/label）。 @param {{x:number,z:number}} dir @returns {CorridorPoint[]} */
export function patternPoints(dir) {
  return PATTERN.map((w) => {
    const p = corridorWorld(w.along, w.lateral, dir);
    return { x: p.x, z: p.z, alt: w.alt, leg: w.leg, label: w.label };
  });
}

/**
 * 航點索引推進：到達目前航點（水平距 < reach）→ 進下一個；達末點則停在末點。
 * @param {CorridorPoint[]} pts @param {{x:number,z:number}} pos @param {number} idx @param {number} [reach]
 * @returns {number}
 */
export function advanceCorridor(pts, pos, idx, reach = 700) {
  let i = Math.max(0, Math.min(idx, pts.length - 1));
  if (i >= pts.length - 1) return i;
  const wp = pts[i];
  if (Math.hypot(pos.x - wp.x, pos.z - wp.z) < reach) i += 1;
  return i;
}

/** ATC 文字（依目前航點的 leg/label）。 @param {CorridorPoint|undefined} wp */
export function corridorAtc(wp) {
  if (!wp) return '';
  const head = wp.leg === 'final' ? '🗼 松山進場' : wp.leg === 'climb' ? '🗼 松山離場' : '🗼 松山近場';
  return `${head}：${wp.label}（目標高度 ${wp.alt}m）`;
}
