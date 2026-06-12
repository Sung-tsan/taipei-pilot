// @ts-check
// 三河系（風格化折線 → 藍色緞帶）：淡水河（西）、基隆河（北，繞過松機）、新店溪（西南）。
// 座標：世界原點 = 松機跑道中心，X=東、Z=南，單位 m。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintGeometry } from '../../voxel/build.js';

export const WATER_COLOR = '#5fb4e8'; // 亮藍（對標參考作品的河色）

/** @typedef {{ name:string, width:number, points:[number,number][] }} River */

/** @type {River[]} */
export const RIVERS = [
  {
    name: '基隆河', width: 220,
    points: [
      [6800, -300], [5200, -900], [3600, -700], [2200, -250],
      [600, -650], [-700, -1500], [-2200, -1300], [-3800, -2100],
      [-5200, -2700], [-6300, -2600],
    ],
  },
  {
    name: '淡水河', width: 380,
    points: [
      [-5300, 7200], [-5700, 5400], [-5900, 3600], [-6100, 1800],
      [-6250, 200], [-6300, -1400], [-6500, -3200], [-7300, -5200], [-8200, -6800],
    ],
  },
  {
    name: '新店溪', width: 260,
    points: [
      [-900, 8600], [-2200, 7600], [-3600, 6800], [-4700, 6200], [-5500, 5600],
    ],
  },
];

/** 點到線段距離 @param {number} px @param {number} pz @param {number[]} a @param {number[]} b */
function segDist(px, pz, a, b) {
  const vx = b[0] - a[0], vz = b[1] - a[1];
  const wx = px - a[0], wz = pz - a[1];
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(px - (a[0] + vx * t), pz - (a[1] + vz * t));
}

/** (x,z) 是否在河道走廊內（建築排除 + 視覺寬度共用） @param {number} x @param {number} z @param {number} margin */
export function inRiverCorridor(x, z, margin = 60) {
  for (const r of RIVERS) {
    const half = r.width / 2 + margin;
    for (let i = 0; i < r.points.length - 1; i++) {
      if (segDist(x, z, r.points[i], r.points[i + 1]) < half) return true;
    }
  }
  return false;
}

/** 沿折線取點（fraction 0..1） @param {River} r @param {number} f */
function alongRiver(r, f) {
  const i = Math.min(Math.floor(f * (r.points.length - 1)), r.points.length - 2);
  const t = f * (r.points.length - 1) - i;
  const [ax, az] = r.points[i];
  const [bx, bz] = r.points[i + 1];
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, angle: Math.atan2(bz - az, bx - ax) };
}

/** 河流視覺：水帶 + 淺色河岸 + 小船點綴（voxel 感的稜角河岸剛好是風格） */
export function makeRivers() {
  /** @type {THREE.BufferGeometry[]} */
  const geos = [];
  /** @param {THREE.BufferGeometry} g @param {string} color @param {number} x @param {number} y @param {number} z @param {number} rot */
  const place = (g, color, x, y, z, rot) => {
    paintGeometry(g, color);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(-rot).setPosition(x, y, z));
    geos.push(g);
  };

  for (const r of RIVERS) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const [ax, az] = r.points[i];
      const [bx, bz] = r.points[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const angle = Math.atan2(bz - az, bx - ax);
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      // 河岸（淺沙色，比水寬一圈）
      place(new THREE.BoxGeometry(len + r.width * 0.8, 0.5, r.width + 50), '#cfd6c4', mx, -0.25, mz, angle);
      // 水帶
      place(new THREE.BoxGeometry(len + r.width * 0.7, 0.6, r.width), WATER_COLOR, mx, -0.05, mz, angle);
    }
    // 小船（沿河 4 艘，固定 fraction → 決定性）
    for (let b = 0; b < 4; b++) {
      const f = 0.15 + b * 0.22;
      const { x, z, angle } = alongRiver(r, f);
      const off = (b % 2 === 0 ? -1 : 1) * r.width * 0.2;
      const ox = x - Math.sin(angle) * off, oz = z + Math.cos(angle) * off;
      place(new THREE.BoxGeometry(26, 4, 9), b % 3 === 0 ? '#e0533d' : '#f4f1e8', ox, 0.5, oz, angle);
      place(new THREE.BoxGeometry(10, 4, 6), '#3a4666', ox, 4.5, oz, angle);
    }
  }

  // 橋（手放：基隆河×2、淡水河×2、新店溪×1）
  /** @type {[number, number, number, number, string][]} x,z,角度,長度,色 */
  const BRIDGES = [
    [600, -650, 1.45, 340, '#c8c8c0'],    // 大直橋（跨基隆河）
    [-2200, -1300, 1.6, 340, '#c8c8c0'],  // 圓山一帶
    [-6250, 200, 0.1, 520, '#d24b3e'],    // 忠孝橋（紅）
    [-6450, -3000, 0.3, 520, '#c8c8c0'],  // 台北橋一帶
    [-3600, 6800, 0.8, 400, '#c8c8c0'],   // 新店溪
  ];
  for (const [x, z, rot, len, color] of BRIDGES) {
    place(new THREE.BoxGeometry(len, 3, 16), color, x, 10, z, rot);          // 橋面
    place(new THREE.BoxGeometry(len, 2, 2), color, x, 13, z + 8, rot);       // 欄杆（近似，不精準跟旋轉也可愛）
    place(new THREE.BoxGeometry(len, 2, 2), color, x, 13, z - 8, rot);
    for (const k of [-0.3, 0, 0.3]) {                                        // 橋墩
      place(new THREE.BoxGeometry(8, 10, 8), '#9a9a92',
        x + Math.cos(rot) * len * k, 0, z + Math.sin(rot) * len * k, rot);
    }
  }

  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'rivers';
  return mesh;
}
