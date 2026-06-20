// @ts-check
// V5 airport-template —— 任一機場 spec → 場景 group + env + 地形判定（航網的地基，B1 極致）。
// 松山(tsa)＝委派既有 makeTaipei()（保留手刻城市/三河/七地標，不動 v1 美術）；
// 其餘機場＝參數化 template：跑道(spec 長/向) + 航廈/塔台 + 滑行道 + 地形(島/海岸/山) + 招牌地標。
// 北極星 ROADMAP §5 機場 pillar / §11 美術（通用件未來 CC0、招牌地標手刻 voxel）/ handoff v5.0-1 P1+P4。
//
// 每機場以「自己的跑道中心」為世界原點（與松山同制）；切換機場＝換這顆 group + env + runwayDir。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildVoxelGeometry, paintGeometry, voxelMaterial } from '../../voxel/build.js';
import { makeTaxiwayGraph } from './taxiway.js';
import { makeTaipei } from './taipei.js';
import { makeAirport, RUNWAY_DIR, spawnPose as tsaSpawnPose } from './airport.js';
import { TERRAIN } from '../flight/forced-landing.js';
import { airport } from './airports.js';

/** @typedef {import('./airports.js').AirportSpec} AirportSpec */
/**
 * @typedef {{
 *   group: THREE.Group,
 *   env: import('../flight/flight-model.js').Env,
 *   terrainAt: (x:number, z:number)=>string,
 *   solidAt: (x:number, z:number)=>{h:number,cx:number,cz:number}|null,
 *   landmarks: any[],
 *   runwayDir: {x:number, z:number},
 *   runwayLength: number,
 *   taxi: import('./taxiway.js').TaxiGraph,
 *   spawnPose: (slot:number)=>{x:number, z:number, heading:number},
 *   spec: AirportSpec,
 *   dispose: ()=>void,
 * }} AirportScene
 */

/** 建一個機場的完整場景（spec.id==='tsa' → 松山手刻；其餘 → template）。 @param {string} id @returns {AirportScene} */
export function makeAirportScene(id) {
  const spec = airport(id);
  if (spec.id === 'tsa') return wrapTaipei(spec);
  return makeTemplateScene(spec);
}

/** 松山：包既有 makeTaipei()，補上 V5 切換所需欄位（runwayDir/taxi/spawnPose）。 @param {AirportSpec} spec @returns {AirportScene} */
function wrapTaipei(spec) {
  const t = makeTaipei();
  return {
    group: t.group, env: t.env, terrainAt: t.terrainAt, solidAt: t.solidAt, landmarks: t.landmarks,
    runwayDir: RUNWAY_DIR, runwayLength: 2605, taxi: makeTaxiwayGraph(2605),
    spawnPose: tsaSpawnPose, spec,
    dispose: () => disposeGroup(t.group),
  };
}

/**
 * Template 機場：跑道 + 航廈/塔台 + 滑行道 + 地形 + 招牌地標。在「跑道 local 框」(along=+X) 建好，
 * 再把整顆 group 轉到真實方位（group.rotation.y）；env/terrainAt 在世界座標把點投回 local 判定。
 * @param {AirportSpec} spec @returns {AirportScene}
 */
