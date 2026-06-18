// @ts-check
// 松山機場：跑道 10/28（真實諸元 2605m、方位 ~100°）、停機坪、小塔台。
// 世界原點 = 跑道中心。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildVoxelGeometry, paintGeometry, voxelMaterial } from '../../voxel/build.js';
import { makeTaxiwayGraph } from './taxiway.js';

const TAXIWAY_WIDTH = 44; // m 滑行道鋪面寬（綠中線導航跑在上面）

export const RUNWAY = {
  headingDeg: 100,         // RWY 10 起飛方向
  length: 2605,
  width: 60,
};
const headingRad = (RUNWAY.headingDeg * Math.PI) / 180;
/** box 長軸 +X 對齊 heading 的旋轉量（推導：a = π/2 − h） */
const yawForX = Math.PI / 2 - headingRad;

/** 跑道方向單位向量（起飛朝向） */
export const RUNWAY_DIR = { x: Math.sin(headingRad), z: -Math.cos(headingRad) };

/**
 * 起飛位置：slot 0/1 在跑道西端一前一後排隊。
 * @param {number} slot
 */
export function spawnPose(slot) {
  const back = -RUNWAY.length / 2 + 120 + slot * 60; // 距西端 120m / 180m
  const side = (slot === 0 ? -1 : 1) * 10;           // 左右錯開，不疊機
  // 跑道座標 → 世界座標（long 軸沿 RUNWAY_DIR，側向為其法線）
  const nx = -RUNWAY_DIR.z, nz = RUNWAY_DIR.x;
  return {
    x: RUNWAY_DIR.x * back + nx * side,
    z: RUNWAY_DIR.z * back + nz * side,
    heading: headingRad,
  };
}

export function makeAirport() {
  const group = new THREE.Group();

  // 跑道本體
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.length, 0.4, RUNWAY.width),
    new THREE.MeshLambertMaterial({ color: '#84847c' }),
  );
  slab.position.y = 0.2;
  group.add(slab);

  // 中線白虛線（merge 成一顆 geometry）
  const dashGeos = [];
  for (let x = -RUNWAY.length / 2 + 80; x < RUNWAY.length / 2 - 80; x += 60) {
    const g = new THREE.BoxGeometry(30, 0.1, 1.2);
    g.translate(x, 0.45, 0);
    dashGeos.push(paintGeometry(g, '#f0efe8'));
  }
  // 兩端門檻條紋
  for (const end of [-1, 1]) {
    for (let i = -3; i <= 3; i++) {
      const g = new THREE.BoxGeometry(24, 0.1, 3);
      g.translate(end * (RUNWAY.length / 2 - 30), 0.45, i * 7.5);
      dashGeos.push(paintGeometry(g, '#f0efe8'));
    }
  }
  const markMat = new THREE.MeshLambertMaterial({ color: '#f0efe8' });
  for (const g of dashGeos) group.add(new THREE.Mesh(g, markMat));

  // 停機坪（跑道北側）
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(420, 0.3, 260),
    new THREE.MeshLambertMaterial({ color: '#9a9a92' }),
  );
  apron.position.set(0, 0.15, -(RUNWAY.width / 2 + 160));
  group.add(apron);

  // 滑行道鋪面（v4.0-1）：沿 taxiway graph 每條邊鋪一條鋪面帶，讓地面導航綠中線/跟我車落在鋪面上
  // （非跑道中線的邊；座標＝local along=x / lateral=z，與 runway/apron 同 local 框、靠 group 旋轉到世界）。
  // merge 成 1 顆（perf）。graph 是純資料（與 main 用的同一份，deterministic）。
  const tw = makeTaxiwayGraph();
  const stripGeos = [];
  for (const [a, b] of tw.edges) {
    const na = tw.nodes.get(a); const nb = tw.nodes.get(b);
    if (!na || !nb) continue;
    if (Math.abs(na.lateral) < 1 && Math.abs(nb.lateral) < 1) continue; // 跑道中線邊：跑道已鋪，跳過
    const dAlong = nb.along - na.along; const dLat = nb.lateral - na.lateral;
    const len = Math.hypot(dAlong, dLat);
    if (len < 1) continue;
    const g = new THREE.BoxGeometry(len + TAXIWAY_WIDTH, 0.3, TAXIWAY_WIDTH); // +寬度讓轉角接縫蓋住
    g.rotateY(Math.atan2(-dLat, dAlong));
    g.translate((na.along + nb.along) / 2, 0.16, (na.lateral + nb.lateral) / 2);
    stripGeos.push(g);
  }
  if (stripGeos.length) {
    const taxiways = new THREE.Mesh(mergeGeometries(stripGeos), new THREE.MeshLambertMaterial({ color: '#8f8f87' }));
    stripGeos.forEach((g) => g.dispose());
    group.add(taxiways);
  }

  // 航廈 + 塔台（voxel）
  const buildings = buildVoxelGeometry({
    scale: 1,
    palette: { B: '#e8ddc8', R: '#c8b9a0', T: '#d9cdb4', D: '#3a4666', C: '#bfe3f0' },
    boxes: [
      [-160, 0, -40, 320, 18, 60, 'B'],   // 航廈本體
      [-160, 18, -40, 320, 3, 60, 'R'],   // 屋頂
      [-150, 4, 18, 300, 8, 4, 'C'],      // 玻璃帶
      [120, 0, 40, 26, 42, 26, 'T'],      // 塔台柱
      [112, 42, 32, 42, 12, 42, 'D'],     // 塔台機艙
      [108, 54, 28, 50, 3, 50, 'R'],      // 塔台帽
    ],
  });
  const bMesh = new THREE.Mesh(buildings, voxelMaterial());
  bMesh.position.set(0, 0, -(RUNWAY.width / 2 + 320));
  group.add(bMesh);

  // 回家光柱：淡金色、不吃霧 → 10km 外也看得到「機場在那裡」
  const beacon = new THREE.Mesh(
    new THREE.BoxGeometry(16, 750, 16),
    new THREE.MeshBasicMaterial({
      color: '#ffd96b', transparent: true, opacity: 0.30, fog: false, depthWrite: false,
    }),
  );
  beacon.position.y = 375;
  beacon.renderOrder = 5;
  group.add(beacon);

  group.rotation.y = yawForX;
  return group;
}
