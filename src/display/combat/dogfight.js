// @ts-check
// V2 空戰場景編排：氣球靶場 + 彈丸 + 每 slot 武器狀態機。
// 純邏輯（鎖定/彈道/命中/彈藥/紅區豁免）全來自 combat/weapons.js（vitest 已測）；
// 本檔只負責「把核心接上 Three 場景 + 每 slot 武器狀態」——glue，不重寫邏輯。
//
// v2.0-2 階段：對「氣球靶」驗武器手感（GO/NO-GO）；命中後果軸（玩家被打→冒煙/出局）
// 需要敵對射手，自然落在 v2.0-3 PvP / v2.0-4 敵機。對地紅區：本階段放一個 demo 紅區 +
// 地面靶，驗「紅區內才可命中 + 地標豁免」红線（場景化紅區由 v2.0-4 進 airspace）。
import * as THREE from 'three';
import { buildVoxelGeometry, voxelMaterial } from '../../voxel/build.js';
import { balloonModel, balloonDriftPos } from '../../voxel/models/balloon.js';
import {
  WEAPON_SPECS, acquireAirLock, groundAimPoint, canHitGround,
  spawnProjectile, stepProjectile, makeMagazine, canFire, fire, reload,
} from './weapons.js';
import { MAX_SLOTS } from '../../../shared/constants.js';

/** 武器循環順序（換武器鍵照此循環） */
export const WEAPON_ORDER = /** @type {const} */ (['cartoon', 'aa', 'ag']);
const BALLOON_COLORS = ['#e0533d', '#3d7be0', '#f2b94b', '#5ac46b', '#b06be0'];
const BALLOON_COUNT = 8;
const BALLOON_RESPAWN_MS = 3000;
const PROJ_COLOR = { cartoon: '#ffd84a', boom: '#ff7a33' };

/** @param {number} lo @param {number} hi */
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

export class Dogfight {
  /**
   * @param {THREE.Scene} scene
   * @param {{ landmarks?:{x:number,z:number,r:number}[],
   *           redZones?:{x:number,z:number,r:number}[],
   *           groundY?:(x:number,z:number)=>number }} [cfg]
   */
  constructor(scene, { landmarks = [], redZones = [], groundY = () => 0 } = {}) {
    this.scene = scene;
    this.landmarks = landmarks;     // [{x,z,r}] 红線豁免（命中地標無效）
    this.redZones = redZones;       // [{x,z,r}] 對地可命中區
    this.groundY = groundY;
    this.active = false;

    /** @type {{id:string, mesh:THREE.Mesh, center:{x:number,y:number,z:number}, pos:{x:number,y:number,z:number}, drift:{radius:number,speed:number,axis:string,phase:number}|null, alive:boolean, respawnAt:number}[]} */
    this.balloons = [];
    /** @type {{proj:any, owner:number, mesh:THREE.Mesh}[]} */
    this.projectiles = [];
    /** @type {{mesh:THREE.Mesh, pos:{x:number,y:number,z:number}, alive:boolean, respawnAt:number}|null} */
    this.groundTarget = null;

    // 每 slot 武器狀態
    this.weaponSel = Array.from({ length: MAX_SLOTS }, () => 0);
    this.mags = Array.from({ length: MAX_SLOTS }, () => this._freshMags());
    /** @type {(string|null)[]} */
    this.lockId = Array.from({ length: MAX_SLOTS }, () => null);
    this.score = Array.from({ length: MAX_SLOTS }, () => 0);

    // 共用幾何/材質（彈丸小球）
    this._projGeo = new THREE.SphereGeometry(3, 8, 6);
    this._projMat = {
      cartoon: new THREE.MeshBasicMaterial({ color: PROJ_COLOR.cartoon }),
      boom: new THREE.MeshBasicMaterial({ color: PROJ_COLOR.boom }),
    };
    /** @type {Map<string, THREE.BufferGeometry>} */
    this._balloonGeo = new Map();
  }

  /** @returns {Record<string, any>} 三種武器各一個滿彈匣 */
  _freshMags() {
    /** @type {Record<string, any>} */
    const m = {};
    for (const id of WEAPON_ORDER) m[id] = makeMagazine(WEAPON_SPECS[id]);
    return m;
  }

  /** @param {string} color */
  _balloonGeometry(color) {
    let g = this._balloonGeo.get(color);
    if (!g) { g = buildVoxelGeometry(balloonModel, { C: color }); this._balloonGeo.set(color, g); }
    return g;
  }

