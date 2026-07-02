// @ts-check
// 地標名牌：Sprite + canvas 中文描邊字（billboard 自動面向各視口相機），
// 距任一架飛機 < 淡入半徑才顯示。
import * as THREE from 'three';

const FADE_NEAR = 900;   // 全亮
const FADE_FAR = 1800;   // 全隱
const MAX_VISIBLE = 5;   // 同屏標籤上限（近距多地標群聚不互疊；最近的優先）
const SCALE_FAR = 0.62;  // 遠端縮到的比例（距離縮放＝深度線索，減擁擠）

export class LandmarkLabels {
  /**
   * @param {THREE.Group} parent
   * @param {import('../scene/taipei.js').LandmarkInfo[]} landmarks
   */
  constructor(parent, landmarks) {
    /** @type {{ sprite: THREE.Sprite, x:number, z:number, d:number }[]} */
    this.items = landmarks.map((lm) => {
      const sprite = makeTextSprite(lm.name);
      sprite.position.set(lm.x, lm.topY + 55, lm.z);
      parent.add(sprite);
      return { sprite, x: lm.x, z: lm.z, d: Infinity };
    });
  }

  /** @param {{x:number,z:number}[]} planePositions 連線中的飛機位置 */
  update(planePositions) {
    for (const item of this.items) {
      let dMin = Infinity;
      for (const p of planePositions) {
        dMin = Math.min(dMin, Math.hypot(p.x - item.x, p.z - item.z));
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
      item.sprite.scale.set(440 * k, 110 * k, 1);
    }
  }
}

/** @param {string} text */
function makeTextSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.font = 'bold 72px "PingFang TC", "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#1a2233';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, 256, 64);
  ctx.fillStyle = '#fff6e0';
  ctx.fillText(text, 256, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; // 像素風
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(440, 110, 1);
  sprite.renderOrder = 10;
  return sprite;
}