function makeTemplateScene(spec) {
  const group = new THREE.Group();
  const L = spec.runway.lengthM;
  const W = spec.runway.widthM;
  const HALF = L / 2;
  const headingRad = (spec.runway.headingDeg * Math.PI) / 180;
  const yawForX = Math.PI / 2 - headingRad; // box 長軸 +X 對齊 heading（與 airport.js 同推導）
  const runwayDir = { x: Math.sin(headingRad), z: -Math.cos(headingRad) };
  const taxi = makeTaxiwayGraph(L);

  // 世界(x,z) → 跑道 local(along, lateral)：along 沿 runwayDir、lateral 為其法線(-dir.z, dir.x)。
  /** @param {number} x @param {number} z */
  const toLocal = (x, z) => ({
    along: x * runwayDir.x + z * runwayDir.z,
    lateral: x * -runwayDir.z + z * runwayDir.x,
  });

  // —— 地形地表（island/coast/mountain/city；merged，perf 友善）——
  buildTerrain(group, spec, L);

  // —— 跑道本體 + 標線（local 框 along=+X）——
  const markMat = new THREE.MeshLambertMaterial({ color: '#f0efe8' });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(L, 0.4, W), new THREE.MeshLambertMaterial({ color: '#84847c' }));
  slab.position.y = 0.2; group.add(slab);
  const dashGeos = [];
  for (let x = -HALF + 80; x < HALF - 80; x += 60) { const g = new THREE.BoxGeometry(30, 0.1, 1.2); g.translate(x, 0.45, 0); dashGeos.push(g); }
  for (const end of [-1, 1]) for (let i = -3; i <= 3; i++) { const g = new THREE.BoxGeometry(24, 0.1, 3); g.translate(end * (HALF - 30), 0.45, i * 7.5); dashGeos.push(g); }
  if (dashGeos.length) { const m = new THREE.Mesh(mergeGeometries(dashGeos), markMat); dashGeos.forEach((g) => g.dispose()); group.add(m); }

  // —— 滑行道鋪面（沿 taxiway graph 非跑道邊，merge 成 1 顆）——
  const stripGeos = [];
  for (const [a, b] of taxi.edges) {
    const na = taxi.nodes.get(a); const nb = taxi.nodes.get(b);
    if (!na || !nb) continue;
    if (Math.abs(na.lateral) < 1 && Math.abs(nb.lateral) < 1) continue; // 跑道中線邊：跳過
    const dAlong = nb.along - na.along; const dLat = nb.lateral - na.lateral;
    const len = Math.hypot(dAlong, dLat); if (len < 1) continue;
    const g = new THREE.BoxGeometry(len + 44, 0.3, 44);
    g.rotateY(Math.atan2(-dLat, dAlong));
    g.translate((na.along + nb.along) / 2, 0.16, (na.lateral + nb.lateral) / 2);
    stripGeos.push(g);
  }
  if (stripGeos.length) { const m = new THREE.Mesh(mergeGeometries(stripGeos), new THREE.MeshLambertMaterial({ color: '#8f8f87' })); stripGeos.forEach((g) => g.dispose()); group.add(m); }

  // —— 停機坪 + 航廈 + 塔台（voxel；通用件，§11 未來可換 CC0）——
  const apron = new THREE.Mesh(new THREE.BoxGeometry(Math.min(600, L * 0.42), 0.3, 300), new THREE.MeshLambertMaterial({ color: '#9a9a92' }));
  apron.position.set(0, 0.15, -(W / 2 + 160)); group.add(apron);
  const termW = Math.min(580, L * 0.4);
  const terminal = buildVoxelGeometry({
    scale: 1,
    palette: { B: '#e8ddc8', R: '#c8b9a0', T: '#d9cdb4', D: '#3a4666', C: '#bfe3f0' },
    boxes: [
      [-termW / 2, 0, -40, termW, 18, 60, 'B'],
      [-termW / 2, 18, -40, termW, 3, 60, 'R'],
      [-termW / 2 + 10, 4, 18, termW - 20, 8, 4, 'C'],
      [termW / 2 + 40, 0, 40, 26, 42, 26, 'T'],
      [termW / 2 + 32, 42, 32, 42, 12, 42, 'D'],
      [termW / 2 + 28, 54, 28, 50, 3, 50, 'R'],
    ],
  });
  const termMesh = new THREE.Mesh(terminal, voxelMaterial());
  termMesh.position.set(0, 0, -(W / 2 + 320));
  group.add(termMesh);
  const termFoot = { cx: 0, cz: -(W / 2 + 320), hw: termW / 2 + 30, hd: 60, h: 21 };

  // —— 招牌地標（手刻 voxel；一場一座，給機場識別；§11 例外＝地標續用 voxel）——
  const lm = buildSignature(group, spec, W);

  // —— 回家光柱（跨霧可見）——
  const beacon = new THREE.Mesh(
    new THREE.BoxGeometry(16, 750, 16),
    new THREE.MeshBasicMaterial({ color: '#ffd96b', transparent: true, opacity: 0.30, fog: false, depthWrite: false }),
  );
  beacon.position.y = 375; beacon.renderOrder = 5; group.add(beacon);

  group.rotation.y = yawForX;

  // —— env / 地形判定（世界座標 → local 判定）——
  const RUNWAY_STRIP = { along: HALF + 150, cross: Math.max(120, W) };
  const islandR = HALF * 1.15; // 島嶼陸地半徑（外＝海）
  /** @param {number} x @param {number} z @returns {{h:number,cx:number,cz:number}|null} */
  const solidAt = (x, z) => {
    const { along, lateral } = toLocal(x, z);
    if (Math.abs(along - termFoot.cx) < termFoot.hw && Math.abs(lateral - termFoot.cz) < termFoot.hd) return { h: termFoot.h, cx: 0, cz: termFoot.cz };
    if (lm && Math.hypot(along - lm.along, lateral - lm.lateral) < lm.r) return { h: lm.h, cx: x, cz: z };
    return null;
  };
  /** @type {import('../flight/flight-model.js').Env} */
  const env = {
    groundY: (x, z) => solidAt(x, z)?.h ?? 0,
    canLandHere: (x, z) => { const l = toLocal(x, z); return Math.abs(l.along) < RUNWAY_STRIP.along && Math.abs(l.lateral) < RUNWAY_STRIP.cross; },
    inLowFlyZone: (x, z) => Math.hypot(x, z) < HALF + 1200,
  };
  /** @param {number} x @param {number} z @returns {string} */
  const terrainAt = (x, z) => {
    if (env.canLandHere(x, z)) return TERRAIN.RUNWAY;
    if (solidAt(x, z)) return TERRAIN.BUILDING;
    const r = Math.hypot(x, z);
    if (spec.terrain === 'island') return r > islandR ? TERRAIN.WATER : TERRAIN.GRASS;
    if (spec.terrain === 'coast') { const { lateral } = toLocal(x, z); return lateral > islandR ? TERRAIN.WATER : TERRAIN.GRASS; }
    return TERRAIN.GRASS; // mountain/city template：開放草地（山體 footprint 走 solidAt=BUILDING）
  };

  return {
    group, env, terrainAt, solidAt,
    landmarks: lm ? [lm.info] : [],
    runwayDir, runwayLength: L, taxi,
    spawnPose: (slot) => templateSpawnPose(slot, runwayDir, L),
    spec,
    dispose: () => disposeGroup(group),
  };
}

