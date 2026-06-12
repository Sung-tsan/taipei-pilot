// @ts-check
// 台北空域組裝：機場 + 三河 + 地標（真實經緯度落點）+ 程序化街區 → 場景與 env。
import * as THREE from 'three';
import { buildVoxelGeometry, voxelMaterial } from '../../voxel/build.js';
import {
  taipei101, grandHotel, presidentialOffice, cksMemorial,
  miramarWheel, ximenRedHouse, daanPark,
} from '../../voxel/models/landmarks.js';
import { makeRivers } from './rivers.js';
import { generateCity } from './city-gen.js';
import { makeAirport, RUNWAY_DIR, RUNWAY } from './airport.js';

/** 松山機場跑道中心 = 世界原點 */
const LAT0 = 25.0694, LNG0 = 121.5521;
const M_PER_LNG = 100856; // 111320 × cos(25.07°)
const M_PER_LAT = 110574;

/** @param {number} lat @param {number} lng */
export function latLngToXZ(lat, lng) {
  return { x: (lng - LNG0) * M_PER_LNG, z: -(lat - LAT0) * M_PER_LAT };
}

/** 地標清單（facts 之後內容包用；DRAFT 待校稿） */
const LANDMARK_DEFS = [
  { build: taipei101, lat: 25.0339, lng: 121.5645, clear: 230 },
  { build: grandHotel, lat: 25.0794, lng: 121.5263, clear: 280 },
  { build: presidentialOffice, lat: 25.0400, lng: 121.5119, clear: 300 },
  { build: cksMemorial, lat: 25.0347, lng: 121.5217, clear: 260 },
  { build: miramarWheel, lat: 25.0833, lng: 121.5571, clear: 220 },
  { build: ximenRedHouse, lat: 25.0421, lng: 121.5071, clear: 170 },
  { build: daanPark, lat: 25.0300, lng: 121.5360, clear: 380 },
];

const AIRPORT_CLEAR = { along: 1900, cross: 800 };
const RUNWAY_STRIP = { along: RUNWAY.length / 2 + 150, cross: 120 };
const AIRPORT_ZONE_R = 2000;

/** 跑道座標系投影 @param {number} x @param {number} z */
function runwayLocal(x, z) {
  return {
    along: x * RUNWAY_DIR.x + z * RUNWAY_DIR.z,
    cross: x * -RUNWAY_DIR.z + z * RUNWAY_DIR.x,
  };
}

/**
 * @typedef {{ name:string, x:number, z:number, topY:number,
 *             aabb:{minX:number,maxX:number,minZ:number,maxZ:number,h:number} }} LandmarkInfo
 */

export function makeTaipei() {
  const group = new THREE.Group();
  group.add(makeAirport());
  group.add(makeRivers());

  /** @type {LandmarkInfo[]} */
  const landmarks = [];
  const mat = voxelMaterial();
  for (const def of LANDMARK_DEFS) {
    const model = def.build();
    const geo = buildVoxelGeometry(model);
    const mesh = new THREE.Mesh(geo, mat);
    const { x, z } = latLngToXZ(def.lat, def.lng);
    mesh.position.set(x, 0, z);
    group.add(mesh);
    geo.computeBoundingBox();
    const bb = /** @type {THREE.Box3} */ (geo.boundingBox);
    landmarks.push({
      name: model.name ?? '', x, z, topY: bb.max.y,
      aabb: {
        minX: x + bb.min.x, maxX: x + bb.max.x,
        minZ: z + bb.min.z, maxZ: z + bb.max.z,
        h: bb.max.y,
      },
    });
  }

  // 程序化街區（淨空：機場矩形 + 地標 clear 半徑）
  const city = generateCity({
    exclude: (x, z) => {
      const { along, cross } = runwayLocal(x, z);
      if (Math.abs(along) < AIRPORT_CLEAR.along && Math.abs(cross) < AIRPORT_CLEAR.cross) return true;
      for (let i = 0; i < LANDMARK_DEFS.length; i++) {
        const lm = landmarks[i];
        if (Math.hypot(x - lm.x, z - lm.z) < LANDMARK_DEFS[i].clear) return true;
      }
      return false;
    },
  });
  group.add(city.group);

  /** @param {number} x @param {number} z @returns {{h:number, cx:number, cz:number}|null} */
  function solidAt(x, z) {
    for (const lm of landmarks) {
      const a = lm.aabb;
      if (x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ) {
        return { h: a.h, cx: lm.x, cz: lm.z };
      }
    }
    const b = city.buildingAt(x, z);
    return b ? { h: b.h, cx: b.x + b.w / 2, cz: b.z + b.d / 2 } : null;
  }

  /** @type {import('../flight/flight-model.js').Env} */
  const env = {
    groundY: (x, z) => solidAt(x, z)?.h ?? 0,
    canLandHere: (x, z) => {
      const { along, cross } = runwayLocal(x, z);
      return Math.abs(along) < RUNWAY_STRIP.along && Math.abs(cross) < RUNWAY_STRIP.cross;
    },
    inLowFlyZone: (x, z) => Math.hypot(x, z) < AIRPORT_ZONE_R,
  };

  return { group, env, landmarks, solidAt, stats: city.stats };
}
