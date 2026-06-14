// @ts-check
// display 主流程：3D 場景 + 連線 + 固定步長遊戲迴圈 + 分屏渲染。
import * as THREE from 'three';
import { DisplayNet } from './net/client.js';
import { renderQr } from './ui/qr-panel.js';
import { KeyboardInput } from './input/keyboard.js';
import { makeWorld } from './scene/world.js';
import { spawnPose } from './scene/airport.js';
import { makeTaipei } from './scene/taipei.js';
import { makePlane, stepPlane } from './flight/flight-model.js';
import { collidePlane } from './flight/collision.js';
import { PlaneEntity } from './planes/plane-entity.js';
import { planeSpec, flightParams, PLANE_IDS, DEFAULT_PLANE } from './planes/plane-specs.js';
import { Dogfight } from './combat/dogfight.js';
import { difficultyLevel, adaptiveHandicap } from './combat/enemy-ai.js';
import { planesColliding } from './flight/plane-collision.js';
import { Minimap } from './ui/minimap.js';
import { ChaseCam } from './render/chase-cam.js';
import { LandmarkLabels } from './render/labels.js';
import { ViewportRenderer } from './render/viewports.js';
import { Hud } from './ui/hud.js';
import { GameAudio } from './audio.js';
import { makeConsequence, registerMishap } from './flight/consequence.js';
import { judgeForcedLanding, roadClearLength, roadLandable, TERRAIN } from './flight/forced-landing.js';
import { ROAD_WIDTH } from './scene/city-gen.js';
import { RIVERS } from './scene/rivers.js';
import { MissionRunner } from './missions/mission-runner.js';
import { airspaceTaipei } from './missions/airspace-taipei.js';
import { loadCollection, saveCollection } from './missions/collection-store.js';
import { ringsAlongRiver, MISSION_TYPES } from './missions/missions.js';
import { RACE_TYPES, makeRace, updateRacer, ranking, allFinished } from './missions/race.js';
import { RaceMarkers } from './missions/race-markers.js';
import { loadSettings, saveSettings } from './ui/settings-store.js';
import { MAX_SLOTS } from '../../shared/constants.js';
import { BTN } from '../../shared/protocol.js';
import { wrapAngle } from '../lib/math.js';

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

// —— 場景 ——
const scene = makeWorld();
const taipei = makeTaipei();
scene.add(taipei.group);
const labels = new LandmarkLabels(taipei.group, taipei.landmarks);
const env = taipei.env;

// —— 實體與相機（每 slot 一組，常駐） ——
const vr = new ViewportRenderer(/** @type {HTMLCanvasElement} */ ($('gameCanvas')));
const planes = Array.from({ length: MAX_SLOTS }, (_, i) => new PlaneEntity(scene, i));
const cams = Array.from({ length: MAX_SLOTS }, () => new ChaseCam());
const states = Array.from({ length: MAX_SLOTS }, (_, i) => makePlane(spawnPose(i)));

// —— 後果軸（安全模式）：每架一份狀態，per session 從 localStorage 載 ——
const settings = loadSettings();
const conseq = Array.from({ length: MAX_SLOTS }, () => makeConsequence(settings.mode, settings.heartsMax));
/** @type {({terrain:string, result:string}|null)[]} 最近一次迫降結果（e2e/除錯用） */
const lastForcedLanding = Array.from({ length: MAX_SLOTS }, () => null);

// —— 任務系統（v1.1-4）：解析器 + runner + 收集 + 玩法模式 ——
const lmById = new Map(taipei.landmarks.map((l) => [l.id, l]));
const lmFact = new Map(airspaceTaipei.landmarks.map((l) => [l.id, l.fact.text]));
const lmSize = new Map(airspaceTaipei.landmarks.map((l) => [l.id, l.size]));
const landmarkIds = airspaceTaipei.landmarks.map((l) => l.id);
const riverByName = new Map(RIVERS.map((r) => [r.name, r]));
// 任務池：landmark_find 附 pos/size 供適應性挑選（先近後遠先大後小）
const missionPool = airspaceTaipei.missions.map((m) => {
  if (m.type !== MISSION_TYPES.LANDMARK_FIND) return m;
  const lm = lmById.get(m.targetId);
  return { ...m, pos: lm ? { x: lm.x, z: lm.z } : undefined, size: lmSize.get(m.targetId) ?? 1 };
});
const collection = loadCollection();
const runner = new MissionRunner(MAX_SLOTS, {
  pool: missionPool,
  landmarkIds,
  landmarkPos: (id) => { const lm = lmById.get(id); return lm ? { x: lm.x, z: lm.z, clear: lm.clear } : null; },
  landmarkFact: (id) => lmFact.get(id) ?? '',
  riverRings: (name, count) => { const r = riverByName.get(name); return r ? ringsAlongRiver(r.points, count) : []; },
  collection,
});
let playMode = 'mission'; // free / mission / dogfight / race（v2.0-1 起四模式，選單見下）
let dogfightMode = 'balloons'; // 空戰子模式 balloons/pvp/ai_1v1/ai_2v2（v2.0-1 佔位，內容後階段填）
let planeId = DEFAULT_PLANE;    // 目前機種（v2.0-1：T-34C / F-16 可選；v1.2 接時數+里程碑解鎖）
let missionTaught = false; // 任務模式首次教學瞬間（一次性）

// —— 空戰（v2.0-2）：氣球靶 + 武器 + 對地紅區 ——
// 地標豁免區（红線：空對地命中 7 教育地標無效）；demo 紅區放開闊處（場景化紅區由 v2.0-4 進 airspace）。
const landmarkZones = taipei.landmarks.map((l) => ({ x: l.x, z: l.z, r: (/** @type {any} */ (l).clear ?? 200) + 80 }));
const DEMO_REDZONE = { x: 2600, z: 2600, r: 450 };
const dogfight = new Dogfight(scene, { landmarks: landmarkZones, redZones: [DEMO_REDZONE], groundY: env.groundY, env });
const prevSwitchBit = states.map(() => false); // 換武器鍵上升緣偵測（per slot）
const pvpInvuln = states.map(() => 0);  // 被擊落後的無敵/暫退到期時間（per slot；PvP + 敵機共用）
const pvpSmoke = states.map(() => false); // 冒煙中（無敵期過了要清）
const prevLock = states.map(() => /** @type {string|null} */ (null)); // 鎖定上升緣（剛鎖到才響提示音）
let dogfightTaught = false; // 空戰首次教學一次性
let aiRound = 0;        // 敵機波次（難度曲線：越後越難）
/** @type {boolean[]} 近期對局結果（true=玩家清掉一波、false=玩家被擊落）→ adaptive 放水 */
const aiResults = [];
const PLANE_COLLIDE_R = 18; // 兩機相撞半徑（m）：溫和/真實才處罰（HITL）
let planeCollideCooldown = 0; // 相撞後果冷卻（避免每幀重複觸發）

