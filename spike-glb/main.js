// @ts-nocheck
// SPIKE（拋棄式，不碰 src/）：驗證 Kenney CC0 low-poly GLB 與現有 voxel 在「同一套真實燈光/霧/色票」下能否共存。
// 重用遊戲真實的 world.js（燈、霧、天空、草地）＋真實 voxel 模型 t34c，並排 Kenney 車（原樣 vs 正規化）。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeWorld } from '../src/display/scene/world.js';
import { buildVoxelGeometry, voxelMaterial } from '../src/voxel/build.js';
import { t34cBody } from '../src/voxel/models/t34c.js';

const logEl = document.getElementById('log');
const log = (m) => { console.log('[spike]', m); if (logEl) logEl.textContent += m + '\n'; };

const scene = makeWorld(); // ← 真實燈光/霧/天空/草地

const renderer = new THREE.WebGLRenderer({ antialias: false }); // 硬邊像素風（與遊戲一致）
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 60000);
camera.position.set(0, 10, 29);
camera.lookAt(0, 1.8, 0);

// ① 真實 voxel T-34C（現有美術風格基準）— 側面，看清機型與相對尺度
const plane = new THREE.Mesh(buildVoxelGeometry(t34cBody), voxelMaterial());
plane.position.set(-12, 0, 0);
plane.rotation.y = -Math.PI * 0.5 + Math.PI * 0.08;
scene.add(plane);

const loader = new GLTFLoader();
const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));

/** 量 bbox → 縮到目標公尺數（這就是要定出來的 scale 標準）；並把模型坐到地面 y=0 */
function fitToGround(root, targetLenM) {
  const b = new THREE.Box3().setFromObject(root);
  const s = new THREE.Vector3(); b.getSize(s);
  const longest = Math.max(s.x, s.z) || 1;
  const k = targetLenM / longest;
  root.scale.setScalar(k);
  const b2 = new THREE.Box3().setFromObject(root);
  root.position.y -= b2.min.y;
  return { k, rawLongest: longest };
}

/** 正規化：剝 PBR(MeshStandard) → MeshLambert + flatShading（吃同一套燈光、硬邊），保留 colormap 貼圖 */
function normalize(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    o.material = new THREE.MeshLambertMaterial({
      map: m && m.map ? m.map : null,
      color: m && m.color ? m.color.clone() : new THREE.Color('#ffffff'),
      vertexColors: !!o.geometry.attributes.color,
      flatShading: true,
    });
  });
}

(async () => {
  try {
    // ② sedan 原樣（PBR / smooth）＝不正規化的「打架基準」
    const a = (await load('./assets/sedan.glb')).scene;
    const fa = fitToGround(a, 4.5); a.position.x = -6.5; a.rotation.y = -Math.PI * 0.25; scene.add(a);
    log(`② sedan AS-IS    scale=${fa.k.toFixed(4)}  (Kenney 原始最長邊=${fa.rawLongest.toFixed(2)}u → 4.5m)`);

    // ③ sedan 正規化（Lambert + flatShading）
    const c = (await load('./assets/sedan.glb')).scene;
    fitToGround(c, 4.5); normalize(c); c.position.x = 0; c.rotation.y = -Math.PI * 0.25; scene.add(c);
    log('③ sedan NORMALIZED  (MeshStandard→Lambert + flatShading, 保留 colormap)');

    // ④ firetruck 正規化（對應 V4 地勤車）
    const f = (await load('./assets/firetruck.glb')).scene;
    const ff = fitToGround(f, 8); normalize(f); f.position.x = 8; f.rotation.y = -Math.PI * 0.25; scene.add(f);
    log(`④ firetruck NORMALIZED  scale=${ff.k.toFixed(4)} → 8m`);

    // ⑤ van 正規化
    const v = (await load('./assets/van.glb')).scene;
    const fv = fitToGround(v, 5); normalize(v); v.position.x = 14; v.rotation.y = -Math.PI * 0.25; scene.add(v);
    log(`⑤ van NORMALIZED  scale=${fv.k.toFixed(4)} → 5m`);

    let n = 0;
    (function tick() {
      renderer.render(scene, camera);
      if (++n < 6) requestAnimationFrame(tick);
      else { window.__spikeReady = true; log('READY'); }
    })();
  } catch (e) {
    log('ERROR ' + (e && e.message));
    console.error(e);
    window.__spikeError = String((e && e.stack) || e);
  }
})();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
