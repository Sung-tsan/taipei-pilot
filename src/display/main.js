// @ts-check
// display 主流程：3D 場景 + 連線 + 固定步長遊戲迴圈 + 分屏渲染。
import { DisplayNet } from './net/client.js';
import { renderQr } from './ui/qr-panel.js';
import { KeyboardInput } from './input/keyboard.js';
import { makeWorld } from './scene/world.js';
import { spawnPose } from './scene/airport.js';
import { makeTaipei } from './scene/taipei.js';
import { makePlane, stepPlane } from './flight/flight-model.js';
import { collidePlane } from './flight/collision.js';
import { PlaneEntity } from './planes/plane-entity.js';
import { ChaseCam } from './render/chase-cam.js';
import { LandmarkLabels } from './render/labels.js';
import { ViewportRenderer } from './render/viewports.js';
import { Hud } from './ui/hud.js';
import { GameAudio } from './audio.js';
import { makeConsequence, registerMishap } from './flight/consequence.js';
import { judgeForcedLanding, roadClearLength, roadLandable, TERRAIN, T34C_DIMS } from './flight/forced-landing.js';
import { ROAD_WIDTH } from './scene/city-gen.js';
import { RIVERS } from './scene/rivers.js';
import { MissionRunner } from './missions/mission-runner.js';
import { airspaceTaipei } from './missions/airspace-taipei.js';
import { loadCollection, saveCollection } from './missions/collection-store.js';
import { ringsAlongRiver, MISSION_TYPES } from './missions/missions.js';
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
let playMode = 'mission'; // v1.1-4 預設任務模式以呈現新 UI；v1.1-5 出正式玩法選單
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
      if (playMode === 'mission') runner.start(i, { x: states[i].pos.x, z: states[i].pos.z });
      if (driver0 === 'fake') { // 壓測用：直接丟到市區上空盤旋
        states[i].mode = 'flying';
        states[i].pos = { x: 800, y: 280, z: 3000 };
        states[i].speed = 45;
      }
      planes[i].setVisible(true);
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

// —— 玩法模式切換（v1.1-4 暫用按鈕；v1.1-5 出正式選單）——
const playModeBtn = $('playModeBtn');
function renderPlayMode() { playModeBtn.textContent = playMode === 'mission' ? '🎯 任務模式' : '✈️ 自由飛'; }
playModeBtn.addEventListener('click', () => {
  playMode = playMode === 'mission' ? 'free' : 'mission';
  renderPlayMode();
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (!wasDriven[i]) continue;
    hud.applyMode(i, playMode);
    if (playMode === 'mission') runner.start(i, { x: states[i].pos.x, z: states[i].pos.z });
    else hud.setTask(i, '');
  }
});
renderPlayMode();

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
function triggerCelebration() { celebrationEl.classList.remove('hidden'); }
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
const hornWas = [false, false]; // 喇叭上升緣偵測（context 鍵 BTN.HORN）
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
    case 'heart_loss': toast(i, `碰！剩 ${conseq[i].hearts} ❤️`); break;
    case 'reset': toast(i, '沒命了～回機場休息 🛬'); break;
    case 'smoke': toast(i, '⚠️ 冒煙了！快找地方降落'); planes[i].setDamaged(true); break;
    case 'destroy': toast(i, '墜毀！回跑道 💥'); break;
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
    roadOk = roadLandable(ROAD_WIDTH, len, T34C_DIMS);
  }
  const result = judgeForcedLanding({ terrain, speed: s.speed, sinkRate: s.lastSink, bank: s.bank, roadOk });
  audio.bump();
  net.sendFx(i, 'bump');
  if (result === 'destroyed') {
    toast(i, '迫降失敗，墜毀！💥');
    conseq[i] = makeConsequence(settings.mode, settings.heartsMax);
    respawnAtRunway(i);
  } else if (result === 'smoking') {
    toast(i, '迫降勉強成功…冒煙了 😬');
    conseq[i].damage = 'smoking';
    planes[i].setDamaged(true);
  } else {
    toast(i, terrain === TERRAIN.WATER ? '水上迫降成功！💦'
      : terrain === TERRAIN.ROAD ? '馬路迫降成功！🛬' : '迫降成功！👏');
    audio.landingChime();
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
  hud.toast(i, `🎉 ${ev.fact}`); // 達成揭曉 + fact（DRAFT）
  audio.landingChime();
  saveCollection(localStorage, collection);
  if (ev.celebrate) triggerCelebration();
}

/** 目標座標（地標 / 下一個圈；高度/起降無方向） @param {number} i @param {any} m */
function missionTarget(i, m) {
  if (m.type === MISSION_TYPES.LANDMARK_FIND) { const lm = lmById.get(m.targetId); return lm ? { x: lm.x, z: lm.z } : null; }
  if (m.type === MISSION_TYPES.RING_ROUTE) return runner.rings[i][runner.ringIndex[i]] ?? null;
  return null;
}

/** 任務卡內容：方向箭頭 + 距離 + prompt（DRAFT） @param {number} i @param {import('./flight/flight-model.js').PlaneState} s */
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
      stepPlane(states[i], input, DT, env);
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
    acc -= DT;
  }
  reportPState(now);

  // 喇叭（context 鍵 BTN.HORN）：上升緣觸發一次卡通叭叭
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (!wasDriven[i]) { hornWas[i] = false; continue; }
    const live = net.liveInput(i);
    const honking = !!(live && (live.b & BTN.HORN));
    if (honking && !hornWas[i]) audio.horn();
    hornWas[i] = honking;
  }

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
    }
    hud.setStatus(i, statusHtml(conseq[i])); // StatusSlot：❤️/後果模式
    if (s.mode === 'flying') {
      hud.setMode(i, '🛩 T-34C');
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
  terrainAt: (/** @type {number} */ x, /** @type {number} */ z) => taipei.terrainAt(x, z),
  // e2e/dev：直接完成當前任務（略過飛到定點），驗任務迴圈 + 收集 + 慶祝
  completeMission: (/** @type {number} */ slot) => {
    const ev = runner.devComplete(slot, { x: states[slot].pos.x, z: states[slot].pos.z });
    handleRunnerEvent(slot, ev);
    return ev;
  },
  get drawCalls() { return vr.info.render.calls; },
};
