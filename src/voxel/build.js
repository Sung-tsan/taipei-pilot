// @ts-check
// voxel 資產管線：JS 手寫「box 清單」→ merged BufferGeometry（vertex colors，零貼圖）。
// box = [x, y, z, w, h, d, colorKey]，y 向上，模型原點 = 底部中心，機鼻朝 -Z。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * @typedef {{ name?: string, scale?: number, palette: Record<string, string>,
 *             boxes: (string|number)[][] }} VoxelModel
 */

/**
 * @param {VoxelModel} model
 * @param {Record<string, string>} [paletteOverride] 例如把 accent 色換成 slot 色
 * @returns {THREE.BufferGeometry}
 */
export function buildVoxelGeometry(model, paletteOverride = {}) {
  const scale = model.scale ?? 1;
  const palette = { ...model.palette, ...paletteOverride };
  const geos = [];
  for (const box of model.boxes) {
    const [x, y, z, w, h, d] = /** @type {number[]} */ (box.slice(0, 6));
    const key = /** @type {string} */ (box[6]);
    const g = new THREE.BoxGeometry(w * scale, h * scale, d * scale);
    g.translate((x + w / 2) * scale, (y + h / 2) * scale, (z + d / 2) * scale);
    paintGeometry(g, palette[key] ?? '#ff00ff');
    geos.push(g);
  }
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return merged;
}

/**
 * 整顆 geometry 塗單色 vertex colors。
 * @param {THREE.BufferGeometry} g @param {string|number} hex
 */
export function paintGeometry(g, hex) {
  const color = new THREE.Color(hex);
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** 共用 voxel 材質：硬邊光影、吃 vertex colors */
export function voxelMaterial() {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}
