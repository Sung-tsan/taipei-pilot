// @ts-check
// 氣球靶（最溫和的入門空戰目標：命中＝啵/變星星，非暴力）。
// 'C' = 氣球色（accent，整合層用 paletteOverride 換多彩）、'S' = 繩色。
// 機鼻/前朝 -Z 慣例不影響靶（球對稱），原點 = 底部中心（繩尾），左右對稱。
// 尺寸玩具感：球體直徑 ~4m。

/**
 * @typedef {import('../build.js').VoxelModel} VoxelModel
 */

/**
 * 圓潤玩具氣球：用幾層橫切 box 由小→大→小堆出近似球體，
 * 頂部收一個小束口，下方一截細繩。
 * 球心約在 y≈3，球直徑 ~4m（最寬層 4.0m）。
 * @type {VoxelModel}
 */
export const balloonModel = {
  name: 'balloon',
  scale: 1,
  palette: {
    C: '#e0533d', // 氣球色（accent，預設暖紅；整合層可換成多彩）
    S: '#cfd3da', // 繩色（淺灰）
  },
  boxes: [
    // ── 細繩（從地面往上接到球底）──
    [-0.06, 0.00, -0.06, 0.12, 1.30, 0.12, 'S'],
    // ── 束口（球底收口的小錐）──
    [-0.30, 1.20, -0.30, 0.60, 0.40, 0.60, 'C'],
    // ── 球體：由下而上一層層橫切 box（寬度先增後減 → 近似球）──
    [-1.00, 1.55, -1.00, 2.00, 0.60, 2.00, 'C'], // 底層
    [-1.60, 2.10, -1.60, 3.20, 0.60, 3.20, 'C'], // 下中
    [-2.00, 2.65, -2.00, 4.00, 0.70, 4.00, 'C'], // 赤道（最寬）
    [-1.60, 3.30, -1.60, 3.20, 0.60, 3.20, 'C'], // 上中
    [-1.00, 3.85, -1.00, 2.00, 0.60, 2.00, 'C'], // 頂層
    [-0.40, 4.40, -0.40, 0.80, 0.40, 0.80, 'C'], // 頂冠
  ],
};

/**
 * 活動靶的純位移函式：讓氣球沿圓周或來回飄。
 * 決定性（同輸入同輸出）、不使用 Date.now / Math.random。
 *
 * opts 形狀：
 *   radius : number  漂移半徑（公尺）。0 → 固定靶，直接回 center。預設 0。
 *   speed  : number  角速度（radians / 單位 t）。預設 1。
 *   axis   : 'xz' | 'xy' | 'yz' | 'x' | 'y' | 'z'  漂移平面或單軸。預設 'xz'（水平繞圈）。
 *            'xz'|'xy'|'yz' → 在該平面繞圓；'x'|'y'|'z' → 沿該軸來回（正弦擺盪）。
 *   phase  : number  相位偏移（radians），讓多顆氣球錯開。預設 0。
 *
 * @param {{x:number,y:number,z:number}} center 漂移中心
 * @param {number} t 單調時間（秒或 tick，由呼叫端提供）
 * @param {{ radius?: number, speed?: number, axis?: string, phase?: number }} [opts]
 * @returns {{x:number,y:number,z:number}}
 */
export function balloonDriftPos(center, t, opts = {}) {
  const radius = opts.radius ?? 0;
  const speed = opts.speed ?? 1;
  const axis = opts.axis ?? 'xz';
  const phase = opts.phase ?? 0;

  // 固定靶：radius 0 直接回 center（呼叫端也可乾脆不呼叫本函式）。
  if (radius === 0) {
    return { x: center.x, y: center.y, z: center.z };
  }

  const ang = t * speed + phase;
  const c = Math.cos(ang) * radius;
  const s = Math.sin(ang) * radius;

  // 單軸來回（正弦擺盪，有界 [-radius, radius]）
  if (axis === 'x') return { x: center.x + s, y: center.y, z: center.z };
  if (axis === 'y') return { x: center.x, y: center.y + s, z: center.z };
  if (axis === 'z') return { x: center.x, y: center.y, z: center.z + s };

  // 平面繞圓（cos/sin 兩軸，有界 [-radius, radius]）
  if (axis === 'xy') return { x: center.x + c, y: center.y + s, z: center.z };
  if (axis === 'yz') return { x: center.x, y: center.y + c, z: center.z + s };
  // 預設 'xz'：水平面繞圈（最自然的氣球漂移）
  return { x: center.x + c, y: center.y, z: center.z + s };
}
