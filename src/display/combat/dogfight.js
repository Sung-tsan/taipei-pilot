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
import { missileModel } from '../../voxel/models/missile.js';
import {
  WEAPON_SPECS, acquireAirLock, groundAimPoint, canHitGround,
  spawnProjectile, stepProjectile, makeMagazine, canFire, fire, reload,
} from './weapons.js';
import { decideInput, shouldFire } from './enemy-ai.js';
import { PlaneEntity } from '../planes/plane-entity.js';
import { makePlane, stepPlane } from '../flight/flight-model.js';
import { flightParams, planeSpec } from '../planes/plane-specs.js';
import { MAX_SLOTS } from '../../../shared/constants.js';

/** 武器循環順序（換武器鍵照此循環） */
export const WEAPON_ORDER = /** @type {const} */ (['cartoon', 'aa', 'ag']);
/** 空戰子模式 → HUD 圖示（武器卡前綴） */
const SUBMODE_ICON = { balloons: '🎈', pvp: '⚔️', ai_1v1: '🤖', ai_2v2: '🤝' };
const BALLOON_COLORS = ['#e0533d', '#3d7be0', '#f2b94b', '#5ac46b', '#b06be0'];
const BALLOON_COUNT = 8;
const BALLOON_SCALE = 3.2;        // HITL：氣球放大才找得到（模型 ~4m × 3.2 ≈ 13m）
const GROUND_RESPAWN_MS = 3000;   // 地面靶打掉後重生間隔
const PROJ_COLOR = { cartoon: '#ffd84a', boom: '#ff7a33', enemy: '#ff4d4d' };
const ENEMY_ACCENT = '#3a4250';   // 敵機機身色（暗灰，與紅/藍友機區隔）
const ENEMY_FIRE_GRACE_MS = 3000; // 敵機 spawn 後不開火的緩衝（HITL：別一出現就秒射、玩家來得及反應）
// 敵機 spawn 編隊（HITL 2026-06-15）：拉遠、落在玩家「前方弧內」（不要一出現就咬機尾根本瞄不到），
// V 字編隊出現 → 接近後各自追擊自然分散；每機隨機強度（弱兵/王牌）。
const ENEMY_SPAWN_DIST = 3000;    // m 編隊 spawn 距離（遠方進場）
const ENEMY_SPAWN_ARC_RAD = (55 * Math.PI) / 180; // spawn 方向落在玩家機頭 ±55° 內（看得到、瞄得到）
const ENEMY_FORMATION_GAP = 150;  // m 編隊橫向間距
const ENEMY_FORMATION_BACK = 80;  // m V 字外側後退量（每道）
const ENEMY_ALT = 320;            // m 敵機巡航高度
const ENEMY_STRENGTH_MIN = 0.55;  // 隨機強度下限（弱兵）
const ENEMY_STRENGTH_SPAN = 0.8;  // 隨機強度跨度（上限 ≈ 1.35＝王牌）
const AI_COUNT = { ai_1v1: 1, ai_2v2: 4 }; // 每波敵機數（HITL：2v2 從 2 → 4，多一點）
// 敵彈：刻意「可閃」——慢、弱追蹤（追蹤力再隨難度縮放），與玩家的卡通彈(homing 2.6 黏死)不同。
/** @type {import('./weapons.js').WeaponSpec} */
const ENEMY_WEAPON = {
  id: 'enemy', label: '敵彈', kind: 'air',
  rangeM: 550, speedMps: 150, homingRate: 0.5, lifetimeSec: 4,
  cooldownSec: 1.8, magazine: 999, hitRadiusM: 16, sound: 'cartoon',
};