// —— 競速（v2.1-1）：兩型（穿圈航線 / 地標衝刺）+ 起點/終點視覺（HITL #4）——
let raceType = 'rings';          // rings（穿圈航線）/ landmark（地標衝刺）
/** @type {ReturnType<typeof makeRace>|null} */ let race = null;
const raceMarkers = new RaceMarkers(scene);
let raceCelebrated = false;      // 全員完賽一次性 banner
/** 競速賽道目標座標（給導引箭頭）：rings→course.rings；landmark→target */
/** @type {{x:number,z:number}[]} */ let raceWaypoints = [];
const RACE_RING_Y = 250, RACE_RING_R = 95;

/** 依 raceType 產生賽道（race.js course + 視覺 waypoints + 起點）。 @param {string} type */
function buildRaceCourse(type) {
  const start = { x: 0, z: 0, y: 80 };
  if (type === 'landmark') {
    const lm = lmById.get('taipei101') ?? taipei.landmarks[0]; // 地標衝刺：飛到 101（或第一個地標）
    const target = { x: lm.x, z: lm.z, r: 140 };
    raceWaypoints = [{ x: lm.x, z: lm.z }];
    return { race: makeRace(RACE_TYPES.LANDMARK, [0, 1], { target }), waypoints: [{ x: lm.x, z: lm.z, y: RACE_RING_Y, r: 140 }], start };
  }
  // 穿圈航線：沿一條河佈 4 圈（風景航線）
  const river = riverByName.get('基隆河') ?? RIVERS[0];
  const pts = ringsAlongRiver(river.points, 4).map((p) => ({ x: p.x, z: p.z, r: RACE_RING_R }));
  raceWaypoints = pts.map((p) => ({ x: p.x, z: p.z }));
  return {
    race: makeRace(RACE_TYPES.RING_ROUTE, [0, 1], { rings: pts }),
    waypoints: pts.map((p) => ({ x: p.x, z: p.z, y: RACE_RING_Y, r: p.r })),
    start,
  };
}

/** 進/離競速：建/清賽道 + race 狀態。 @param {boolean} on */
function setRaceActive(on) {
  if (on) {
    const built = buildRaceCourse(raceType);
    race = built.race;
    raceMarkers.build(built.waypoints, built.start);
    raceCelebrated = false;
  } else {
    race = null;
    raceMarkers.clear();
  }
}

// —— 角落小地圖（任何模式顯示友/敵方位距離；HITL）——
const minimap = new Minimap(/** @type {HTMLCanvasElement} */ ($('minimap')), { size: 160 });
const reticleEls = [0, 1].map((i) => /** @type {HTMLElement|null} */ ($(`hud-${i}`)?.querySelector('.reticle')));
const _reticleVec = new THREE.Vector3();
/** 最後一次有效輸入（render 用油門轉螺旋槳） */
const lastInputs = /** @type {import('./flight/flight-model.js').Input[]} */ (
  states.map(() => ({ r: 0, p: 0, th: 0, gearUp: false }))
);

// —— 連線與鍵盤 ——
const net = new DisplayNet();
const kb = new KeyboardInput();
const hud = new Hud(); // 6 槽位 contextual HUD（每視口一層）
renderQr(/** @type {HTMLCanvasElement} */ ($('qr')), $('qrUrl'));
renderQr(/** @type {HTMLCanvasElement} */ ($('qrMini')), document.createElement('span'));

const FAKE2 = new URLSearchParams(location.search).has('fake2'); // 雙視口壓測：藍機自動盤旋

/** @param {number} slot */
function slotDriver(slot) {
  if (net.slotStatus[slot] !== 'empty') return net.slotStatus[slot]; // 'active'|'lost'
  if (slot === 0 && kb.active) return 'keyboard';
  if (slot === 1 && FAKE2) return 'fake';
  return null;
}

/** slot 從無人 → 有人時把飛機放回跑道 */
const wasDriven = states.map(() => false);
function refreshDrivers() {
  for (let i = 0; i < MAX_SLOTS; i++) {
    const driver0 = slotDriver(i);
    const driven = driver0 !== null;
    if (driven && !wasDriven[i]) {
      Object.assign(states[i], makePlane(spawnPose(i)));
      conseq[i] = makeConsequence(settings.mode, settings.heartsMax); // 新上線＝照當前設定重置後果狀態
      planes[i].setDamaged(false);
      if (playMode === 'mission') {
        runner.start(i, { x: states[i].pos.x, z: states[i].pos.z });
        if (!missionTaught) { toast(i, '✈️ 跟著任務卡的箭頭飛，找到地標！'); missionTaught = true; }
      }
      if (driver0 === 'fake') { // 壓測用：直接丟到市區上空盤旋
        states[i].mode = 'flying';
        states[i].pos = { x: 800, y: 280, z: 3000 };
        states[i].speed = 45;
      }
      planes[i].setVisible(true);
      net.sendMode(playMode); // 新上線的遙控器拿到目前模式 → 換對的 context 鍵
    }
    if (!driven && wasDriven[i]) planes[i].setVisible(false);
    wasDriven[i] = driven;
    hud.setActive(i, driven);
    if (driven) hud.applyMode(i, playMode); // free / mission（v1.1-4）
    // 斷線盤旋（只在空中）；回來就交還操控
    const driver = slotDriver(i);
    const orbiting = (driver === 'lost' || driver === 'fake') && states[i].mode === 'flying';
    states[i].autopilot = orbiting ? 'orbit' : null;
    $(`lost${i}`).style.display = driver === 'lost' ? 'block' : 'none';
  }
  layout();
}