  /** 進/離空戰：spawn / 清空靶場。 @param {boolean} on */
  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    if (on) {
      this._spawnBalloons();
      this._spawnGroundTarget();
      for (let i = 0; i < MAX_SLOTS; i++) { this.weaponSel[i] = 0; this.mags[i] = this._freshMags(); this.score[i] = 0; this.lockId[i] = null; }
    } else {
      this._clear();
    }
  }

  _spawnBalloons() {
    this._clearBalloons();
    for (let i = 0; i < BALLOON_COUNT; i++) {
      const color = BALLOON_COLORS[i % BALLOON_COLORS.length];
      const mesh = new THREE.Mesh(this._balloonGeometry(color), voxelMaterial());
      // 散佈在機場周邊空域（起飛後找得到），高度 150~350m
      const ang = (i / BALLOON_COUNT) * Math.PI * 2 + rand(-0.3, 0.3);
      const dist = rand(600, 1900);
      const center = { x: Math.sin(ang) * dist, y: rand(150, 340), z: -Math.cos(ang) * dist };
      const moving = i % 2 === 1; // 半數活動靶
      const drift = moving ? { radius: rand(60, 160), speed: rand(0.4, 0.9), axis: 'xz', phase: i } : null;
      mesh.position.set(center.x, center.y, center.z);
      this.scene.add(mesh);
      this.balloons.push({ id: `b${i}`, mesh, center, pos: { ...center }, drift, alive: true, respawnAt: 0 });
    }
  }

  _spawnGroundTarget() {
    if (this.groundTarget || this.redZones.length === 0) return;
    const z0 = this.redZones[0];
    const gy = this.groundY(z0.x, z0.z);
    const geo = new THREE.BoxGeometry(40, 30, 40);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#c0392b' }));
    mesh.position.set(z0.x, gy + 15, z0.z);
    this.scene.add(mesh);
    this.groundTarget = { mesh, pos: { x: z0.x, y: gy, z: z0.z }, alive: true, respawnAt: 0 };
  }

  _clearBalloons() {
    for (const b of this.balloons) this.scene.remove(b.mesh);
    this.balloons = [];
  }

  _clear() {
    this._clearBalloons();
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    if (this.groundTarget) { this.scene.remove(this.groundTarget.mesh); this.groundTarget.mesh.geometry.dispose(); this.groundTarget = null; }
  }

  /** @param {number} slot @returns {'cartoon'|'aa'|'ag'} 目前武器 id */
  weaponId(slot) { return WEAPON_ORDER[this.weaponSel[slot] % WEAPON_ORDER.length]; }
  /** @param {number} slot */
  weaponSpec(slot) { return WEAPON_SPECS[this.weaponId(slot)]; }

  /** 換武器（上升緣呼叫一次）。 @param {number} slot @returns {string} 新武器 label */
  cycleWeapon(slot) {
    this.weaponSel[slot] = (this.weaponSel[slot] + 1) % WEAPON_ORDER.length;
    return this.weaponSpec(slot).label;
  }

  /** 回機場補滿三種彈匣。 @param {number} slot */
  reloadAll(slot) { for (const id of WEAPON_ORDER) reload(this.mags[slot][id]); }

  /** @param {number} slot HUD：武器 + 彈藥 + 分數 */
  hudText(slot) {
    const spec = this.weaponSpec(slot);
    const mag = this.mags[slot][this.weaponId(slot)];
    return `${spec.label} ${mag.ammo}/${mag.max}　💥${this.score[slot]}`;
  }

  /** 存活氣球（給鎖定用）。 @returns {{id:string,pos:{x:number,y:number,z:number}}[]} */
  _airTargets() {
    return this.balloons.filter((b) => b.alive).map((b) => ({ id: b.id, pos: b.pos }));
  }

  /** @param {string} id @returns {{x:number,y:number,z:number}|null} */
  _targetPosOf(id) {
    const b = this.balloons.find((x) => x.id === id);
    return b && b.alive ? b.pos : null;
  }

  /**
   * 每 slot 每幀：更新鎖定（對空＝最近氣球）。回傳 lockId（HUD 用）。
   * @param {number} slot @param {{pos:{x:number,y:number,z:number}, heading:number}} plane
   * @returns {string|null}
   */
  updateLock(slot, plane) {
    const spec = this.weaponSpec(slot);
    this.lockId[slot] = spec.kind === 'air'
      ? acquireAirLock({ pos: plane.pos, heading: plane.heading }, this._airTargets(), spec)
      : null;
    return this.lockId[slot];
  }

  /**
   * 嘗試發射（FIRE 按住時每幀呼叫；依武器冷卻節流）。
   * @param {number} slot @param {{pos:{x:number,y:number,z:number}, heading:number}} plane @param {number} now ms
   * @returns {{fired:boolean, sound?:'cartoon'|'boom'}}
   */
  tryFire(slot, plane, now) {
    const id = this.weaponId(slot);
    const spec = this.weaponSpec(slot);
    const mag = this.mags[slot][id];
    if (!canFire(mag, now)) return { fired: false };
    fire(mag, now);
    const shooter = { pos: plane.pos, heading: plane.heading };
    const targetId = spec.kind === 'air' ? this.lockId[slot] : null;
    const proj = spawnProjectile(shooter, spec, targetId);
    if (spec.kind === 'ground') {
      // 對地：平射到不了地面 → 把彈道導向機頭前方的地面點（玩家用「飛到紅區上方」對準）。
      const fwd = Math.min(spec.rangeM * 0.85, Math.max(200, plane.pos.y * 2.2)); // 高度越高瞄越遠（淺俯角）
      const aim = groundAimPoint(shooter, fwd);
      const gy = this.groundY(aim.x, aim.z);
      const dx = aim.x - proj.pos.x, dy = gy - proj.pos.y, dz = aim.z - proj.pos.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      proj.vel = { x: (dx / len) * spec.speedMps, y: (dy / len) * spec.speedMps, z: (dz / len) * spec.speedMps };
    }
    const mesh = new THREE.Mesh(this._projGeo, this._projMat[spec.sound]);
    mesh.position.set(proj.pos.x, proj.pos.y, proj.pos.z);
    this.scene.add(mesh);
    this.projectiles.push({ proj, owner: slot, mesh });
    return { fired: true, sound: spec.sound };
  }

  /**
   * 推進一步：氣球漂移 + 彈丸前進 + 命中處理 + 重生。回傳本步命中事件（caller 播音/計分）。
   * 事件 kind：pop=氣球啵、boom=紅區地面靶命中、exempt=打到地標（红線無效）、miss=對地落空。
   * @param {number} dt @param {number} now ms
   * @returns {{kind:'pop'|'boom'|'exempt'|'miss', owner:number, sound:'cartoon'|'boom'}[]}
   */
  step(dt, now) {
    if (!this.active) return [];
    // 1. 氣球漂移 + 重生
    for (const b of this.balloons) {
      if (b.alive) {
        b.pos = b.drift ? balloonDriftPos(b.center, now / 1000, b.drift) : b.center;
        b.mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
      } else if (now >= b.respawnAt) {
        // 換位重生（持續有靶可打）
        const ang = rand(0, Math.PI * 2), dist = rand(600, 1900);
        b.center = { x: Math.sin(ang) * dist, y: rand(150, 340), z: -Math.cos(ang) * dist };
        b.pos = { ...b.center };
        b.alive = true;
        b.mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
        b.mesh.visible = true;
      }
    }
    // 地面靶重生
    if (this.groundTarget && !this.groundTarget.alive && now >= this.groundTarget.respawnAt) {
      this.groundTarget.alive = true;
      this.groundTarget.mesh.visible = true;
    }

    /** @type {{kind:'pop'|'boom'|'exempt'|'miss', owner:number, sound:'cartoon'|'boom'}[]} */
    const events = [];
    const env = { targetPosOf: (/** @type {string} */ id) => this._targetPosOf(id), groundY: this.groundY };

    // 2. 彈丸前進 + 命中
    const survivors = [];
    for (const p of this.projectiles) {
      const res = stepProjectile(p.proj, dt, env);
      p.mesh.position.set(p.proj.pos.x, p.proj.pos.y, p.proj.pos.z);
      if (res.result === 'flying') { survivors.push(p); continue; }
      if (res.result === 'hit') {
        const sound = p.proj.spec.sound;
        if (p.proj.spec.kind === 'air' && res.targetId != null) {
          // 對空命中氣球 → 啵（去暴力）
          const b = this.balloons.find((x) => x.id === res.targetId);
          if (b && b.alive) { b.alive = false; b.mesh.visible = false; b.respawnAt = now + BALLOON_RESPAWN_MS; this.score[p.owner] += 1; events.push({ kind: 'pop', owner: p.owner, sound }); }
        } else {
          // 對地命中：红線豁免 —— 只有落在紅區內、且不在地標上才生效
          const point = { x: p.proj.pos.x, z: p.proj.pos.z };
          const ok = canHitGround(point, { redZones: this.redZones, landmarks: this.landmarks });
          const onLandmark = this.landmarks.some((z) => Math.hypot(point.x - z.x, point.z - z.z) <= z.r);
          if (ok && this.groundTarget && this.groundTarget.alive
              && Math.hypot(point.x - this.groundTarget.pos.x, point.z - this.groundTarget.pos.z) <= 80) {
            this.groundTarget.alive = false; this.groundTarget.mesh.visible = false;
            this.groundTarget.respawnAt = now + BALLOON_RESPAWN_MS; this.score[p.owner] += 1;
            events.push({ kind: 'boom', owner: p.owner, sound });
          } else if (onLandmark) {
            events.push({ kind: 'exempt', owner: p.owner, sound }); // 红線：打到教育地標＝無效
          } else {
            events.push({ kind: 'miss', owner: p.owner, sound }); // 紅區外/沒中靶
          }
        }
      }
      this.scene.remove(p.mesh); // hit / expired → 移除彈丸
    }
    this.projectiles = survivors;
    return events;
  }
}
