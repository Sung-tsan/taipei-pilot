// @ts-check
// 程序化市區（對標 voxel-f16-taipei 的精細度）：
//   深灰街道格網（柏油底）＋ 淺色街廓底盤 ＋ 冷色調建築（階梯式/屋頂水塔/天線）
//   ＋ 亮綠公園與樹叢 ＋ 密度熱點。seeded 決定性、500m chunk merge。
// 同時產出 2D 高度查詢（碰撞 + 低空保護用）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintGeometry } from '../../voxel/build.js';
import { inRiverCorridor } from './rivers.js';
import { WORLD_RADIUS } from '../../../shared/constants.js';
import { clamp } from '../../lib/math.js';

export const CHUNK = 500;        // m（frustum culling 單位）
const BLOCK = 130;               // 街廓間距（含街道）
const STREET = 26;               // 街道寬
export const ROAD_WIDTH = STREET; // 迫降馬路幾何判定共用

/** mulberry32 —— 決定性 PRNG @param {number} seed */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 市區密度熱點（信義/西門車站/中山/松山/大安），值 = [x, z, 半徑, 強度] */
const HOTSPOTS = [
  [1200, 3900, 2200, 1.0],
  [-4300, 3100, 2400, 0.95],
  [-2400, 1200, 2000, 0.8],
  [500, 1500, 1800, 0.7],
  [-1800, 4400, 1800, 0.7],
];

// 冷色調（參考作品的藍白灰城市）+ 少量暖點綴
const BUILDING_PALETTE = ['#dfe5ea', '#cdd6de', '#b8c4cf', '#e8e4da', '#d4dce2', '#c2cdd6', '#d8d2c8', '#9fb2c2'];
const ASPHALT = '#6f7068';
const PAD = '#c2c8ba';
const PARK_GREEN = '#7fb86a';
const TREE = '#4f7e3e';
const ROOF_BOX = '#8d99a6';

/**
 * @typedef {{ x:number, z:number, w:number, d:number, h:number }} Building
 * @typedef {{
 *   group: THREE.Group,
 *   heightAt: (x:number, z:number) => number,
 *   buildingAt: (x:number, z:number) => Building|null,
 *   cellKindAt: (x:number, z:number) => 'street'|'park'|'building'|'lot'|'grass',
 *   stats: { buildings:number, chunks:number, boxes:number },
 * }} City
 */

/**
 * @param {{ seed?: number, exclude?: (x:number, z:number) => boolean }} [opts]
 * @returns {City}
 */