function layout() {
  const anyDriven = wasDriven.some(Boolean);
  const hasSpace = net.slotStatus.some((s) => s === 'empty');
  $('joinPanel').style.display = anyDriven ? 'none' : 'flex';
  $('miniQr').classList.toggle('show', anyDriven && hasSpace);
  $('chip0').classList.toggle('active', net.slotStatus[0] !== 'empty');
  $('chip1').classList.toggle('active', net.slotStatus[1] !== 'empty');
  $('serverStatus').textContent = net.replaced
    ? '⚠️ 遊戲已在另一個視窗開啟，這個視窗已停用'
    : net.connected ? '' : '🔄 連線到 server 中…';
  if (net.replaced) $('joinPanel').style.display = 'flex';
}

net.onState = refreshDrivers;
net.onSlotChange = refreshDrivers;
net.connect();
refreshDrivers();

// —— 音效（瀏覽器規定：第一次 gesture 才出聲） ——
const audio = new GameAudio();
function enableAudio() {
  audio.ensure();
  $('soundHint').style.display = audio.enabled ? 'none' : 'block';
}
window.addEventListener('pointerdown', enableAudio);
window.addEventListener('keydown', enableAudio);
$('soundHint').style.display = 'block';

// —— 設定面板（後果軸三檔 + ❤️ 上限）——
const settingsEl = $('settings');
function applySettings() {
  for (let i = 0; i < MAX_SLOTS; i++) conseq[i] = makeConsequence(settings.mode, settings.heartsMax);
  planes.forEach((p) => p.setDamaged(false));
}
function renderSettingsUI() {
  for (const b of document.querySelectorAll('#modeRow .set-opt')) {
    b.classList.toggle('active', b.getAttribute('data-mode') === settings.mode);
  }
  const limitVal = settings.heartsMax === Infinity ? 'inf' : String(settings.heartsMax);
  for (const b of document.querySelectorAll('#limitRow .set-opt')) {
    b.classList.toggle('active', b.getAttribute('data-limit') === limitVal);
  }
  $('limitSection').classList.toggle('disabled', settings.mode !== 'gentle');
}
$('settingsBtn').addEventListener('click', () => { renderSettingsUI(); settingsEl.classList.remove('hidden'); });
$('settingsClose').addEventListener('click', () => settingsEl.classList.add('hidden'));
for (const b of document.querySelectorAll('#modeRow .set-opt')) {
  b.addEventListener('click', () => {
    const m = b.getAttribute('data-mode');
    if (m === 'safe' || m === 'gentle' || m === 'real') {
      settings.mode = m;
      saveSettings(localStorage, settings); applySettings(); renderSettingsUI();
    }
  });
}
for (const b of document.querySelectorAll('#limitRow .set-opt')) {
  b.addEventListener('click', () => {
    const v = b.getAttribute('data-limit');
    settings.heartsMax = v === 'inf' ? Infinity : Number(v);
    saveSettings(localStorage, settings); applySettings(); renderSettingsUI();
  });
}
renderSettingsUI();

// —— 玩法選單（v2.0-1）：玩法模式 + 空戰子模式 + 機種 ——
// 模式框架不重建——選單只切 playMode/dogfightMode/planeId 三個 seam；空戰/競速的武器/靶/賽道
// 內容由 v2.0-2~5 / v2.1-1 填。HUD 槽位契約見 hud-slots.js（dogfight/race 已加 eligible）。
const PM_LABELS = { free: '✈️ 自由飛', mission: '🎯 任務', dogfight: '🔥 空戰', race: '🏁 競速' };
const playModeBtn = $('playModeBtn');
const modeMenuEl = $('modeMenu');

function renderModeBtn() { playModeBtn.textContent = PM_LABELS[/** @type {keyof typeof PM_LABELS} */ (playMode)] ?? '🎮 玩法'; }
function renderModeMenuUI() {
  for (const b of document.querySelectorAll('#pmRow .set-opt')) b.classList.toggle('active', b.getAttribute('data-pm') === playMode);
  for (const b of document.querySelectorAll('#dmRow .set-opt')) b.classList.toggle('active', b.getAttribute('data-dm') === dogfightMode);
  for (const b of document.querySelectorAll('#raceRow .set-opt')) b.classList.toggle('active', b.getAttribute('data-race') === raceType);
  for (const b of document.querySelectorAll('#planeRow .set-opt')) b.classList.toggle('active', b.getAttribute('data-plane') === planeId);
  $('dogfightSection').classList.toggle('disabled', playMode !== 'dogfight'); // 子模式僅空戰可選
  $('raceSection').classList.toggle('disabled', playMode !== 'race'); // 賽道型僅競速可選
}

/** 套用玩法模式到所有在線 slot（切 HUD 契約 + 任務啟停 + 空戰靶場 + 廣播給 remote） @param {string} mode */
function applyPlayMode(mode) {
  playMode = mode;
  renderModeBtn();
  if (playMode === 'dogfight') { dogfight.setMode(dogfightMode); resetAiProgress(); } // 設子模式旗標（balloons/pvp/ai）
  dogfight.setActive(playMode === 'dogfight'); // 進/離空戰：依子模式 spawn 氣球/敵機或清場打玩家
  setRaceActive(playMode === 'race');           // 進/離競速：建/清賽道（起點+航圈+終點）
  net.sendMode(playMode);                       // 廣播給遙控器 → 換 context 鍵（發射/換武器）
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (!wasDriven[i]) continue;
    hud.applyMode(i, playMode);
    if (playMode === 'mission') runner.start(i, { x: states[i].pos.x, z: states[i].pos.z });
    else hud.setTask(i, '');
    if (playMode === 'dogfight') {
      toast(i, dogfightTaught ? '🔥 空戰開始！' : '🎯 飛近目標→準星變紅鎖定→按發射！'); // 首次教學一次性
    } else if (playMode === 'race') toast(i, raceType === 'landmark' ? '🏁 衝到綠圈（101）最快者贏！' : '🏁 依序穿過金圈、最後綠圈＝終點！');
  }
  if (playMode === 'dogfight') dogfightTaught = true; // 之後只報「空戰開始」
}

