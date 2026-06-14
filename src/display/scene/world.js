// @ts-check
// 世界底層：漸層天空、voxel 雲、霧、光、大地。像素紀律：Lambert + vertex/單色，硬邊光影。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintGeometry } from '../../voxel/build.js';
import { WORLD_RADIUS } from '../../../shared/constants.js';
import { mulberry32 } from './city-gen.js';

export const SKY_TOP = '#5f9bd6';     // 天頂（較深的藍）
export const SKY_HORIZON = '#bfe0ef'; // 地平線（淡，= 霧色）
export const GRASS_COLOR = '#9dbf7b'; // 與玩具墊家族呼應的草綠

export function makeWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_HORIZON);
  scene.fog = new THREE.Fog(SKY_HORIZON, 2500, 4800); // 霧色 = 地平線色 → 遠處乾淨融掉

  // 漸層天空（BackSide 半球，頂深底淡；fog 不影響它）
  scene.add(makeSkyDome());

  // 光：下午的台北，斜照
  const hemi = new THREE.HemisphereLight('#dceefa', '#8aa86c', 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff2dc', 1.25);
  sun.position.set(-800, 1200, 500);
  scene.add(sun);

  // 大地（比空域再大一圈，邊界外仍有地）
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD_RADIUS * 1.4, 48),
    new THREE.MeshLambertMaterial({ color: GRASS_COLOR }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  scene.add(ground);

  scene.add(makeClouds());
  return scene;
}

function makeSkyDome() {
  const geo = new THREE.SphereGeometry(WORLD_RADIUS * 1.6, 24, 12);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(SKY_TOP);
  const horizon = new THREE.Color(SKY_HORIZON);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(pos.getY(i) / (WORLD_RADIUS * 1.6), 0); // 0=地平線 1=天頂
    c.lerpColors(horizon, top, Math.pow(t, 0.7));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  mesh.renderOrder = -1;
  mesh.name = 'skydome'; // v3.0-1 天氣 modulate 用（陰天/雨/霧時染灰）
  return mesh;
}

/** voxel 雲：12 朵白色方塊雲團，merge 成 1 個 mesh */
function makeClouds(seed = 7) {
  const rnd = mulberry32(seed);
  const geos = [];
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 1500 + rnd() * 7000;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const cy = 420 + rnd() * 160;
    const puffs = 3 + Math.floor(rnd() * 4);
    for (let p = 0; p < puffs; p++) {
      const w = 50 + rnd() * 70, h = 14 + rnd() * 14, d = 36 + rnd() * 50;
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(cx + (rnd() - 0.5) * 110, cy + (rnd() - 0.5) * 18, cz + (rnd() - 0.5) * 80);
      paintGeometry(g, p === 0 ? '#ffffff' : '#f2f7fa');
      geos.push(g);
    }
  }
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'clouds';
  return mesh;
}
