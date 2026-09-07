// @ts-check
// 地標名牌：Sprite + canvas 中文描邊字（billboard 自動面向各視口相機），
// 距任一架飛機 < 淡入半徑才顯示。
// P1-4：支援兩行文案（機場名＋ICAO）；距離改用 sprite 世界座標（template 機場 group 有 yaw 時才準）。
import * as THREE from 'three';

const FADE_NEAR = 900;   // 全亮
const FADE_FAR = 1800;   // 全隱
const MAX_VISIBLE = 6;   // 同屏標籤上限（P1-4：機場抬頭＋招牌地標可並存）
const SCALE_FAR = 0.62;  // 遠端縮到的比例（距離縮放＝深度線索，減擁擠）

export class LandmarkLabels {
  /**
   * @param {THREE.Group} parent
   * @param {import('../scene/taipei.js').LandmarkInfo[]} landmarks
   */
  constructor(parent, landmarks) {
    /** @type {{ sprite: THREE.Sprite, x:number, z:number, d:number, baseW:number, baseH:number }[]} */
    this.items = landmarks.map((lm) => {
      const kind = /** @type {any} */ (lm).kind === 'airport' ? 'airport' : 'landmark';
      const sprite = makeTextSprite(lm.name, { kind });
      // 本地座標（parent＝機場 group；template 有 yaw 時仍正確）
      sprite.position.set(lm.x, lm.topY + (kind === 'airport' ? 70 : 55), lm.z);
      parent.add(sprite);
      const baseW = kind === 'airport' ? 520 : 440;
      const baseH = kind === 'airport' ? 150 : 110;
      sprite.scale.set(baseW, baseH, 1);
      return { sprite, x: lm.x, z: lm.z, d: Infinity, baseW, baseH };
    });
    /** @type {THREE.Vector3} */
    this._wp = new THREE.Vector3();
  }

  /** @param {{x:number,z:number}[]} planePositions 連線中的飛機位置 */
  update(planePositions) {
    for (const item of this.items) {
      // P1-4：世界座標距離（修 template 機場 group.rotation.y 造成的本地/世界錯位）
      item.sprite.getWorldPosition(this._wp);
      let dMin = Infinity;
      for (const p of planePositions) {
        dMin = Math.min(dMin, Math.hypot(p.x - this._wp.x, p.z - this._wp.z));
      }
      item.d = dMin;
    }
    // 同屏上限：只留最近的 MAX_VISIBLE 顆（市區七地標群聚時不再滿屏互疊）
    const rank = [...this.items].sort((a, b) => a.d - b.d);
    const allowed = new Set(rank.slice(0, MAX_VISIBLE));
    for (const item of this.items) {
      const t = Math.min(Math.max((item.d - FADE_NEAR) / (FADE_FAR - FADE_NEAR), 0), 1);
      const opacity = allowed.has(item) ? 1 - t : 0;
      /** @type {THREE.SpriteMaterial} */ (item.sprite.material).opacity = opacity;
      item.sprite.visible = opacity > 0.02;
      const k = 1 - (1 - SCALE_FAR) * t; // 近大遠小
      item.sprite.scale.set(item.baseW * k, item.baseH * k, 1);
    }
  }
}

/**
 * Canvas 文字 sprite（可兩行：機場名\\nICAO）。
 * @param {string} text
 * @param {{ kind?: 'airport'|'landmark'|'plane', fill?: string, stroke?: string }} [opts]
 * @returns {THREE.Sprite}
 */
export function makeTextSprite(text, opts = {}) {
  const kind = opts.kind ?? 'landmark';
  const lines = String(text).split(/\n/).filter(Boolean).slice(0, 2);
  const two = lines.length > 1;
  // node／vitest 無 DOM：回空 sprite（plane-entity 名牌仍可掛；瀏覽器才畫字）
  if (typeof document === 'undefined') {
    const mat = new THREE.SpriteMaterial({ color: opts.fill ?? '#ffffff', transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    if (kind === 'plane') sprite.scale.set(280, 70, 1);
    else if (kind === 'airport') sprite.scale.set(520, two ? 150 : 130, 1);
    else sprite.scale.set(440, two ? 140 : 110, 1);
    sprite.renderOrder = 10;
    return sprite;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = two || kind === 'airport' ? 160 : 128;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const fill = opts.fill ?? (kind === 'airport' ? '#fff8d0' : '#fff6e0');
  const stroke = opts.stroke ?? '#1a2233';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  if (two) {
    // 主行較大、副行（ICAO）略小＝機場身份一眼可讀
    const y0 = canvas.height * 0.38;
    const y1 = canvas.height * 0.72;
    ctx.font = 'bold 64px "PingFang TC", "Noto Sans TC", sans-serif';
    ctx.lineWidth = 11;
    ctx.strokeStyle = stroke;
    ctx.strokeText(lines[0], 256, y0);
    ctx.fillStyle = fill;
    ctx.fillText(lines[0], 256, y0);
    ctx.font = 'bold 44px "PingFang TC", "Noto Sans TC", Menlo, monospace';
    ctx.lineWidth = 9;
    ctx.strokeText(lines[1], 256, y1);
    ctx.fillStyle = kind === 'airport' ? '#dcecff' : fill;
    ctx.fillText(lines[1], 256, y1);
  } else {
    const fontSize = kind === 'plane' ? 84 : kind === 'airport' ? 72 : 72;
    ctx.font = `bold ${fontSize}px "PingFang TC", "Noto Sans TC", sans-serif`;
    ctx.lineWidth = kind === 'plane' ? 14 : 12;
    ctx.strokeStyle = stroke;
    ctx.strokeText(lines[0] ?? '', 256, canvas.height / 2);
    ctx.fillStyle = fill;
    ctx.fillText(lines[0] ?? '', 256, canvas.height / 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; // 像素風
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  if (kind === 'plane') sprite.scale.set(280, 70, 1);
  else if (kind === 'airport') sprite.scale.set(520, two ? 150 : 130, 1);
  else sprite.scale.set(440, two ? 140 : 110, 1);
  sprite.renderOrder = 10;
  return sprite;
}