/** 換機種：重建所有 plane voxel（保留 slot 色/收放狀態）。HUD 機種名每 frame 自動更新。 @param {string} id */
function setPlane(id) {
  planeId = PLANE_IDS.includes(/** @type {any} */ (id)) ? id : DEFAULT_PLANE;
  planes.forEach((p) => p.setModel(planeSpec(planeId).model));
}

playModeBtn.addEventListener('click', () => { renderModeMenuUI(); modeMenuEl.classList.remove('hidden'); });
$('modeMenuClose').addEventListener('click', () => modeMenuEl.classList.add('hidden'));
for (const b of document.querySelectorAll('#pmRow .set-opt')) {
  b.addEventListener('click', () => { const m = b.getAttribute('data-pm'); if (m) { applyPlayMode(m); renderModeMenuUI(); } });
}
for (const b of document.querySelectorAll('#dmRow .set-opt')) {
  b.addEventListener('click', () => {
    const m = b.getAttribute('data-dm');
    if (!m) return;
    dogfightMode = m;
    if (playMode === 'dogfight') { dogfight.setMode(dogfightMode); resetAiProgress(); } // 即時切 balloons/pvp/ai（清/spawn 目標）
    renderModeMenuUI();
  });
}
for (const b of document.querySelectorAll('#raceRow .set-opt')) {
  b.addEventListener('click', () => {
    const r = b.getAttribute('data-race');
    if (!r) return;
    raceType = r;
    if (playMode === 'race') setRaceActive(true); // 即時換賽道型（重建賽道+race）
    renderModeMenuUI();
  });
}
for (const b of document.querySelectorAll('#planeRow .set-opt')) {
  b.addEventListener('click', () => { const p = b.getAttribute('data-plane'); if (p) { setPlane(p); renderModeMenuUI(); } });
}
renderModeBtn();

// —— 收集簿（點亮地標 + 完成任務；雙人共享）——
const collectionEl = $('collection');
function renderCollection() {
  $('collectionList').innerHTML = airspaceTaipei.landmarks.map((l) => {
    const lit = collection.lit.has(l.id);
    return `<li class="${lit ? 'lit' : ''}">${lit ? '⭐' : '☆'} ${l.name}${lit ? `<small>${l.fact.text}</small>` : ''}</li>`;
  }).join('');
  $('collectionCount').textContent = `點亮 ${collection.lit.size}/${landmarkIds.length}　任務完成 ${collection.missionsDone.size}`;
  $('celebrateReplay').style.display = collection.celebrated ? 'inline-block' : 'none';
}
$('collectionBtn').addEventListener('click', () => { renderCollection(); collectionEl.classList.remove('hidden'); });
$('collectionClose').addEventListener('click', () => collectionEl.classList.add('hidden'));

// —— 台北飛透透大慶祝（一次性 gate；收集簿可重看）——
const celebrationEl = $('celebration');
function triggerCelebration() { celebrationEl.classList.remove('hidden'); audio.fireworks(); }
$('celebrationClose').addEventListener('click', () => celebrationEl.classList.add('hidden'));
$('celebrateReplay').addEventListener('click', () => { collectionEl.classList.add('hidden'); triggerCelebration(); });

/** @param {number} slot @param {string} text */
function toast(slot, text) {
  hud.toast(slot, text); // CenterSlot 瞬時 overlay
}

// —— 遊戲迴圈：固定步長 60Hz 模擬 + rAF 渲染 ——
const DT = 1 / 60;
let last = performance.now();
let acc = 0;
const fxCooldown = [0, 0];
const debugEl = $('debug');
const debugOn = new URLSearchParams(location.search).has('debug');
if (debugOn) debugEl.style.display = 'block';
let fpsCount = 0, fpsTime = 0, fps = 0;

/** @param {number} slot @returns {import('./flight/flight-model.js').Input} */
function inputFor(slot) {
  const driver = slotDriver(slot);
  if (driver === 'keyboard') return kb.read(DT);
  if (driver === 'active') {
    const live = net.liveInput(slot);
    if (live) return {
      r: live.r, p: live.p, th: live.th, gearUp: !!(live.b & BTN.GEAR_UP),
      rudder: live.rudder ?? 0, flaps: live.flaps ?? 0, trim: live.trim ?? 0, // 複雜版（缺＝中立）
      fire: !!(live.b & BTN.FIRE), weaponSwitch: !!(live.b & BTN.WEAPON_SWITCH), // 空戰鍵
    };
  }
  const lastInput = lastInputs[slot];
  return { r: 0, p: 0, th: lastInput.th, gearUp: lastInput.gearUp }; // lost：交給 autopilot
}

/** 機況回報給遙控器：gear/mode 變化即時；儀表（spd/alt/hdg）以 ~6Hz 刷新（複雜版用，簡單版忽略） */
const lastPState = states.map(() => ({ gear: true, mode: 'parked', at: 0 }));
/** @param {number} now */
function reportPState(now) {
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (net.slotStatus[i] !== 'active') continue;
    const s = states[i];
    const changed = s.gearDown !== lastPState[i].gear || s.mode !== lastPState[i].mode;
    if (changed || now - lastPState[i].at > 160) {
      lastPState[i] = { gear: s.gearDown, mode: s.mode, at: now };
      const spd = Math.round(s.speed * 3.6); // km/h（與 HUD 一致）
      const alt = Math.round(s.pos.y);        // m
      const hdg = Math.round((((s.heading * 180) / Math.PI) % 360 + 360) % 360); // 0..359
      net.sendPState(i, s.gearDown, s.mode, spd, alt, hdg);
    }
  }
}

