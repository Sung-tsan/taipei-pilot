// @ts-check
// 角落小地圖（雷達）—— 北朝上（north-up）共享雷達。
// 雙人分屏共用同一個雷達，所以固定北朝上、不可 heading-up。
// 圓心＝世界原點（松山機場跑道中心）。把每個 blip 依世界座標等比縮放畫上；
// 超出 WORLD_RADIUS 的 blip 夾到邊緣環（保留方向，邊緣以箭頭閃示「在更遠處」）。
//
// 座標系（與 flight-model 一致）：1 unit = 1m；X=東、Z=南、Y=高。
// 北朝上投影：世界 -Z → 螢幕上（小 y）、+X → 螢幕右。中心 (0,0) → 雷達正中央。
//
// 純投影數學（worldToRadar）可注入、可測；canvas 繪製靠 e2e/HITL（node 無 canvas）。
import { WORLD_RADIUS, SLOT_COLORS } from '../../../shared/constants.js';

/** 雷達邊緣留白（px）—— 外環與三角不貼死邊框 */
const MARGIN = 8;

/** 各 blip 種類的預設顏色（plane 類缺 color 時的退路；點類固定色） */
const KIND_COLOR = {
  self: SLOT_COLORS[0],
  ally: SLOT_COLORS[1],
  enemy: '#bbbbbb',
  balloon: '#ffd24a',
  target: '#7ad27a',
};

/**
 * @typedef {'self'|'ally'|'enemy'|'balloon'|'target'} BlipKind
 * @typedef {{ x:number, z:number, heading?:number, color?:string, kind:BlipKind }} Blip
 * @typedef {{ px:number, py:number, clamped:boolean }} RadarPoint
 */

/**
 * 世界座標 → 雷達畫布座標（純函式、決定性）。
 * 北朝上：-Z→上（小 py）、+X→右。中心 (0,0)→雷達正中央。
 * 超出 worldRadius 的點夾到半徑 R 的邊緣環（保留方向角），clamped:true。
 * NaN／壞輸入 → 回中心、clamped:false（不爆）。
 *
 * @param {number} x 世界 X（公尺，東為正）
 * @param {number} z 世界 Z（公尺，南為正）
 * @param {{ worldRadius?:number, size:number }} opts
 *   worldRadius＝世界半徑（公尺，缺省 WORLD_RADIUS）；size＝雷達直徑（px，必填）。
 * @returns {RadarPoint}
 */
export function worldToRadar(x, z, opts) {
  const worldRadius = opts.worldRadius ?? WORLD_RADIUS;
  const size = opts.size;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - MARGIN;

  // 壞輸入（NaN / 非數 / worldRadius<=0）→ 回中心，不爆。
  if (
    !Number.isFinite(x) || !Number.isFinite(z) ||
    !Number.isFinite(worldRadius) || worldRadius <= 0 ||
    !Number.isFinite(size)
  ) {
    return { px: cx, py: cy, clamped: false };
  }

  // 等比縮放到雷達半徑：x/worldRadius * R。
  // 北朝上：螢幕 y 軸向下，而世界 +Z（南）要落在螢幕下方 → ry = cy + (z/worldRadius)*R。
  // 於是世界 -Z（北）→ ry < cy（上半），符合「北朝上」。
  const nx = (x / worldRadius) * R;
  const nz = (z / worldRadius) * R;

  // 超界 → 夾到半徑 R 的邊緣環，保留方向角。
  const dist = Math.hypot(x, z);
  if (dist > worldRadius) {
    const k = R / Math.hypot(nx, nz); // = worldRadius / dist，把向量縮到長度剛好 R
    return { px: cx + nx * k, py: cy + nz * k, clamped: true };
  }

  return { px: cx + nx, py: cy + nz, clamped: false };
}

/**
 * 角落小地圖。建構時拿 canvas，render(blips) 每幀重畫。
 * canvas 取不到 2d context 就安靜 return（不爆）。
 */
