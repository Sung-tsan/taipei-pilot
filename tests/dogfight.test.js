// @ts-check
// V2 空戰整合（Dogfight 編排）：用 node 下的 THREE.Scene 直測 glue 邏輯——
// 鎖定→發射→命中氣球計分、彈藥/冷卻/補彈、換武器、對地紅線豁免。
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Dogfight, WEAPON_ORDER } from '../src/display/combat/dogfight.js';

const DT = 1 / 60;

/**
 * 把其他氣球移到射程外、只留 b0 在指定位置（去隨機，鎖定可預期）。
 * @param {import('../src/display/combat/dogfight.js').Dogfight} df
 * @param {{x:number,y:number,z:number}} pos
 */
function isolateBalloon(df, pos) {
  df.balloons.forEach((b, i) => {
    b.drift = null;
    if (i === 0) { b.center = { ...pos }; b.pos = { ...pos }; b.alive = true; }
    else { b.center = { x: 50000, y: 0, z: 50000 }; b.pos = { x: 50000, y: 0, z: 50000 }; b.alive = true; }
  });
  return df.balloons[0];
}

/**
 * 推進 df 直到出現某 kind 的事件或逾時。
 * @param {import('../src/display/combat/dogfight.js').Dogfight} df
 * @param {string} kind @param {number} startNow @param {number} [maxMs]
 * @returns {boolean}
 */
function stepUntil(df, kind, startNow, maxMs = 5000) {
  let now = startNow;
  for (let t = 0; t < maxMs; t += DT * 1000) {
    const events = df.step(DT, now);
    if (events.some((e) => e.kind === kind)) return true;
    now += DT * 1000;
  }
  return false;
}