/** 把飛機放回跑道（gentle 歸零 / real 墜毀） @param {number} i */
function respawnAtRunway(i) {
  Object.assign(states[i], makePlane(spawnPose(i)));
  planes[i].setDamaged(false);
}
/** 撞擊/失誤的後果軸分支 @param {number} i */
function handleMishap(i) {
  const res = registerMishap(conseq[i]);
  switch (res.outcome) {
    case 'heart_loss': toast(i, `碰！剩 ${conseq[i].hearts} ❤️`); audio.heartLoss(); break;
    case 'reset': toast(i, '沒命了～回機場休息 🛬'); audio.heartLoss(); break;
    case 'smoke': toast(i, '⚠️ 冒煙了！快找地方降落'); planes[i].setDamaged(true); break;
    case 'destroy': toast(i, '墜毀！回跑道 💥'); audio.explode(); break;
    default: toast(i, '碰！小心開 🙈'); break; // 'bounce'（safe）
  }
  if (res.reset) respawnAtRunway(i);
}
/** StatusSlot 顯示文字 @param {import('./flight/consequence.js').Conseq} c */
function statusHtml(c) {
  if (c.mode === 'gentle') {
    if (!Number.isFinite(c.heartsMax)) return '❤️∞';
    return '❤️'.repeat(c.hearts) + '🤍'.repeat(Math.max(0, c.heartsMax - c.hearts));
  }
  if (c.mode === 'real') return c.damage === 'smoking' ? '🔥真實 ⚠️冒煙' : '🔥真實';
  return '🛡️安全';
}

/** 真實模式機場外迫降：地形 + 品質判定 → 成功/受損(冒煙)/墜毀 @param {number} i @param {number} now */
function handleForcedLanding(i, now) {
  const s = states[i];
  fxCooldown[i] = now + 1500;
  const terrain = taipei.terrainAt(s.pos.x, s.pos.z);
  let roadOk = false;
  if (terrain === TERRAIN.ROAD) { // 找所屬車道的最長直段（兩軸取長者）
    const sample = (/** @type {number} */ x, /** @type {number} */ z) => taipei.terrainAt(x, z);
    const len = Math.max(
      roadClearLength(sample, s.pos.x, s.pos.z, 'x'),
      roadClearLength(sample, s.pos.x, s.pos.z, 'z'),
    );
    roadOk = roadLandable(ROAD_WIDTH, len, planeSpec(planeId).dims); // 機型迫降諸元（翼展/最短直段）
  }
  const result = judgeForcedLanding({ terrain, speed: s.speed, sinkRate: s.lastSink, bank: s.bank, roadOk });
  net.sendFx(i, 'bump'); // 遙控器 haptic
  if (result === 'destroyed') {
    toast(i, '迫降失敗，墜毀！💥');
    audio.explode();
    conseq[i] = makeConsequence(settings.mode, settings.heartsMax);
    respawnAtRunway(i);
  } else if (result === 'smoking') {
    toast(i, '迫降勉強成功…冒煙了 😬');
    audio.forcedLandingSound(terrain);
    conseq[i].damage = 'smoking';
    planes[i].setDamaged(true);
  } else {
    toast(i, terrain === TERRAIN.WATER ? '水上迫降成功！💦'
      : terrain === TERRAIN.ROAD ? '馬路迫降成功！🛬' : '迫降成功！👏');
    audio.forcedLandingSound(terrain);
    planes[i].setDamaged(false);
    onForcedLandingSuccess(i, terrain);
  }
  lastForcedLanding[i] = { terrain, result };
}

/** v1.1-2 P4 事件 hook：迫降成功 → 任務「起降練習」達成（v1.1-4 接） @param {number} i @param {string} terrain */
function onForcedLandingSuccess(i, terrain) {
  if (playMode === 'mission') {
    handleRunnerEvent(i, runner.notify(i, 'forced_landing_success', { x: states[i].pos.x, z: states[i].pos.z }));
  }
}

/** 任務達成事件 → 揭曉(fact toast) + 存收集 + 觸發大慶祝 @param {number} i @param {any} ev */
function handleRunnerEvent(i, ev) {
  if (!ev) return;
  hud.toast(i, `🎉 ${ev.fact}`); // 達成揭曉 + fact（已定稿）
  audio.missionSuccess();
  saveCollection(localStorage, collection);
  if (ev.celebrate) triggerCelebration();
}

/** 目標座標（地標 / 下一個圈；高度/起降無方向） @param {number} i @param {any} m */
function missionTarget(i, m) {
  if (m.type === MISSION_TYPES.LANDMARK_FIND) { const lm = lmById.get(m.targetId); return lm ? { x: lm.x, z: lm.z } : null; }
  if (m.type === MISSION_TYPES.RING_ROUTE) return runner.rings[i][runner.ringIndex[i]] ?? null;
  return null;
}

/** 任務卡內容：方向箭頭 + 距離 + prompt（已定稿） @param {number} i @param {import('./flight/flight-model.js').PlaneState} s */
function taskHtml(i, s) {
  const m = runner.current[i];
  if (!m) return '🎉 全部任務完成！';
  let lead = '🎯 ';
  const target = missionTarget(i, m);
  if (target) {
    const bearing = Math.atan2(target.x - s.pos.x, -(target.z - s.pos.z));
    const rel = wrapAngle(bearing - s.heading);
    const dist = Math.hypot(target.x - s.pos.x, target.z - s.pos.z);
    lead = `<span class="t-arrow" style="transform:rotate(${rel}rad)">⬆️</span> ${(dist / 1000).toFixed(1)}km　`;
  }
  return `${lead}${m.prompt.text}`;
}