export class Minimap {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ worldRadius?:number, size?:number }} [opts]
   *   worldRadius 缺省 WORLD_RADIUS；size＝雷達直徑 px，缺省 160。
   */
  constructor(canvas, { worldRadius = WORLD_RADIUS, size = 160 } = {}) {
    this.canvas = canvas;
    this.worldRadius = worldRadius;
    this.size = size;
    // 同步畫布像素尺寸（呼叫端可另用 CSS 縮放/HiDPI；此處只保證內部座標一致）。
    if (canvas) {
      canvas.width = size;
      canvas.height = size;
    }
  }

  /**
   * 重畫整個雷達。
   * @param {Blip[]} blips
   */
  render(blips) {
    const ctx = this.canvas?.getContext?.('2d');
    if (!ctx) return; // node / 無 2d context → 安靜跳過

    const size = this.size;
    const cx = size / 2;
    const cy = size / 2;
    const R = size / 2 - MARGIN;

    ctx.clearRect(0, 0, size, size);
    this._drawBase(ctx, cx, cy, R);

    if (!Array.isArray(blips)) return;
    for (const b of blips) {
      if (!b) continue;
      this._drawBlip(ctx, b);
    }
  }

  /**
   * 畫雷達底盤：圓形底 + 外環 + 中心十字 + 頂端「N」。
   * @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} R
   */
  _drawBase(ctx, cx, cy, R) {
    // 圓形半透明底
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8, 16, 28, 0.62)';
    ctx.fill();

    // 外環
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.stroke();

    // 中心十字
    ctx.beginPath();
    ctx.moveTo(cx - R, cy);
    ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R);
    ctx.lineTo(cx, cy + R);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.stroke();

    // 頂端「N」（北標）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = `${Math.round(R * 0.22)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', cx, cy - R + R * 0.16);
  }

  /**
   * 畫單一 blip。plane 類（self/ally/enemy）畫朝 heading 的小三角；
   * balloon/target 畫小圓點。clamped 的另疊一個指向外的小箭頭。
   * @param {CanvasRenderingContext2D} ctx @param {Blip} b
   */
  _drawBlip(ctx, b) {
    const { px, py, clamped } = worldToRadar(b.x, b.z, {
      worldRadius: this.worldRadius,
      size: this.size,
    });
    const color = b.color || KIND_COLOR[b.kind] || '#ffffff';
    const isPlane = b.kind === 'self' || b.kind === 'ally' || b.kind === 'enemy';

    if (isPlane) {
      this._drawTriangle(ctx, px, py, b.heading ?? 0, color, b.kind === 'self');
    } else {
      this._drawDot(ctx, px, py, color);
    }

    // 超界 → 在邊緣補一個朝「外（離心方向）」的小箭頭，閃示「在更遠處」。
    if (clamped) {
      const cx = this.size / 2;
      const cy = this.size / 2;
      const ang = Math.atan2(py - cy, px - cx); // 由圓心指向 blip 的方向
      this._drawEdgeArrow(ctx, px, py, ang, color);
    }
  }

  /**
   * 朝向小三角（機頭指 heading）。heading 0=北(-Z)、順時針增加。
   * 螢幕上：北＝向上、順時針＝畫布上的順時針（因 +X→右、+Z→下，與螢幕同手性）。
   * @param {CanvasRenderingContext2D} ctx @param {number} px @param {number} py
   * @param {number} heading @param {string} color @param {boolean} isSelf
   */
  _drawTriangle(ctx, px, py, heading, color, isSelf) {
    const s = isSelf ? 6 : 5; // 自機略大一點
    ctx.save();
    ctx.translate(px, py);
    // heading 0（北）要讓三角機頭朝上（螢幕 -y）。螢幕角度：0 rad = +x(右)。
    // 北朝上＋順時針 → 旋轉角 = heading（直接套用即可：見上方手性說明）。
    ctx.rotate(heading);
    ctx.beginPath();
    ctx.moveTo(0, -s);          // 機頭（朝上 = 北，旋轉後朝 heading）
    ctx.lineTo(s * 0.7, s * 0.8);
    ctx.lineTo(-s * 0.7, s * 0.8);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (isSelf) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 小圓點（balloon/target）。
   * @param {CanvasRenderingContext2D} ctx @param {number} px @param {number} py @param {string} color
   */
  _drawDot(ctx, px, py, color) {
    ctx.beginPath();
    ctx.arc(px, py, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  /**
   * 邊緣箭頭（clamped 時用）：在 blip 位置畫一個指向 ang 方向的小三角，提示「更遠處」。
   * @param {CanvasRenderingContext2D} ctx @param {number} px @param {number} py
   * @param {number} ang @param {string} color
   */
  _drawEdgeArrow(ctx, px, py, ang, color) {
    const a = 4;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang); // 螢幕角度，0=+x；箭頭尖端朝離心方向
    ctx.beginPath();
    ctx.moveTo(a, 0);
    ctx.lineTo(-a * 0.6, a * 0.7);
    ctx.lineTo(-a * 0.6, -a * 0.7);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.restore();
  }
}