describe('Dogfight 整合', () => {
  /** @type {THREE.Scene} */ let scene;
  /** @type {Dogfight} */ let df;
  beforeEach(() => {
    scene = new THREE.Scene();
    df = new Dogfight(scene, {
      landmarks: [{ x: 0, z: -300, r: 150 }],   // 教育地標（红線豁免）
      redZones: [{ x: 1000, z: 0, r: 300 }],     // 可命中紅區
      groundY: () => 0,
    });
    df.setActive(true);
  });

  it('setActive：spawn 氣球靶場 + 地面靶 + 三種滿彈匣', () => {
    expect(df.balloons.length).toBeGreaterThan(0);
    expect(df.groundTarget).not.toBeNull();
    for (const id of WEAPON_ORDER) expect(df.mags[0][id].ammo).toBe(df.mags[0][id].max);
  });

  it('對空：飛近氣球自動鎖定 → 發射 → 追蹤命中 → 啵 + 計分', () => {
    const plane = { pos: { x: 0, y: 200, z: 0 }, heading: 0 }; // 朝北(-Z)
    const b0 = isolateBalloon(df, { x: 0, y: 200, z: -300 });   // 正前方 300m
    const lock = df.updateLock(0, plane);
    expect(lock).toBe('b0');
    expect(df.tryFire(0, plane, 1000).fired).toBe(true);
    const popped = stepUntil(df, 'pop', 1000 + DT * 1000);
    expect(popped).toBe(true);
    expect(df.score[0]).toBe(1);
    expect(b0.alive).toBe(false);
  });

  it('彈藥：打完冷卻後耗盡 → 不能再發；回機場 reload 補滿', () => {
    const plane = { pos: { x: 0, y: 200, z: 0 }, heading: 0 };
    df.updateLock(0, plane);
    const spec = df.weaponSpec(0);
    let now = 0;
    let fired = 0;
    for (let k = 0; k < spec.magazine + 3; k++) {
      if (df.tryFire(0, plane, now).fired) fired += 1;
      now += spec.cooldownSec * 1000 + 10; // 跳過冷卻
    }
    expect(fired).toBe(spec.magazine);          // 正好打完一個彈匣
    expect(df.mags[0][df.weaponId(0)].ammo).toBe(0);
    df.reloadAll(0);
    expect(df.mags[0][df.weaponId(0)].ammo).toBe(spec.magazine);
  });

  it('換武器：循環 cartoon → aa → ag → cartoon', () => {
    expect(df.weaponId(0)).toBe('cartoon');
    df.cycleWeapon(0); expect(df.weaponId(0)).toBe('aa');
    df.cycleWeapon(0); expect(df.weaponId(0)).toBe('ag');
    df.cycleWeapon(0); expect(df.weaponId(0)).toBe('cartoon');
  });

  it('对地红線豁免：瞄準地標 → 命中無效(exempt)、不計分', () => {
    df.cycleWeapon(0); df.cycleWeapon(0); // → ag（對地）
    expect(df.weaponId(0)).toBe('ag');
    const plane = { pos: { x: 0, y: 100, z: 0 }, heading: 0 }; // 機頭朝北，前方地面點落在地標
    df.updateLock(0, plane);
    expect(df.tryFire(0, plane, 0).fired).toBe(true);
    const exempt = stepUntil(df, 'exempt', DT * 1000);
    expect(exempt).toBe(true);
    expect(df.score[0]).toBe(0); // 打到地標＝無效
  });

  it('对地紅區：瞄準紅區地面靶 → 命中爆炸(boom) + 計分', () => {
    df.cycleWeapon(0); df.cycleWeapon(0); // → ag
    const plane = { pos: { x: 780, y: 100, z: 0 }, heading: Math.PI / 2 }; // 朝東(+X)，前方落在紅區 (1000,0)
    expect(df.tryFire(0, plane, 0).fired).toBe(true);
    const boom = stepUntil(df, 'boom', DT * 1000);
    expect(boom).toBe(true);
    expect(df.score[0]).toBe(1);
  });

  it('氣球有限計數：打完整輪 → cleared 事件 + 換新一輪（HITL：知道射完了沒）', () => {
    expect(df.balloonTotal).toBe(df.balloons.length);
    // 只留 b0 存活，其餘標死 → 打掉 b0 即整輪清空
    df.balloons.forEach((b, i) => { if (i !== 0) b.alive = false; });
    const plane = { pos: { x: 0, y: 200, z: 0 }, heading: 0 };
    isolateBalloon(df, { x: 0, y: 200, z: -300 }); // b0 正前方（會把其他設遠但 alive）
    df.balloons.forEach((b, i) => { if (i !== 0) b.alive = false; }); // 再次只留 b0
    df.updateLock(0, plane);
    df.tryFire(0, plane, 1000);
    let cleared = false;
    let now = 1000 + DT * 1000;
    for (let t = 0; t < 4000; t += DT * 1000) {
      const evs = df.step(DT, now);
      if (evs.some((e) => e.kind === 'cleared')) { cleared = true; break; }
      now += DT * 1000;
    }
    expect(cleared).toBe(true);
    expect(df.aliveBalloons()).toBe(df.balloonTotal); // 換了新一輪
  });

  it('擬真飛彈（aa/ag）發射 → 彈丸是飛彈外型（missile=true）；卡通＝非飛彈', () => {
    const plane = { pos: { x: 0, y: 200, z: 0 }, heading: 0 };
    df.tryFire(0, plane, 0); // cartoon
    expect(df.projectiles.at(-1)?.missile).toBe(false);
    df.cycleWeapon(0); // → aa（boom）
    df.tryFire(0, plane, 2000);
    expect(df.projectiles.at(-1)?.missile).toBe(true);
  });

  it('nearestBalloon：回最近存活氣球的相對方位 + 距離（指引箭頭用）', () => {
    const plane = { pos: { x: 0, y: 200, z: 0 }, heading: 0 };
    isolateBalloon(df, { x: 0, y: 200, z: -300 });
    df.balloons.forEach((b, i) => { if (i !== 0) b.alive = false; });
    const g = df.nearestBalloon(plane);
    expect(g).not.toBeNull();
    expect(Math.abs(/** @type {any} */ (g).rel)).toBeLessThan(0.01); // 正前方 → rel≈0
    expect(/** @type {any} */ (g).distM).toBeCloseTo(300, 0);
  });

  it('PvP：setMode(pvp) 清氣球、鎖定對手 → 擊中 → playerHit + 擊落/命中計分', () => {
    df.setMode('pvp');
    expect(df.pvp).toBe(true);
    expect(df.balloonTotal).toBe(0); // PvP 清氣球（對手就是靶）
    const p0 = { x: 0, y: 200, z: 0 }, p1 = { x: 0, y: 200, z: -300 };
    df.setPlayers([{ slot: 0, pos: p0, alive: true }, { slot: 1, pos: p1, alive: true }]);
    expect(df.updateLock(0, { pos: p0, heading: 0 })).toBe('p1'); // 鎖到對手
    df.tryFire(0, { pos: p0, heading: 0 }, 1000);
    /** @type {any} */ let hit = null;
    let now = 1000 + DT * 1000;
    for (let t = 0; t < 4000; t += DT * 1000) {
      const h = df.step(DT, now).find((e) => e.kind === 'playerHit');
      if (h) { hit = h; break; }
      now += DT * 1000;
    }
    expect(hit).not.toBeNull();
    expect(hit.victim).toBe(1);
    expect(df.kills[0]).toBe(1);
    expect(df.hits[0]).toBe(1);
  });

  it('非 PvP：玩家不被鎖定（維持幽靈穿透——只鎖氣球）', () => {
    df.setPlayers([{ slot: 1, pos: { x: 0, y: 200, z: -100 }, alive: true }]); // 對手更近
    isolateBalloon(df, { x: 0, y: 200, z: -300 });
    df.balloons.forEach((b, i) => { if (i !== 0) b.alive = false; });
    expect(df.updateLock(0, { pos: { x: 0, y: 200, z: 0 }, heading: 0 })).toBe('b0'); // 鎖氣球、不鎖玩家
  });

  it('命中率 hitRate = 命中/發射（不除零）', () => {
    df.shots[0] = 4; df.hits[0] = 1;
    expect(df.hitRate(0)).toBe(25);
    df.shots[0] = 0; df.hits[0] = 0;
    expect(df.hitRate(0)).toBe(0);
  });

  it('ai_1v1 / ai_2v2：spawn 對應架數敵機、清氣球', () => {
    df.setMode('ai_1v1');
    expect(df.enemies.length).toBe(1);
    expect(df.balloonTotal).toBe(0);
    df.setMode('ai_2v2');
    expect(df.enemies.length).toBe(2);
  });

  it('敵機 1v1：玩家持續射擊 → 擊落敵機（enemyDown + win + 計分）', () => {
    df.setMode('ai_1v1');
    df.setDifficulty(0, 1); // 最易：敵機最鈍
    const plane = { pos: { x: 0, y: 200, z: 0 }, heading: 0 };
    df.enemies[0].state.pos = { x: 0, y: 200, z: -300 }; // 正前方
    df.setPlayers([{ slot: 0, pos: plane.pos, alive: true }]);
    expect(df.updateLock(0, plane)).toBe('e0');
    let down = false, win = false, now = 1000;
    for (let t = 0; t < 6000; t += DT * 1000) {
      df.setPlayers([{ slot: 0, pos: plane.pos, alive: true }]);
      df.updateLock(0, plane); df.tryFire(0, plane, now);
      const evs = df.step(DT, now);
      if (evs.some((e) => e.kind === 'enemyDown')) down = true;
      if (evs.some((e) => e.kind === 'win')) win = true;
      if (down && win) break;
      now += DT * 1000;
    }
    expect(down).toBe(true);
    expect(win).toBe(true);
    expect(df.kills[0]).toBe(1);
    expect(df.aliveEnemies()).toBe(0);
  });

  it('敵機開火 → enemyHitPlayer（首發 grace 後、命中後果由 main 套用）', () => {
    df.setMode('ai_1v1');
    df.setDifficulty(1, 0); // 最強：積極開火、追蹤力較高
    const ppos = { x: 0, y: 200, z: 0 };
    df.enemies[0].state.pos = { x: 0, y: 200, z: 450 }; // 玩家後方、朝北對著玩家、在射程內
    df.enemies[0].state.heading = 0;
    let hit = false, now = 0;
    for (let t = 0; t < 9000; t += DT * 1000) { // > 3s grace + 彈道飛行
      df.setPlayers([{ slot: 0, pos: ppos, alive: true }]);
      const evs = df.step(DT, now);
      if (evs.some((e) => e.kind === 'enemyHitPlayer' && e.victim === 0)) { hit = true; break; }
      now += DT * 1000;
    }
    expect(hit).toBe(true);
  });

  it('首發 grace：敵機 spawn 後短時間內不開火（HITL：來得及反應）', () => {
    df.setMode('ai_1v1');
    df.setDifficulty(1, 0);
    const ppos = { x: 0, y: 200, z: 0 };
    df.enemies[0].state.pos = { x: 0, y: 200, z: 300 };
    df.enemies[0].state.heading = 0;
    let firedDuringGrace = false, now = 0;
    for (let t = 0; t < 2500; t += DT * 1000) { // grace=3000ms 內
      df.setPlayers([{ slot: 0, pos: ppos, alive: true }]);
      df.step(DT, now);
      if (df.projectiles.some((p) => p.fromEnemy)) { firedDuringGrace = true; break; }
      now += DT * 1000;
    }
    expect(firedDuringGrace).toBe(false);
  });

  it('spawnWave：全滅後重生新一波', () => {
    df.setMode('ai_1v1');
    df.enemies[0].alive = false;
    expect(df.aliveEnemies()).toBe(0);
    df.spawnWave();
    expect(df.aliveEnemies()).toBe(1);
  });

  it('setActive(false)：清空靶場與彈丸', () => {
    df.setActive(false);
    expect(df.balloons.length).toBe(0);
    expect(df.projectiles.length).toBe(0);
    expect(df.groundTarget).toBeNull();
  });
});