export function generateCity({ seed = 20260612, exclude = () => false } = {}) {
  const group = new THREE.Group();
  group.name = 'city';
  /** @type {Map<string, { geos: THREE.BufferGeometry[], buildings: Building[] }>} */
  const chunks = new Map();
  let buildingCount = 0;
  let boxCount = 0;
  /** @type {Map<string, 'building'|'park'|'lot'>} 每格類型（迫降地形辨識用；未記錄＝grass） */
  const cellKinds = new Map();

  /** @param {number} cx @param {number} cz @param {THREE.BufferGeometry} g */
  function push(cx, cz, g) {
    const key = `${Math.floor(cx / CHUNK)},${Math.floor(cz / CHUNK)}`;
    let chunk = chunks.get(key);
    if (!chunk) { chunk = { geos: [], buildings: [] }; chunks.set(key, chunk); }
    chunk.geos.push(g);
    boxCount++;
    return chunk;
  }

  /**
   * 帶明度抖動的盒子
   * @param {number} cx @param {number} cz @param {number} w @param {number} h
   * @param {number} d @param {number} y @param {string} color @param {number} [k]
   */
  function box(cx, cz, w, h, d, y, color, k = 1) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(cx, y + h / 2, cz);
    paintGeometry(g, shade(color, k));
    return g;
  }

  const half = Math.ceil(WORLD_RADIUS / BLOCK);
  for (let gx = -half; gx <= half; gx++) {
    for (let gz = -half; gz <= half; gz++) {
      const cx = gx * BLOCK;
      const cz = gz * BLOCK;
      const r = Math.hypot(cx, cz);
      if (r > WORLD_RADIUS - 200) continue;
      if (inRiverCorridor(cx, cz)) continue;
      if (exclude(cx, cz)) continue;

      // 密度（決定性，無 rnd）：基底隨離心遞減 + 熱點
      let density = clamp(0.5 - r / 9000, 0.05, 0.5);
      let heightBoost = 1;
      for (const [hx, hz, hr, hs] of HOTSPOTS) {
        const d = Math.hypot(cx - hx, cz - hz);
        if (d < hr) {
          const k = 1 - d / hr;
          density += hs * k * 0.55;
          heightBoost = Math.max(heightBoost, 1 + hs * k * 2.4);
        }
      }
      if (density < 0.14) continue; // 市區邊界外 = 純草地

      const rnd = mulberry32(seed ^ (gx * 73856093) ^ (gz * 19349663));
      const chunkRef = push(cx, cz, box(cx, cz, BLOCK, 0.3, BLOCK, 0, ASPHALT, 0.96 + rnd() * 0.08)); // 柏油底（縫 = 街道）
      const padW = BLOCK - STREET;
      const roll = rnd();

      if (roll < density + 0.18) {
        // —— 建築街廓 ——
        cellKinds.set(`${gx},${gz}`, 'building');
        push(cx, cz, box(cx, cz, padW, 0.6, padW, 0.3, PAD, 0.95 + rnd() * 0.1));
        const n = rnd() < 0.4 ? 2 : 1; // 1–2 棟
        for (let b = 0; b < n; b++) {
          const w = (padW / n) - 8 - rnd() * 14;
          const d = padW - 12 - rnd() * 20;
          const h = (9 + rnd() * rnd() * 40) * heightBoost;
          const bx = cx + (n === 2 ? (b === 0 ? -padW / 4 : padW / 4) : (rnd() - 0.5) * 6);
          const bz = cz + (rnd() - 0.5) * 6;
          const color = BUILDING_PALETTE[Math.floor(rnd() * BUILDING_PALETTE.length)];

          // 主體（高樓做 2–3 節階梯 + 樓層色差）
          const tiers = h > 70 ? 3 : h > 35 ? 2 : 1;
          let ty = 0.9, tw = w, td = d;
          for (let t = 0; t < tiers; t++) {
            const th = h / tiers;
            push(cx, cz, box(bx, bz, tw, th, td, ty, color, 0.9 + t * 0.07 + rnd() * 0.05));
            ty += th; tw *= 0.82; td *= 0.82;
          }
          // 屋頂細節：水塔/機房（40%）、超高樓天線
          if (rnd() < 0.4) {
            push(cx, cz, box(bx + (rnd() - 0.5) * tw * 0.4, bz + (rnd() - 0.5) * td * 0.4,
              6 + rnd() * 5, 4 + rnd() * 4, 6 + rnd() * 5, ty, ROOF_BOX));
          }
          if (h > 110) push(cx, cz, box(bx, bz, 2, 14, 2, ty, '#5a626e'));

          chunkRef.buildings.push({ x: bx - w / 2, z: bz - d / 2, w, d, h: ty });
          buildingCount++;
        }
      } else if (roll < density + 0.28) {
        // —— 公園：亮綠地塊 + 樹叢 ——
        cellKinds.set(`${gx},${gz}`, 'park');
        push(cx, cz, box(cx, cz, padW, 0.8, padW, 0.3, PARK_GREEN, 0.94 + rnd() * 0.12));
        const trees = 4 + Math.floor(rnd() * 5);
        for (let t = 0; t < trees; t++) {
          const s = 7 + rnd() * 7;
          push(cx, cz, box(cx + (rnd() - 0.5) * padW * 0.7, cz + (rnd() - 0.5) * padW * 0.7,
            s, 5 + rnd() * 6, s, 1, TREE, 0.85 + rnd() * 0.3));
        }
      } else {
        // —— 空地塊（廣場/低倉庫） ——
        cellKinds.set(`${gx},${gz}`, 'lot');
        push(cx, cz, box(cx, cz, padW, 0.6, padW, 0.3, PAD, 0.92 + rnd() * 0.1));
        if (rnd() < 0.3) {
          const h = 5 + rnd() * 5;
          push(cx, cz, box(cx, cz, padW * 0.5, h, padW * 0.4, 0.9,
            BUILDING_PALETTE[Math.floor(rnd() * BUILDING_PALETTE.length)], 0.95));
          chunkRef.buildings.push({ x: cx - padW * 0.25, z: cz - padW * 0.2, w: padW * 0.5, d: padW * 0.4, h: h + 0.9 });
        }
      }
    }
  }

  /** @type {Map<string, Building[]>} */
  const lookup = new Map();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const [key, { geos, buildings }] of chunks) {
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, mat);
    mesh.geometry.computeBoundingSphere(); // 世界座標 → frustum culling 正確
    group.add(mesh);
    lookup.set(key, buildings);
  }

  /** @param {number} x @param {number} z */
  function buildingAt(x, z) {
    // 樓房可能跨 chunk 邊界 → 查 3×3 鄰域
    const kx = Math.floor(x / CHUNK), kz = Math.floor(z / CHUNK);
    for (let ix = kx - 1; ix <= kx + 1; ix++) {
      for (let iz = kz - 1; iz <= kz + 1; iz++) {
        const list = lookup.get(`${ix},${iz}`);
        if (!list) continue;
        for (const b of list) {
          if (x >= b.x && x <= b.x + b.w && z >= b.z && z <= b.z + b.d) return b;
        }
      }
    }
    return null;
  }

  /**
   * 該點屬於哪種市區地塊（迫降地形辨識用）：
   * 'street'＝街道間隙（馬路）、'park'＝公園、'building'/'lot'＝街廓地塊、'grass'＝市區外/未開發。
   * @param {number} x @param {number} z
   * @returns {'street'|'park'|'building'|'lot'|'grass'}
   */
  function cellKindAt(x, z) {
    const gx = Math.round(x / BLOCK), gz = Math.round(z / BLOCK);
    const padHalf = (BLOCK - STREET) / 2;
    if (Math.abs(x - gx * BLOCK) > padHalf || Math.abs(z - gz * BLOCK) > padHalf) return 'street';
    return cellKinds.get(`${gx},${gz}`) ?? 'grass';
  }

  return {
    group,
    buildingAt,
    cellKindAt,
    heightAt: (x, z) => buildingAt(x, z)?.h ?? 0,
    stats: { buildings: buildingCount, chunks: chunks.size, boxes: boxCount },
  };
}

/** @param {string} hex @param {number} k */
function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}