/** 空戰每步：換武器(上升緣)/對空鎖定/發射 + 彈丸推進 + 命中事件 @param {number} now */
function updateDogfight(now) {
  // 餵入「可命中玩家」清單（PvP 對手 + 敵機選目標都用；無敵暫退期間不可被命中）
  const players = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (wasDriven[i] && states[i].mode === 'flying' && now >= pvpInvuln[i]) players.push({ slot: i, pos: states[i].pos, alive: true });
  }
  dogfight.setPlayers(players);
  // 敵機難度：難度曲線(波次) + adaptive 放水(近期勝負) + heuristic 地板（在 enemy-ai 內）
  if (dogfight.enemies.length) dogfight.setDifficulty(difficultyLevel(aiRound), adaptiveHandicap(aiResults));

  for (let i = 0; i < MAX_SLOTS; i++) {
    if (!wasDriven[i]) { prevSwitchBit[i] = false; continue; }
    // 冒煙暫退無敵期過了 → 清冒煙
    if (pvpSmoke[i] && now >= pvpInvuln[i]) { pvpSmoke[i] = false; planes[i].setDamaged(false); }
    const s = states[i];
    if (s.mode !== 'flying') { // 回到地面（機場附近）→ 補滿彈藥
      if (Math.hypot(s.pos.x, s.pos.z) < 2000) dogfight.reloadAll(i);
      prevSwitchBit[i] = false;
      continue;
    }
    const inp = lastInputs[i];
    if (inp.weaponSwitch && !prevSwitchBit[i]) toast(i, `🔁 ${dogfight.cycleWeapon(i)}`); // 換武器（上升緣循環）
    prevSwitchBit[i] = !!inp.weaponSwitch;
    const lock = dogfight.updateLock(i, s); // 對空鎖定（PvP 對手 / 敵機 / 最近氣球，飛近自動）
    if (lock && lock !== prevLock[i]) audio.lockTone(); // 剛鎖到 → 提示音
    prevLock[i] = lock;
    if (inp.fire) {
      const r = dogfight.tryFire(i, s, now); // 依武器冷卻節流
      if (r.fired && r.sound) { audio.weaponFire(r.sound); net.sendFx(i, 'bump'); }
    }
  }
  for (const ev of dogfight.step(DT, now)) {
    if (ev.kind === 'pop') { if (ev.sound === 'boom') audio.explode(); else audio.balloonPop(); } // 飛彈版＝爆炸音、卡通＝啵
    else if (ev.kind === 'boom') { audio.groundBoom(); toast(ev.owner, '🎯 紅區命中！'); }
    else if (ev.kind === 'exempt') toast(ev.owner, '⛔ 地標不能打（保護）'); // 红線回饋
    else if (ev.kind === 'cleared') { audio.missionSuccess(); for (let i = 0; i < MAX_SLOTS; i++) if (wasDriven[i]) toast(i, '🎈 氣球全打完！再來一輪'); }
    else if (ev.kind === 'playerHit') { toast(ev.owner, '🎯 擊落對手！'); handlePlayerDowned(ev.victim, now); }
    else if (ev.kind === 'enemyDown') { audio.explode(); toast(ev.owner, '🎯 擊落敵機！'); }
    else if (ev.kind === 'enemyHitPlayer') { handlePlayerDowned(ev.victim, now); recordAiResult(false); } // 玩家被敵機打下＝這波吃虧
    else if (ev.kind === 'win') { aiRound += 1; recordAiResult(true); audio.missionSuccess(); for (let i = 0; i < MAX_SLOTS; i++) if (wasDriven[i]) toast(i, '🎉 擊落全部敵機！下一波來了'); dogfight.spawnWave(); }
    // miss：不吵（無 toast）
  }
}

/** 記一筆近期對局結果（adaptive 放水用），保留最後 8 筆。 @param {boolean} playerWon */
function recordAiResult(playerWon) { aiResults.push(playerWon); if (aiResults.length > 8) aiResults.shift(); }

/** 進入/切換空戰子模式時重置敵機波次進度（難度從頭）。 */
function resetAiProgress() { aiRound = 0; aiResults.length = 0; }

/** 玩家被擊落後果（接後果軸；PvP 與敵機共用）：安全/溫和＝冒煙暫退·幾秒重生回場（非淘汰）；真實＝擊落出局。 @param {number|undefined} victim @param {number} now */
function handlePlayerDowned(victim, now) {
  if (victim == null || !wasDriven[victim]) return;
  audio.explode();
  net.sendFx(victim, 'bump');
  if (settings.mode === 'real') {
    toast(victim, '💥 被擊落出局！'); // 真實：擊落出局（暫以較長暫退重生呈現；正式淘汰/觀戰留後）
    pvpInvuln[victim] = now + 4000;
  } else {
    toast(victim, '😵 被打中！冒煙暫退'); // 安全/溫和：非淘汰
    if (settings.mode === 'gentle') registerMishap(conseq[victim]); // 溫和：❤️−1
    pvpInvuln[victim] = now + 2500;
  }
  respawnAtRunway(victim);          // 暫退回場（teleport 回機場重整）
  planes[victim].setDamaged(true);  // 冒煙（無敵期結束清）
  pvpSmoke[victim] = true;
}

/** 兩機相撞（HITL）：安全＝幽靈穿透不處罰；溫和/真實＝受損甚至爆炸（接後果軸）。 @param {number} now */
function checkPlaneCollision(now) {
  if (!(wasDriven[0] && wasDriven[1]) || now < planeCollideCooldown) return;
  if (settings.mode === 'safe') return; // 安全模式：兩機照常幽靈穿透（避免兄弟互撞變吵架）
  if (!planesColliding(states[0].pos, states[1].pos, PLANE_COLLIDE_R)) return;
  planeCollideCooldown = now + 1500;
  net.sendFx(0, 'bump'); net.sendFx(1, 'bump'); audio.bump();
  for (let i = 0; i < MAX_SLOTS; i++) { toast(i, '✈️💥✈️ 兩機相撞！'); handleMishap(i); } // gentle ❤️−1 / real 冒煙→墜毀
}

/** 競速每步：起飛即各自開始計時 → 依序穿圈/到終點 → 名次（落後不淘汰、完賽都報名次）。 @param {number} now */
function updateRace(now) {
  const r = race;
  if (!r) return;
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (!wasDriven[i]) continue;
    const racer = r.racers[i];
    if (!racer) continue;
    const s = states[i];
    if (!racer.started && s.mode === 'flying') { racer.started = true; racer.startAt = now; toast(i, '🏁 出發！'); } // 各自獨立計時
    if (!racer.started || racer.finished) continue;
    const ev = updateRacer(r, i, { x: s.pos.x, z: s.pos.z }, now);
    if (!ev) continue;
    if (ev.type === 'ring') { audio.lockTone(); toast(i, `✅ 第 ${ev.ringIndex} 圈！`); }
    else if (ev.type === 'finish') handleRaceFinish(i, ev.finishTime);
  }
  const maxPassed = Math.max(0, ...r.slots.map((sl) => r.racers[sl]?.ringIndex ?? 0)); // 過圈淡化用領先進度
  raceMarkers.setProgress(maxPassed);
}