/** @param {number} lo @param {number} hi */
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class Dogfight {
  /**
   * @param {THREE.Scene} scene
   * @param {{ landmarks?:{x:number,z:number,r:number}[],
   *           redZones?:{x:number,z:number,r:number}[],
   *           groundY?:(x:number,z:number)=>number,
   *           env?:import('../flight/flight-model.js').Env|null }} [cfg]
   */
  constructor(scene, { landmarks = [], redZones = [], groundY = () => 0, env = null } = {}) {
    this.scene = scene;
    this.landmarks = landmarks;     // [{x,z,r}] 红線豁免（命中地標無效）
    this.redZones = redZones;       // [{x,z,r}] 對地可命中區
    this.groundY = groundY;
    this.env = env || { groundY, canLandHere: () => false, inLowFlyZone: () => true }; // 敵機飛行用 Env
    this.active = false;

    /** @type {{id:string, mesh:THREE.Mesh, center:{x:number,y:number,z:number}, pos:{x:number,y:number,z:number}, drift:{radius:number,speed:number,axis:string,phase:number}|null, alive:boolean}[]} */
    this.balloons = [];
    this.balloonTotal = 0; // 本輪氣球總數（HITL：要知道剩幾顆）
    /** @type {{proj:any, owner:number, mesh:THREE.Mesh, missile:boolean, fromEnemy:boolean}[]} */
    this.projectiles = [];
    /** @type {{mesh:THREE.Mesh, disc?:THREE.Mesh, pos:{x:number,y:number,z:number}, alive:boolean, respawnAt:number}|null} */
    this.groundTarget = null;

    // 每 slot 武器狀態
    this.weaponSel = Array.from({ length: MAX_SLOTS }, () => 0);
    this.mags = Array.from({ length: MAX_SLOTS }, () => this._freshMags());
    /** @type {(string|null)[]} */
    this.lockId = Array.from({ length: MAX_SLOTS }, () => null);
    this.score = Array.from({ length: MAX_SLOTS }, () => 0); // 氣球/地面靶總分
    this.kills = Array.from({ length: MAX_SLOTS }, () => 0); // PvP 擊落數
    this.shots = Array.from({ length: MAX_SLOTS }, () => 0); // 發射數（命中率分母）
    this.hits = Array.from({ length: MAX_SLOTS }, () => 0);  // 命中數（氣球/地面靶/玩家）

    // PvP：dogfightMode==='pvp' 才開玩家互打；否則兩機幽靈穿透（不互鎖、不互傷）。
    this.pvp = false;
    this.dfMode = 'balloons'; // balloons / pvp / ai_1v1 / ai_2v2
    /** @type {{slot:number, pos:{x:number,y:number,z:number}, heading?:number, alive:boolean}[]} 每幀由 main 餵入的可命中玩家（heading 供敵機 spawn 算「玩家前方」） */
    this.players = [];

    // 敵機 AI（ai_1v1 / ai_2v2）：難度由 main 依局數+adaptive 餵入；strength＝每機隨機強度倍率。
    /** @type {{id:string, state:any, entity:PlaneEntity, mag:any, alive:boolean, spawnAt:number, strength:number}[]} */
    this.enemies = [];
    this.difficulty = 0.3; // 0..1（難度曲線，main 餵）
    this.handicap = 0.4;   // 0..1（adaptive 放水，main 餵）
    this._f16 = flightParams('f16'); // 敵機飛行手感（噴射機）

    // 共用幾何/材質：卡通彈＝小亮球；擬真飛彈＝飛彈 voxel（HITL：要像飛彈）
    this._projGeo = new THREE.SphereGeometry(3, 8, 6);
    this._projMat = { cartoon: new THREE.MeshBasicMaterial({ color: PROJ_COLOR.cartoon }) };
    /** @type {THREE.MeshBasicMaterial|null} 敵機彈材質（lazy） */
    this._enemyMat = null;
    this._missileGeo = buildVoxelGeometry(missileModel, { A: PROJ_COLOR.boom });
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
      this._applyModeTargets();
      for (let i = 0; i < MAX_SLOTS; i++) {
        this.weaponSel[i] = 0; this.mags[i] = this._freshMags(); this.lockId[i] = null;
        this.score[i] = 0; this.kills[i] = 0; this.shots[i] = 0; this.hits[i] = 0;
      }
    } else {
      this._clear();
    }
  }

  /** 設空戰子模式（balloons/pvp/ai_1v1/ai_2v2）。 @param {string} dogfightMode */
  setMode(dogfightMode) {
    this.dfMode = dogfightMode;
    this.pvp = dogfightMode === 'pvp';
    if (this.active) this._applyModeTargets();
  }

  /** main 每幀餵入「可命中玩家」清單（重生無敵期間的玩家不在內）。 @param {{slot:number,pos:{x:number,y:number,z:number},alive:boolean}[]} players */
  setPlayers(players) { this.players = Array.isArray(players) ? players : []; }

  /** main 餵入敵機難度（難度曲線）+ handicap（adaptive 放水）。 @param {number} difficulty @param {number} handicap */
  setDifficulty(difficulty, handicap) {
    if (Number.isFinite(difficulty)) this.difficulty = difficulty;
    if (Number.isFinite(handicap)) this.handicap = handicap;
  }

  /** 依目前子模式佈置目標：pvp＝清場打玩家；ai＝spawn 敵機；否則＝氣球靶場 + 地面靶。 */
  _applyModeTargets() {
    this._clearBalloons();
    this._clearEnemies();
    this.balloonTotal = 0;
    if (this.pvp) return;                                   // PvP：對手＝玩家
    if (this.dfMode === 'ai_1v1' || this.dfMode === 'ai_2v2') { this.spawnEnemies(this._waveCount()); return; }
    this._spawnBalloons();                                  // balloons（預設）
    this._spawnGroundTarget();
  }

  /** 每波敵機數（HITL：2v2 多一點）。 @returns {number} */
  _waveCount() { return AI_COUNT[/** @type {keyof typeof AI_COUNT} */ (this.dfMode)] ?? 1; }

  /**
   * 編隊 spawn 錨點：遠離玩家、落在玩家機頭前方弧內（不在機尾），朝玩家飛來。
   * 沒有在飛的玩家（剛進場/還在跑道）→ 退回機場原點、朝北（敵機從北方遠處進場）。
   * @returns {{x:number, z:number, heading:number}} heading＝敵機飛行朝向（指回玩家）
   */
  _spawnAnchor() {
    const flying = this.players.filter((p) => p && p.alive);
    let cx = 0, cz = 0, face = 0;
    if (flying.length) {
      for (const p of flying) { cx += p.pos.x; cz += p.pos.z; }
      cx /= flying.length; cz /= flying.length;
      const h = flying[0].heading;
      face = Number.isFinite(h) ? /** @type {number} */ (h) : 0; // 以第一架玩家朝向當「前方」
    }
    // 在玩家前方 ±ARC 內挑方向（避免一出現就在機尾）→ 往該方向拉遠 ENEMY_SPAWN_DIST。
    const dir = face + rand(-ENEMY_SPAWN_ARC_RAD, ENEMY_SPAWN_ARC_RAD);
    const ax = cx + Math.sin(dir) * ENEMY_SPAWN_DIST;
    const az = cz - Math.cos(dir) * ENEMY_SPAWN_DIST;
    // 敵機朝玩家質心飛（heading 指回 center）。
    const heading = Math.atan2(cx - ax, -(cz - az));
    return { x: ax, z: az, heading };
  }

  /** spawn 一波 n 架敵機：V 字編隊、遠方前方進場、每機隨機強度（噴射機、敵色）。 @param {number} n */
  spawnEnemies(n) {
    this._clearEnemies();
    const a = this._spawnAnchor();
    const ph = a.heading;
    const rx = Math.cos(ph), rz = Math.sin(ph);   // 航向右側單位向量
    const fx = Math.sin(ph), fz = -Math.cos(ph);  // 航向前方單位向量
    for (let i = 0; i < n; i++) {
      const lane = i - (n - 1) / 2;               // 置中分道：…-1,0,1…
      const lat = lane * ENEMY_FORMATION_GAP;
      const back = Math.abs(lane) * ENEMY_FORMATION_BACK; // V 字：外側略後
      const state = makePlane({
        x: a.x + rx * lat - fx * back,
        z: a.z + rz * lat - fz * back,
        heading: ph,
      });
      state.pos.y = ENEMY_ALT + lane * 18; state.speed = 62; state.mode = 'flying';
      const entity = new PlaneEntity(this.scene, 0, planeSpec('f16').model, ENEMY_ACCENT);
      entity.setVisible(true);
      const strength = clamp(ENEMY_STRENGTH_MIN + Math.random() * ENEMY_STRENGTH_SPAN, 0, 1.35);
      this.enemies.push({ id: `e${i}`, state, entity, mag: makeMagazine(ENEMY_WEAPON), alive: true, spawnAt: -1, strength });
    }
  }

  /** spawn 下一波（依子模式 1v1/2v2 決定架數）。 */
  spawnWave() { this.spawnEnemies(this._waveCount()); }

  _clearEnemies() {
    for (const e of this.enemies) e.entity.dispose();
    this.enemies = [];
  }

  /** 存活敵機數。 */
  aliveEnemies() { return this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0); }

  /**
   * 翻滾閃避：把所有正咬著該玩家的「敵機追蹤彈」拔鎖（targetId→null）→ 彈丸轉直線飛走、不再咬人。
   * 由 main 在玩家觸發翻滾 + 閃避窗內每幀呼叫（HITL：按一下就甩掉飛彈）。
   * @param {number} slot 被咬的玩家 slot
   * @returns {number} 被拔鎖的彈丸數
   */
  breakLocksOn(slot) {
    const id = `p${slot}`;
    let n = 0;
    for (const p of this.projectiles) {
      if (p.fromEnemy && p.proj.targetId === id) { p.proj.targetId = null; n += 1; }
    }
    return n;
  }

  /** 離某點最近的存活玩家（敵機選目標用）。 @param {{x:number,y:number,z:number}} pos */
  _nearestPlayerTo(pos) {
    let best = null; let bd = Infinity;
    for (const p of this.players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /** 命中率（%，整數）。 @param {number} slot */
  hitRate(slot) { return this.shots[slot] ? Math.round((this.hits[slot] / this.shots[slot]) * 100) : 0; }

  _spawnBalloons() {
    this._clearBalloons();
    for (let i = 0; i < BALLOON_COUNT; i++) {
      const color = BALLOON_COLORS[i % BALLOON_COLORS.length];
      const mesh = new THREE.Mesh(this._balloonGeometry(color), voxelMaterial());
      mesh.scale.setScalar(BALLOON_SCALE); // HITL：放大才找得到
      const center = this._randBalloonPos(i);
      const moving = i % 2 === 1; // 半數活動靶
      const drift = moving ? { radius: rand(60, 160), speed: rand(0.4, 0.9), axis: 'xz', phase: i } : null;
      mesh.position.set(center.x, center.y, center.z);
      this.scene.add(mesh);
      this.balloons.push({ id: `b${i}`, mesh, center, pos: { ...center }, drift, alive: true });
    }
    this.balloonTotal = this.balloons.length;
  }

  /** 隨機氣球位置（機場周邊空域、稍近以利尋找）。 @param {number} i @returns {{x:number,y:number,z:number}} */
  _randBalloonPos(i) {
    const ang = (i / BALLOON_COUNT) * Math.PI * 2 + rand(-0.3, 0.3);
    const dist = rand(500, 1500);
    return { x: Math.sin(ang) * dist, y: rand(160, 320), z: -Math.cos(ang) * dist };
  }

  /** 本輪存活氣球數（HITL HUD：剩幾顆） */
  aliveBalloons() { return this.balloons.reduce((n, b) => n + (b.alive ? 1 : 0), 0); }

  /**
   * 找最近的存活對空目標（氣球/敵機/對手），回方位（相對機頭）+ 距離（指引箭頭用，HITL：要指引才找得到）。
   * @param {number} slot @param {{pos:{x:number,y:number,z:number}, heading:number}} plane
   * @returns {{rel:number, distM:number}|null}
   */
  nearestTarget(slot, plane) {
    let best = null; let bestD = Infinity;
    for (const t of this._airTargets(slot)) {
      const d = Math.hypot(t.pos.x - plane.pos.x, t.pos.z - plane.pos.z);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (!best) return null;
    const bearing = Math.atan2(best.pos.x - plane.pos.x, -(best.pos.z - plane.pos.z));
    let rel = bearing - plane.heading;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    return { rel, distM: bestD };
  }

  _spawnGroundTarget() {
    if (this.groundTarget || this.redZones.length === 0) return;
    const z0 = this.redZones[0];
    const gy = this.groundY(z0.x, z0.z);
    // 場景化紅區：地面紅色半透明圓盤（玩家看得到「這塊可以打」）
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(z0.r, 40),
      new THREE.MeshBasicMaterial({ color: '#e0392b', transparent: true, opacity: 0.35, depthWrite: false }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(z0.x, gy + 0.5, z0.z);
    this.scene.add(disc);
    // 紅區中央的地面靶（打中＝爆炸計分）
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(40, 30, 40), new THREE.MeshLambertMaterial({ color: '#c0392b' }));
    mesh.position.set(z0.x, gy + 15, z0.z);
    this.scene.add(mesh);
    this.groundTarget = { mesh, disc, pos: { x: z0.x, y: gy, z: z0.z }, alive: true, respawnAt: 0 };
  }

  _clearBalloons() {
    for (const b of this.balloons) this.scene.remove(b.mesh);
    this.balloons = [];
  }

  _clear() {
    this._clearBalloons();
    this._clearEnemies();
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    if (this.groundTarget) {
      this.scene.remove(this.groundTarget.mesh); this.groundTarget.mesh.geometry.dispose();
      if (this.groundTarget.disc) { this.scene.remove(this.groundTarget.disc); this.groundTarget.disc.geometry.dispose(); }
      this.groundTarget = null;
    }
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

  /** @param {number} slot 計分卡（TaskSlot）：PvP/ai＝擊落+命中率(+剩敵機)；氣球＝剩餘氣球+分數 */
  scoreText(slot) {
    if (this.pvp) return `⚔️ 擊落 ${this.kills[slot]}　🎯 命中率 ${this.hitRate(slot)}%`;
    if (this.enemies.length) return `🛩 敵機 ${this.aliveEnemies()}　擊落 ${this.kills[slot]}　🎯 ${this.hitRate(slot)}%`;
    return `🎈 ${this.aliveBalloons()}/${this.balloonTotal}　💥 ${this.score[slot]}`;
  }

  /** @param {number} slot @param {number} now 武器卡（ModeSlot）：子模式 + 武器 + 彈藥/冷卻/補彈狀態 */
  weaponText(slot, now) {
    const spec = this.weaponSpec(slot);
    const mag = this.mags[slot][this.weaponId(slot)];
    let ammo;
    if (mag.ammo <= 0) ammo = '🔄 回機場補彈';
    else if (now < mag.readyAt) ammo = `${mag.ammo}/${mag.max} ·充填`; // 冷卻中
    else ammo = `${mag.ammo}/${mag.max}`;
    return `${SUBMODE_ICON[/** @type {keyof typeof SUBMODE_ICON} */ (this.dfMode)] ?? '🔥'} ${spec.label} ${ammo}`;
  }

  /**
   * 對空目標：PvP＝其他存活玩家（'p{slot}'）；ai＝存活敵機（'e{n}'）；否則＝存活氣球（'b{i}'）。
   * @param {number} slot 自己的 slot（PvP 要排除自己）
   * @returns {{id:string,pos:{x:number,y:number,z:number}}[]}
   */
  _airTargets(slot) {
    if (this.pvp) {
      return this.players.filter((p) => p.alive && p.slot !== slot).map((p) => ({ id: `p${p.slot}`, pos: p.pos }));
    }
    if (this.enemies.length) {
      return this.enemies.filter((e) => e.alive).map((e) => ({ id: e.id, pos: e.state.pos }));
    }
    return this.balloons.filter((b) => b.alive).map((b) => ({ id: b.id, pos: b.pos }));
  }

  /** @param {string} id @returns {{x:number,y:number,z:number}|null} */
  _targetPosOf(id) {
    if (id[0] === 'e') { const e = this.enemies.find((x) => x.alive && x.id === id); return e ? e.state.pos : null; }
    if (id[0] === 'p') { const p = this.players.find((x) => x.alive && `p${x.slot}` === id); return p ? p.pos : null; }
    const b = this.balloons.find((x) => x.id === id);
    return b && b.alive ? b.pos : null;
  }

  /** 公開：鎖定目標的世界座標（瞄準框投影用）。 @param {string|null} id */
  targetPos(id) { return id ? this._targetPosOf(id) : null; }

  /**
   * 每 slot 每幀：更新鎖定（對空＝最近目標：PvP 對手 / 氣球）。回傳 lockId（HUD 用）。
   * @param {number} slot @param {{pos:{x:number,y:number,z:number}, heading:number}} plane
   * @returns {string|null}
   */
  updateLock(slot, plane) {
    const spec = this.weaponSpec(slot);
    this.lockId[slot] = spec.kind === 'air'
      ? acquireAirLock({ pos: plane.pos, heading: plane.heading }, this._airTargets(slot), spec)
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
    this.shots[slot] += 1; // 命中率分母
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
    const missile = spec.sound === 'boom'; // 擬真飛彈＝飛彈外型；卡通＝亮球
    const mesh = missile
      ? new THREE.Mesh(this._missileGeo, voxelMaterial())
      : new THREE.Mesh(this._projGeo, this._projMat.cartoon);
    mesh.rotation.order = 'YXZ';
    mesh.position.set(proj.pos.x, proj.pos.y, proj.pos.z);
    this.scene.add(mesh);
    this.projectiles.push({ proj, owner: slot, mesh, missile, fromEnemy: false });
    return { fired: true, sound: spec.sound };
  }

  /** 推進所有敵機：AI 決策 → flight-model → 同步；對最近玩家開火。 @param {number} dt @param {number} now */
  _stepEnemies(dt, now) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      // 每機隨機強度（弱兵/王牌）：縮放難度——強者更兇、弱者多放水（HITL：強度多元）。
      const sf = Number.isFinite(e.strength) ? e.strength : 1;
      const effDiff = clamp(this.difficulty * sf, 0, 1);
      const effHcap = clamp(this.handicap + (1 - sf) * 0.45, 0, 1);
      const target = this._nearestPlayerTo(e.state.pos);
      const input = target
        ? decideInput(e.state, /** @type {any} */ ({ pos: target.pos }), { difficulty: effDiff, handicap: effHcap })
        : { r: 0, p: 0, th: 0.5, gearUp: true }; // 沒目標＝平飛
      stepPlane(e.state, input, dt, this.env, this._f16);
      e.entity.sync(e.state, input.th ?? 0.5, dt, this.env.groundY);
      // 開火：spawn 後 grace 過、對準最近玩家、在射程內、冷卻過
      if (e.spawnAt < 0) e.spawnAt = now; // 首見＝記 spawn 時間（grace 起點）
      const armed = now - e.spawnAt > ENEMY_FIRE_GRACE_MS;
      if (target && armed && canFire(e.mag, now)
          && shouldFire(e.state, /** @type {any} */ ({ pos: target.pos }), { rangeM: ENEMY_WEAPON.rangeM, coneRad: 0.16 })) {
        // 追蹤力隨「該機」難度（易/放水→近直線可閃；難→中等追蹤、急轉/翻滾仍可甩）
        const homing = Math.max(0, 0.18 + 0.5 * effDiff - 0.4 * effHcap);
        const proj = spawnProjectile({ pos: e.state.pos, heading: e.state.heading }, { ...ENEMY_WEAPON, homingRate: homing }, `p${target.slot}`);
        // 冷卻隨難度/handicap：易/放水→射更慢（敵彈不耗盡、不補彈）
        e.mag.readyAt = now + ENEMY_WEAPON.cooldownSec * 1000 * (1.6 - effDiff * 0.6 + effHcap * 1.0);
        e.mag.ammo = e.mag.max;
        const mesh = new THREE.Mesh(this._projGeo, this._projMatEnemy());
        mesh.position.set(proj.pos.x, proj.pos.y, proj.pos.z);
        this.scene.add(mesh);
        this.projectiles.push({ proj, owner: -1, mesh, missile: false, fromEnemy: true });
      }
    }
  }

  /** 敵機彈丸材質（紅，與玩家彈區隔）。 */
  _projMatEnemy() {
    if (!this._enemyMat) this._enemyMat = new THREE.MeshBasicMaterial({ color: PROJ_COLOR.enemy });
    return this._enemyMat;
  }

  /**
   * 推進一步：氣球漂移 + 彈丸前進 + 命中處理 + 整輪打完換新輪。回傳本步事件（caller 播音/計分）。
   * 事件 kind：pop=氣球啵、boom=紅區地面靶、exempt=打到地標(红線無效)、miss=對地落空、cleared=氣球整輪打完、
   * playerHit=PvP 擊中對手、enemyDown=擊落敵機、enemyHitPlayer=敵機擊中玩家、win=敵機全滅。
   * @param {number} dt @param {number} now ms
   * @returns {{kind:'pop'|'boom'|'exempt'|'miss'|'cleared'|'playerHit'|'enemyDown'|'enemyHitPlayer'|'win', owner:number, victim?:number, sound?:'cartoon'|'boom'}[]}
   */
  step(dt, now) {
    if (!this.active) return [];
    // 1. 氣球漂移（活動靶）。打掉的不個別重生——整輪打完才換新一輪（HITL：要知道射完了沒）。
    for (const b of this.balloons) {
      if (!b.alive) continue;
      b.pos = b.drift ? balloonDriftPos(b.center, now / 1000, b.drift) : b.center;
      b.mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
    }
    // 地面靶重生
    if (this.groundTarget && !this.groundTarget.alive && now >= this.groundTarget.respawnAt) {
      this.groundTarget.alive = true;
      this.groundTarget.mesh.visible = true;
    }
    // 敵機推進 + 開火
    this._stepEnemies(dt, now);

    /** @type {{kind:'pop'|'boom'|'exempt'|'miss'|'cleared'|'playerHit'|'enemyDown'|'enemyHitPlayer'|'win', owner:number, victim?:number, sound?:'cartoon'|'boom'}[]} */
    const events = [];
    const env = { targetPosOf: (/** @type {string} */ id) => this._targetPosOf(id), groundY: this.groundY };

    // 2. 彈丸前進 + 朝向 + 命中
    const survivors = [];
    for (const p of this.projectiles) {
      const res = stepProjectile(p.proj, dt, env);
      p.mesh.position.set(p.proj.pos.x, p.proj.pos.y, p.proj.pos.z);
      if (p.missile) this._orientMissile(p); // 飛彈順著速度方向
      if (res.result === 'flying') { survivors.push(p); continue; }
      if (res.result === 'hit') {
        const sound = p.proj.spec.sound;
        const tid = typeof res.targetId === 'string' ? res.targetId : '';
        if (p.fromEnemy && tid[0] === 'p') {
          // 敵機命中玩家 → 受擊事件（後果軸由 main 套用）
          events.push({ kind: 'enemyHitPlayer', owner: p.owner, victim: Number(tid.slice(1)), sound });
        } else if (tid[0] === 'e') {
          // 玩家命中敵機 → 擊落 + 計分；全滅 → win
          const e = this.enemies.find((x) => x.alive && x.id === tid);
          if (e) {
            e.alive = false; e.entity.setVisible(false);
            this.kills[p.owner] += 1; this.hits[p.owner] += 1;
            events.push({ kind: 'enemyDown', owner: p.owner, sound });
            if (this.aliveEnemies() === 0) events.push({ kind: 'win', owner: p.owner });
          }
        } else if (p.proj.spec.kind === 'air' && tid[0] === 'p') {
          // PvP：命中對手玩家 → 擊落事件（後果軸由 main 套用到受擊方）
          this.kills[p.owner] += 1; this.hits[p.owner] += 1;
          events.push({ kind: 'playerHit', owner: p.owner, victim: Number(tid.slice(1)), sound });
        } else if (p.proj.spec.kind === 'air' && res.targetId != null) {
          // 對空命中氣球 → 啵（去暴力）；不個別重生
          const b = this.balloons.find((x) => x.id === res.targetId);
          if (b && b.alive) { b.alive = false; b.mesh.visible = false; this.score[p.owner] += 1; this.hits[p.owner] += 1; events.push({ kind: 'pop', owner: p.owner, sound }); }
        } else {
          // 對地命中：红線豁免 —— 只有落在紅區內、且不在地標上才生效
          const point = { x: p.proj.pos.x, z: p.proj.pos.z };
          const ok = canHitGround(point, { redZones: this.redZones, landmarks: this.landmarks });
          const onLandmark = this.landmarks.some((z) => Math.hypot(point.x - z.x, point.z - z.z) <= z.r);
          if (ok && this.groundTarget && this.groundTarget.alive
              && Math.hypot(point.x - this.groundTarget.pos.x, point.z - this.groundTarget.pos.z) <= 80) {
            this.groundTarget.alive = false; this.groundTarget.mesh.visible = false;
            this.groundTarget.respawnAt = now + GROUND_RESPAWN_MS; this.score[p.owner] += 1; this.hits[p.owner] += 1;
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

    // 3. 整輪打完 → 換新一輪（HITL：有「打完了」的明確回饋 + 永遠有靶可打）
    if (this.balloonTotal > 0 && this.aliveBalloons() === 0) {
      this._spawnBalloons();
      events.push({ kind: 'cleared', owner: 0 });
    }
    return events;
  }

  /** 把飛彈網格旋轉到順著速度方向（機鼻 -Z）。 @param {{proj:any, mesh:THREE.Mesh}} p */
  _orientMissile(p) {
    const v = p.proj.vel;
    const horiz = Math.hypot(v.x, v.z) || 1e-6;
    const hdg = Math.atan2(v.x, -v.z);     // 與飛機同制
    const pitch = Math.atan2(v.y, horiz);
    p.mesh.rotation.set(pitch, -hdg, 0);
  }
}
