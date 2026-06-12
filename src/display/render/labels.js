// @ts-check
// 地標名牌：Sprite + canvas 中文描邊字（billboard 自動面向各視口相機），
// 距任一架飛機 < 淡入半徑才顯示。
import * as THREE from 'three';

const FADE_NEAR = 900;   // 全亮
const FADE_FAR = 1800;   // 全隱

export class LandmarkLabels {
  /**
   * @param {THREE.Group} parent
   * @param {import('../scene/taipei.js').LandmarkInfo[]} landmarks
   */
  constructor(parent, landmarks) {
    /** @type {{ sprite: THREE.Sprite, x:number, z:number }[]} */
    this.items = landmarks.map((lm) => {
      const sprite = makeTextSprite(lm.name);
      sprite.position.set(lm.x, lm.topY + 55, lm.z);
      parent.add(sprite);
      return { sprite, x: lm.x, z: lm.z };
    });
  }

  /** @param {{x:number,z:number}[]} planePositions 連線中的飛機位置 */
  update(planePositions) {
    for (const item of this.items) {
      let dMin = Infinity;
      for (const p of planePositions) {
        dMin = Math.min(dMin, Math.hypot(p.x - item.x, p.z - item.z));
      }
      const opacity = 1 - Math.min(Math.max((dMin - FADE_NEAR) / (FADE_FAR - FADE_NEAR), 0), 1);
      /** @type {THREE.SpriteMaterial} */ (item.sprite.material).opacity = opacity;
      item.sprite.visible = opacity > 0.02;
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