/** 完賽：報名次（友善＝落後也有名次）；全員完賽放煙火。 @param {number} i @param {number} finishTime */
function handleRaceFinish(i, finishTime) {
  if (!race) return;
  const rank = ranking(race).find((r) => r.slot === i)?.rank ?? 1;
  toast(i, `🏁 第 ${rank} 名！${(finishTime / 1000).toFixed(1)} 秒`);
  audio.missionSuccess();
  if (allFinished(race) && !raceCelebrated) { // 全員完賽一次性慶祝
    raceCelebrated = true;
    audio.fireworks();
    for (let s = 0; s < MAX_SLOTS; s++) if (wasDriven[s]) toast(s, '🎉 大家都完賽了！');
  }
}

/** 競速計分卡（TaskSlot）：計時 + 名次/進度 + 下一目標箭頭。 @param {number} i @param {import('./flight/flight-model.js').PlaneState} s @param {number} now */
function raceHudText(i, s, now) {
  if (!race) return '';
  const racer = race.racers[i];
  if (!racer) return '';
  if (racer.finished) {
    const rank = ranking(race).find((r) => r.slot === i)?.rank ?? 1;
    return `🏁 完賽 第 ${rank} 名　⏱ ${((racer.finishTime ?? 0) / 1000).toFixed(1)}s`;
  }
  const t = racer.started ? ((now - racer.startAt) / 1000).toFixed(1) : '0.0';
  const wp = raceType === 'landmark' ? raceWaypoints[0] : raceWaypoints[racer.ringIndex];
  let lead = '';
  if (wp && s.mode === 'flying') {
    const bearing = Math.atan2(wp.x - s.pos.x, -(wp.z - s.pos.z));
    const rel = wrapAngle(bearing - s.heading);
    const dist = Math.hypot(wp.x - s.pos.x, wp.z - s.pos.z);
    lead = `<span class="t-arrow" style="transform:rotate(${rel}rad)">⬆️</span> ${(dist / 1000).toFixed(1)}km　`;
  }
  const prog = raceType === 'landmark' ? '衝終點🟢' : `第 ${racer.ringIndex + 1}/${raceWaypoints.length} 圈`;
  return `${lead}⏱ ${t}s　${prog}`;
}

/** 瞄準框（每視口一個）：空戰飛行時顯示，平常置中、鎖到目標就投影到目標螢幕位置。 @param {number} i */
function updateReticle(i) {
  const el = reticleEls[i];
  if (!el) return;
  const show = playMode === 'dogfight' && wasDriven[i] && states[i].mode === 'flying';
  if (!show) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const tp = dogfight.targetPos(dogfight.lockId[i]);
  if (!tp) { el.classList.remove('locked'); el.style.left = '50%'; el.style.top = '50%'; return; } // 無鎖定＝置中
  _reticleVec.set(tp.x, tp.y, tp.z).project(cams[i].cam);
  if (_reticleVec.z > 1) { el.classList.remove('locked'); el.style.left = '50%'; el.style.top = '50%'; return; } // 在相機後方
  el.classList.add('locked');
  el.style.left = `${Math.max(3, Math.min(97, (_reticleVec.x * 0.5 + 0.5) * 100))}%`;
  el.style.top = `${Math.max(3, Math.min(97, (-_reticleVec.y * 0.5 + 0.5) * 100))}%`;
}

/** 角落小地圖：任何模式都畫友機（+空戰氣球）的方位距離。 */
function renderMinimap() {
  const el = $('minimap');
  const anyDriven = wasDriven.some(Boolean);
  el.style.display = anyDriven ? 'block' : 'none';
  if (!anyDriven) return;
  /** @type {{x:number,z:number,heading?:number,kind:string}[]} */
  const blips = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (wasDriven[i]) blips.push({ x: states[i].pos.x, z: states[i].pos.z, heading: states[i].heading, kind: i === 0 ? 'self' : 'ally' });
  }
  if (playMode === 'dogfight') {
    for (const b of dogfight.balloons) if (b.alive) blips.push({ x: b.pos.x, z: b.pos.z, kind: 'balloon' });
    for (const e of dogfight.enemies) if (e.alive) blips.push({ x: e.state.pos.x, z: e.state.pos.z, heading: e.state.heading, kind: 'enemy' });
  }
  minimap.render(/** @type {any} */ (blips));
}