/** Template 起飛位置：跑道西端一前一後（與 airport.js spawnPose 同制，但用本場 runwayDir/長度）。 @param {number} slot @param {{x:number,z:number}} dir @param {number} L */
function templateSpawnPose(slot, dir, L) {
  const back = -L / 2 + 120 + slot * 60;
  const side = (slot === 0 ? -1 : 1) * 10;
  const nx = -dir.z, nz = dir.x;
  return { x: dir.x * back + nx * side, z: dir.z * back + nz * side, heading: Math.atan2(dir.x, -dir.z) };
}

/** 地形地表：島＝海環 + 陸地塊；海岸＝單側海；山＝幾座 voxel 山丘。merge 友善。 @param {THREE.Group} group @param {AirportSpec} spec @param {number} L */
function buildTerrain(group, spec, L) {
  const HALF = L / 2;
  if (spec.terrain === 'island') {
    const sea = new THREE.Mesh(new THREE.CircleGeometry(HALF * 6, 40), new THREE.MeshLambertMaterial({ color: '#5fa6c4' }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.12; group.add(sea);
    const land = new THREE.Mesh(new THREE.CircleGeometry(HALF * 1.15, 28), new THREE.MeshLambertMaterial({ color: '#b7c98a' }));
    land.rotation.x = -Math.PI / 2; land.position.y = -0.05; group.add(land);
  } else if (spec.terrain === 'coast') {
    // 海在 lateral 正側（航廈在負側）：一大塊水從跑道側邊鋪出去。
    const sea = new THREE.Mesh(new THREE.BoxGeometry(HALF * 8, 0.2, HALF * 5), new THREE.MeshLambertMaterial({ color: '#5fa6c4' }));
    sea.position.set(0, -0.1, HALF * 2.7); group.add(sea); // local +z＝lateral 正（group 旋轉後到真實海向）
  } else if (spec.terrain === 'mountain') {
    // 幾座 voxel 山丘（merge），讀作「山海之間」。
    const hillGeos = [];
    const spots = [[-HALF * 0.7, -HALF * 1.3], [HALF * 0.9, -HALF * 1.6], [-HALF * 1.2, HALF * 1.1], [HALF * 1.3, HALF * 1.4]];
    for (const [ax, lz] of spots) {
      for (let k = 0; k < 3; k++) {
        const s = 180 - k * 50; const g = new THREE.BoxGeometry(s, 60 + k * 50, s);
        g.translate(ax + k * 12, (60 + k * 50) / 2, lz + k * 12);
        paintGeometry(g, k === 0 ? '#7d9968' : k === 1 ? '#6b8a5c' : '#8aa57a');
        hillGeos.push(g);
      }
    }
    const hills = new THREE.Mesh(mergeGeometries(hillGeos), new THREE.MeshLambertMaterial({ vertexColors: true }));
    hillGeos.forEach((g) => g.dispose()); group.add(hills);
  }
}

/**
 * 招牌地標（手刻 voxel；給每場一個識別剪影；§11 地標續用 voxel 例外）。回傳 local 位置/半徑供 solidAt。
 * @param {THREE.Group} group @param {AirportSpec} spec @param {number} W
 * @returns {{along:number, lateral:number, r:number, h:number, info:any}|null}
 */
function buildSignature(group, spec, W) {
  /** @type {Record<string, {boxes:any[], palette:Record<string,string>, name:string}>} */
  const DEFS = {
    khh: { name: '高雄港吊車', palette: { A: '#d96b4a', B: '#3a4666', C: '#cfcabb' }, boxes: [[-6, 0, -6, 12, 70, 12, 'B'], [-40, 70, -4, 90, 8, 8, 'A'], [-6, 0, -6, 12, 4, 12, 'C']] },
    knh: { name: '金門風車', palette: { A: '#e8e3d4', B: '#8a8f99', C: '#c8553d' }, boxes: [[-5, 0, -5, 10, 60, 10, 'A'], [-3, 56, -16, 6, 6, 32, 'C'], [-16, 56, -3, 32, 6, 6, 'C']] },
    lzn: { name: '南竿燈塔', palette: { A: '#efe6cf', B: '#c8553d', C: '#3a4666' }, boxes: [[-7, 0, -7, 14, 50, 14, 'A'], [-7, 30, -7, 14, 6, 14, 'B'], [-5, 50, -5, 10, 10, 10, 'C']] },
    mzg: { name: '澎湖燈塔', palette: { A: '#efe6cf', B: '#5b8a72', C: '#c8553d' }, boxes: [[-6, 0, -6, 12, 44, 12, 'A'], [-6, 22, -6, 12, 5, 12, 'B'], [-4, 44, -4, 8, 9, 8, 'C']] },
    rmq: { name: '台中地標', palette: { A: '#d9cdb4', B: '#9bb0c9', C: '#c8b9a0' }, boxes: [[-14, 0, -14, 28, 90, 28, 'A'], [-14, 90, -14, 28, 6, 28, 'B']] },
    tpe: { name: '桃園航廈', palette: { A: '#cfd8e0', B: '#9bb0c9', C: '#e8ddc8' }, boxes: [[-40, 0, -10, 80, 24, 20, 'A'], [-40, 24, -10, 80, 4, 20, 'B']] },
    hun: { name: '花蓮山門', palette: { A: '#c8553d', B: '#efe6cf', C: '#5b8a72' }, boxes: [[-22, 0, -4, 8, 40, 8, 'A'], [14, 0, -4, 8, 40, 8, 'A'], [-26, 40, -5, 56, 8, 10, 'B']] },
    ttt: { name: '台東熱氣球', palette: { A: '#e0533d', B: '#f2b94b', C: '#cfcabb' }, boxes: [[-14, 30, -14, 28, 34, 28, 'A'], [-3, 0, -3, 6, 30, 6, 'C']] },
  };
  const d = DEFS[spec.id];
  if (!d) return null;
  // 放在跑道側邊開闊處（lateral 正側、along 偏一端），不擋跑道/航廈。
  const along = -spec.runway.lengthM * 0.18;
  const lateral = spec.runway.widthM / 2 + 380;
  const geo = buildVoxelGeometry(d);
  const mesh = new THREE.Mesh(geo, voxelMaterial());
  // local→group：沿 +X=along、+Z=lateral（group 整體旋轉到真實方位）。
  mesh.position.set(along, 0, lateral);
  group.add(mesh);
  geo.computeBoundingBox();
  const bb = /** @type {THREE.Box3} */ (geo.boundingBox);
  return {
    along, lateral, r: Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 + 10, h: bb.max.y,
    info: { id: `${spec.id}_sig`, name: d.name, x: 0, z: 0, topY: bb.max.y, clear: 200, aabb: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, h: bb.max.y } },
  };
}

/** 釋放一顆 group 內所有幾何（切換機場 unload／dispose 用）。 @param {THREE.Object3D} group */
function disposeGroup(group) {
  group.traverse((o) => { const m = /** @type {THREE.Mesh} */ (o); if (/** @type {any} */ (m).isMesh) m.geometry?.dispose(); });
  group.parent?.remove(group);
}
