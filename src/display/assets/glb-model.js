// @ts-check
// V4 CC0/CC-BY GLB → 玩具視覺正規化管線（§11「voxel + low-poly 共存，單一真相源」）。
// 從 spike-glb/ 的 normalize()/fitToGround() recipe 正式化，補上 spike 缺的「色票重映」一步
// （降飽和/偏暖 —— FINDINGS 點名的最大美感槓桿）。瀏覽器/three 專用（非純模組，e2e/HITL 驗）。
//
// 用法：const tmpl = await loadToyModel('/models/airliner.glb', { lengthM: 27 });
//       const inst = tmpl.clone(true); // 每個實體 clone（共用 geo/mat，省記憶體）
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** @type {GLTFLoader|null} 延遲建立（避免 import 時就 new，讓單元測試 transitive import 不出事） */
let _loader = null;
const loader = () => (_loader ??= new GLTFLoader());
/** @type {Map<string, Promise<THREE.Object3D>>} url → 正規化後的模板（只載一次，實體用 clone） */
const _cache = new Map();

/**
 * 載入並正規化一個 GLB → 玩具視覺模板（cached）。回傳的 Object3D 是「模板」，
 * 呼叫端應 `.clone(true)` 給每個實體用（共用 geometry/material）。
 * @param {string} url
 * @param {{ lengthM?:number, saturation?:number, warm?:number }} [opts]
 *   lengthM＝最長水平邊縮到幾公尺；saturation＝貼圖飽和保留比例(0..1，<1=降飽和)；warm＝偏暖量(0..~0.12)
 * @returns {Promise<THREE.Object3D>}
 */
export function loadToyModel(url, opts = {}) {
  const key = `${url}|${opts.lengthM ?? 20}|${opts.saturation ?? 0.62}|${opts.warm ?? 0.06}`;
  let p = _cache.get(key);
  if (!p) {
    p = _load(url, opts);
    _cache.set(key, p);
  }
  return p;
}

/** @param {string} url @param {{ lengthM?:number, saturation?:number, warm?:number }} opts */
async function _load(url, { lengthM = 20, saturation = 0.62, warm = 0.06 } = {}) {
  const gltf = await loader().loadAsync(url);
  const root = gltf.scene;
  normalizeToToy(root, saturation, warm);
  fitToLength(root, lengthM);
  root.updateMatrixWorld(true);
  return root;
}

/**
 * 正規化材質：MeshStandard → MeshLambert + flatShading（吃同一套燈光、硬邊），
 * 保留貼圖但降飽和/偏暖（色票重映，對齊本款暖色低對比家族）。
 * @param {THREE.Object3D} root @param {number} saturation @param {number} warm
 */
export function normalizeToToy(root, saturation = 0.62, warm = 0.06) {
  /** @type {Map<THREE.Texture, THREE.Texture>} 同貼圖只重映一次 */
  const remapped = new Map();
  root.traverse((o) => {
    const mesh = /** @type {THREE.Mesh} */ (o);
    if (!(/** @type {any} */ (mesh).isMesh)) return;
    const src = /** @type {any} */ (mesh.material);
    let map = src && src.map ? src.map : null;
    let tinted = false;
    if (map) {
      if (!remapped.has(map)) remapped.set(map, recolorTexture(map, saturation, warm) ?? map);
      const out = remapped.get(map);
      tinted = out !== map; // 成功重映了貼圖 → 不再用 color 疊色
      map = out;
    }
    mesh.material = new THREE.MeshLambertMaterial({
      map,
      // 重映成功＝白(不疊色)；否則用「暖灰」color 疊在貼圖上當保底降飽和/偏暖
      color: tinted ? new THREE.Color(0xffffff)
        : (map ? new THREE.Color(0.95, 0.92, 0.86) : srcColorOrWhite(src)),
      vertexColors: !!(/** @type {any} */ (mesh.geometry)?.attributes?.color),
      flatShading: true,
    });
  });
}

/** @param {any} src @returns {THREE.Color} */
function srcColorOrWhite(src) {
  return src && src.color ? src.color.clone() : new THREE.Color(0xffffff);
}

/**
 * 把貼圖降飽和 + 偏暖，回新的 CanvasTexture（保留 colorSpace/flipY/wrap）。
 * 無 DOM（測試環境）或失敗 → 回 null（呼叫端改用 color 疊色保底）。
 * @param {THREE.Texture} tex @param {number} saturation @param {number} warm
 * @returns {THREE.Texture|null}
 */
function recolorTexture(tex, saturation, warm) {
  try {
    const img = /** @type {any} */ (tex).image;
    if (typeof document === 'undefined' || !img || !img.width) return null;
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, cv.width, cv.height);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;       // 灰階
      // 朝灰階混（降飽和）+ 偏暖（R↑ B↓）
      px[i] = clamp255(luma + (r - luma) * saturation + 255 * warm);
      px[i + 1] = clamp255(luma + (g - luma) * saturation);
      px[i + 2] = clamp255(luma + (b - luma) * saturation - 255 * warm);
    }
    ctx.putImageData(data, 0, 0);
    const out = new THREE.CanvasTexture(cv);
    out.colorSpace = tex.colorSpace;
    out.flipY = tex.flipY;
    out.wrapS = tex.wrapS; out.wrapT = tex.wrapT;
    out.needsUpdate = true;
    return out;
  } catch {
    return null; // CORS taint / 無 canvas → 保底
  }
}

/** @param {number} v */
function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

/**
 * 量 bbox → 縮到目標公尺（最長水平邊）；置中 x/z、坐到地面（min.y=0）。
 * @param {THREE.Object3D} root @param {number} targetLenM
 * @returns {{ scale:number, rawLongest:number }}
 */
export function fitToLength(root, targetLenM) {
  const b = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); b.getSize(size);
  const longest = Math.max(size.x, size.z) || 1;
  const scale = targetLenM / longest;
  root.scale.setScalar(scale);
  const b2 = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3(); b2.getCenter(center);
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= b2.min.y; // 坐到地面 y=0（gearDown 時輪子貼地）
  return { scale, rawLongest: longest };
}