let kbWasActive = false;
function loop(/** @type {number} */ now) {
  const frame = Math.min((now - last) / 1000, 0.25);
  last = now;
  acc += frame;

  if (kb.active !== kbWasActive) { // 鍵盤第一次被按 → 接管紅機
    kbWasActive = kb.active;
    refreshDrivers();
  }

  while (acc >= DT) {
    for (let i = 0; i < MAX_SLOTS; i++) {
      if (!wasDriven[i]) continue;
      const input = inputFor(i);
      input.landAnywhere = conseq[i].mode === 'real'; // 真實模式：機場外可迫降
      lastInputs[i] = input;
      const prev = { ...states[i].pos };
      stepPlane(states[i], input, DT, env, flightParams(planeId)); // 機型手感（T-34C 缺省＝位元不變）
      if (states[i].justForcedTouch) { handleForcedLanding(i, now); continue; }
      const hit = collidePlane(states[i], prev, taipei.solidAt);
      if ((hit || states[i].justBounced) && now > fxCooldown[i]) {
        fxCooldown[i] = now + 1500;
        net.sendFx(i, 'bump');
        audio.bump();
        if (states[i].justNoGear) {
          toast(i, '先放起落架！🛬'); // 忘放輪＝提醒，所有模式不扣血/不受損
        } else {
          handleMishap(i); // 後果軸三檔分支（safe 彈開 / gentle ❤️−1 / real 漸進 damage）
        }
      }
      if (states[i].justTookOff) toast(i, '起飛！✈️');
      if (states[i].justLanded) {
        toast(i, '降落成功！👏'); audio.landingChime();
        if (playMode === 'mission') handleRunnerEvent(i, runner.notify(i, 'landed_runway', { x: states[i].pos.x, z: states[i].pos.z }));
      }
    }
    if (playMode === 'dogfight') updateDogfight(now); // 空戰：鎖定/發射/彈丸/命中
    else if (playMode === 'race') updateRace(now);     // 競速：計時/穿圈/名次
    checkPlaneCollision(now); // 兩機相撞（溫和/真實受損）
    acc -= DT;
  }
  reportPState(now);
  // 喇叭已改由 remote 本地播（兩機同玩不互相干擾）→ display 端不再處理 horn。

  // 視覺同步 + 相機 + 渲染
  const views = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (!wasDriven[i]) continue;
    planes[i].sync(states[i], lastInputs[i].th, frame, env.groundY);
    cams[i].update(states[i], frame);
    views.push(cams[i]);
  }
  labels.update(states.filter((_, i) => wasDriven[i]).map((s) => s.pos));
  const split = views.length === 2;
  $('splitLine').style.display = split ? 'block' : 'none';
  hud.layout(views.length); // 1 人滿版 / 2 人左右半屏

  // HUD 槽位內容（整數就好——這是給孩子看的）
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (!wasDriven[i]) continue;
    const s = states[i];
    if (playMode === 'mission') { // 任務檢查 + 任務卡（TaskSlot）
      handleRunnerEvent(i, runner.update(i, s));
      hud.setTask(i, taskHtml(i, s));
    } else if (playMode === 'dogfight') { // 空戰計分卡（TaskSlot）：擊落/命中率 或 剩餘氣球/分數
      let card = dogfight.scoreText(i);
      if (!dogfight.lockId[i] && s.mode === 'flying') { // 沒鎖到時給「找最近目標」指引箭頭（HITL：要指引才找得到）
        const g = dogfight.nearestTarget(i, s);
        if (g) card = `<span class="t-arrow" style="transform:rotate(${g.rel}rad)">⬆️</span> ${(g.distM / 1000).toFixed(1)}km　${card}`;
      }
      hud.setTask(i, card);
    } else if (playMode === 'race') { // 競速計分卡（TaskSlot）：計時 + 名次/進度 + 下一目標箭頭
      hud.setTask(i, raceHudText(i, s, now));
    }
    hud.setStatus(i, statusHtml(conseq[i])); // StatusSlot：❤️/後果模式
    if (s.mode === 'flying') {
      if (playMode === 'dogfight') {
        const lock = dogfight.lockId[i] ? '　🎯鎖定' : ''; // 鎖定指示
        hud.setMode(i, dogfight.weaponText(i, now) + lock); // ModeSlot：子模式 + 武器 + 彈藥/冷卻
      } else {
        hud.setMode(i, planeSpec(planeId).name);
      }
      hud.setAlt(i, `⛰ ${Math.round(s.pos.y)}m　💨 ${Math.round(s.speed * 3.6)}`);
    } else {
      hud.setMode(i, '🛫 推滿油門起飛！');
      hud.setAlt(i, ''); // 地面上隱藏高度帶
    }
    // 回家箭頭：飛離機場 >900m 才出現；箭頭 = 機場方位相對機頭的夾角
    const dist = Math.hypot(s.pos.x, s.pos.z);
    if (s.mode === 'flying' && dist > 900) {
      const bearingHome = Math.atan2(-s.pos.x, s.pos.z); // 朝原點（松機）的 heading
      const rel = wrapAngle(bearingHome - s.heading);     // 0 = 正前方
      hud.setHome(i, rel, `松山機場 ${(dist / 1000).toFixed(1)}km`);
    } else {
      hud.setHome(i, 0, null);
    }
  }

  audio.update(states.map((s, i) => ({
    driven: wasDriven[i],
    throttle: lastInputs[i].th,
    speed: s.speed,
    flying: s.mode === 'flying',
  })), split);

  if (views.length > 0) vr.render(scene, views);

  // 瞄準框（vr.render 後 → 相機矩陣已更新）：空戰時每視口一個，平常置中、鎖定後追瞄。
  for (let i = 0; i < MAX_SLOTS; i++) updateReticle(i);
  renderMinimap();
  if (playMode === 'race') raceMarkers.pulse(now / 1000); // 賽道輕微脈動（好找）

  if (debugOn) {
    fpsCount++; fpsTime += frame;
    if (fpsTime >= 0.5) { fps = Math.round(fpsCount / fpsTime); fpsCount = 0; fpsTime = 0; }
    const s = states[0];
    debugEl.textContent =
      `fps ${fps}  draws ${vr.info.render.calls}  tris ${vr.info.render.triangles}\n`
      + `P1 ${s.mode}  v=${s.speed.toFixed(1)}  y=${s.pos.y.toFixed(1)}  `
      + `hdg=${(s.heading * 57.3).toFixed(0)}°  r=${Math.hypot(s.pos.x, s.pos.z).toFixed(0)}m`;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// e2e / debug 鉤子
/** @type {any} */ (window).__tp = {
  net, states, conseq, settings, lastForcedLanding, runner, collection,
  get playMode() { return playMode; },
  // v2.0-1：玩法選單 + 機種（e2e/dev 直接驅動，不必點選單）
  get gameMode() { return playMode; },
  get dogfightMode() { return dogfightMode; },
  get planeId() { return planeId; },
  get raceType() { return raceType; },
  get race() { return race; },
  raceMarkers, // v2.1-1 e2e：戳賽道標記數
  setPlayMode: (/** @type {string} */ m) => applyPlayMode(m),
  setDogfightMode: (/** @type {string} */ m) => { dogfightMode = m; },
  setPlane: (/** @type {string} */ id) => setPlane(id),
  flightParams: (/** @type {string} */ id) => flightParams(id ?? planeId),
  dogfight, // v2.0-2 e2e/dev：戳武器/彈藥/分數/氣球/彈丸狀態
  terrainAt: (/** @type {number} */ x, /** @type {number} */ z) => taipei.terrainAt(x, z),
  // e2e/dev：直接完成當前任務（略過飛到定點），驗任務迴圈 + 收集 + 慶祝
  completeMission: (/** @type {number} */ slot) => {
    const ev = runner.devComplete(slot, { x: states[slot].pos.x, z: states[slot].pos.z });
    handleRunnerEvent(slot, ev);
    return ev;
  },
  get drawCalls() { return vr.info.render.calls; },
};
