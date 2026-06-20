// @ts-check
// display 主流程：3D 場景 + 連線 + 固定步長遊戲迴圈 + 分屏渲染。
import * as THREE from 'three';
import { DisplayNet } from './net/client.js';
import { renderQr } from './ui/qr-panel.js';
import { KeyboardInput } from './input/keyboard.js';
import { makeWorld } from './scene/world.js';
import { WeatherRenderer } from './weather/weather-render.js';
import { makeWeather, rollWeather, weatherProfile, weatherForces, DEFAULT_AIRPORT } from './weather/weather.js';
import { makeDayNight, dayNightParams, TIMES_OF_DAY } from './weather/daynight.js';
import { crosswindDamagePct, turbulenceDamagePct } from './flight/wind-damage.js';
import { AirportLife } from './scene/airport-life.js';
import { patternPoints, advanceCorridor, corridorAtc } from './scene/air-corridor.js';
import { atcBoarding, atcBoardComplete, atcPushback, atcTaxiToHold, atcHoldShort, atcCleared, atcExit, atcTaxiToGate, atcDocked } from './scene/atc-phraseology.js';
import { CorridorMarkers } from './scene/corridor-markers.js';
import { GroundService } from './scene/ground-service.js';
import { makeAirportScene } from './scene/airport-scene.js';
import { AIRPORTS, AIRPORT_IDS, HOME_AIRPORT, DEMO_AIRPORTS, ROUTES, ROUTE_IDS, routesFrom, routeOtherEnd, routeDistanceKm, airport as airportSpec, mapXY } from './scene/airports.js';
import { makeCruise, stepCruise, cruisePhaseLabel, cruiseEtaSec } from './missions/route-engine.js';
import { makeFuel, burn, burnRate, fuelFrac, isLow, refuel, canReach, routeFuelCostSec } from './missions/fuel.js';
import { makePlane, stepPlane } from './flight/flight-model.js';
import { collidePlane } from './flight/collision.js';
import { PlaneEntity } from './planes/plane-entity.js';
import { planeSpec, flightParams, PLANE_IDS, DEFAULT_PLANE, isGlbModel } from './planes/plane-specs.js';
import { Dogfight } from './combat/dogfight.js';
import { difficultyLevel, adaptiveHandicap } from './combat/enemy-ai.js';
import { makeDodge, dodgeReady, triggerDodge, dodging, dodgeRoll, DODGE } from './combat/maneuver.js';
import { GroundNav } from './scene/ground-nav.js';
import { nearestNode, arrivalRoute, routeWorldPoints, nodeWorld, selectArrivalExit, exitParallel, assignArrivalGate, isParkedAtGate, gateParkPose, departureRoute } from './scene/taxiway.js';
import { planesColliding } from './flight/plane-collision.js';
import { Minimap } from './ui/minimap.js';
import { ChaseCam } from './render/chase-cam.js';
import { LandmarkLabels } from './render/labels.js';
import { ViewportRenderer } from './render/viewports.js';
import { Hud } from './ui/hud.js';
import { GameAudio } from './audio.js';
import { makeConsequence, registerMishap, addDamagePct } from './flight/consequence.js';
import { judgeForcedLanding, roadClearLength, roadLandable, TERRAIN } from './flight/forced-landing.js';
import { ROAD_WIDTH } from './scene/city-gen.js';
import { RIVERS } from './scene/rivers.js';
import { MissionRunner } from './missions/mission-runner.js';
import { airspaceTaipei } from './missions/airspace-taipei.js';
import { loadCollection, saveCollection, flyRoute, shouldCelebrateNetwork } from './missions/collection-store.js';
import { ringsAlongRiver, MISSION_TYPES } from './missions/missions.js';
import { RACE_TYPES, makeRace, updateRacer, ranking, allFinished } from './missions/race.js';
import { RaceMarkers } from './missions/race-markers.js';
import { loadSettings, saveSettings, WEATHER_PREFS } from './ui/settings-store.js';
import { MAX_SLOTS } from '../../shared/constants.js';
import { BTN } from '../../shared/protocol.js';
import { wrapAngle } from '../lib/math.js';

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

// —— 場景（V5：多機場航網。每機場一顆 group，切換＝remove/add；以各自跑道中心為世界原點）——
const scene = makeWorld();
/** @type {Map<string, import('./scene/airport-scene.js').AirportScene>} 已建機場場景（切換不重建） */
const airportCache = new Map();
/** @type {Map<string, LandmarkLabels>} 各機場地標名牌（建一次、隨場景重用，避免重複 sprite） */
const labelCache = new Map();
/** 取得（首次則建並快取）一個機場的場景 + 名牌。 @param {string} id */
function getAirport(id) {
  let a = airportCache.get(id);
  if (!a) { a = makeAirportScene(id); airportCache.set(id, a); labelCache.set(id, new LandmarkLabels(a.group, a.landmarks)); }
  return a;
}
let curAirportId = HOME_AIRPORT;     // 目前所在機場（航網切換）
let air = getAirport(curAirportId);  // 目前機場場景（terrainAt/solidAt/env/runwayDir/taxi/spawnPose）
scene.add(air.group);
let labels = /** @type {LandmarkLabels} */ (labelCache.get(curAirportId));
let env = air.env;          // 目前機場 env（切換時重指）
let taxi = air.taxi;        // 目前機場滑行道 graph
let RWDIR = air.runwayDir;  // 目前機場跑道方向（取代 V4 全域 RWDIR）

// —— 實體與相機（每 slot 一組，常駐） ——
const vr = new ViewportRenderer(/** @type {HTMLCanvasElement} */ ($('gameCanvas')));
const planes = Array.from({ length: MAX_SLOTS }, (_, i) => new PlaneEntity(scene, i));
const cams = Array.from({ length: MAX_SLOTS }, () => new ChaseCam());
const states = Array.from({ length: MAX_SLOTS }, (_, i) => makePlane(air.spawnPose(i)));

// —— 後果軸（安全模式）：每架一份狀態，per session 從 localStorage 載 ——
const settings = loadSettings();
const conseq = Array.from({ length: MAX_SLOTS }, () => makeConsequence(settings.mode, settings.heartsMax));
/** @type {({terrain:string, result:string}|null)[]} 最近一次迫降結果（e2e/除錯用） */
const lastForcedLanding = Array.from({ length: MAX_SLOTS }, () => null);

// —— V5 油量（只真實模式咬；安全/溫和無限）：每架一份，spawn/落地/換機補滿 ——
const fuel = Array.from({ length: MAX_SLOTS }, () => makeFuel(900)); // 初值；resetFuel 依機種重設
const engineOut = states.map(() => false);    // 油盡熄火（真實）→ 引擎死、強制滑翔 → 接迫降（v1.1-2 閉環）
const lowFuelWarned = states.map(() => false); // 油低警告一次性（per slot）
/** 補滿油 + 清熄火/警告（spawn/落地/換機）。 @param {number} i */
function resetFuel(i) { fuel[i] = makeFuel(planeSpec(planeId).fuelSec); engineOut[i] = false; lowFuelWarned[i] = false; }

// —— 任務系統（v1.1-4）：解析器 + runner + 收集 + 玩法模式 ——
const lmById = new Map(air.landmarks.map((l) => [l.id, l]));
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
const landmarkZones = air.landmarks.map((l) => ({ x: l.x, z: l.z, r: (/** @type {any} */ (l).clear ?? 200) + 80 }));
const DEMO_REDZONE = { x: 2600, z: 2600, r: 450 };
const dogfight = new Dogfight(scene, { landmarks: landmarkZones, redZones: [DEMO_REDZONE], groundY: env.groundY, env });
const prevSwitchBit = states.map(() => false); // 換武器鍵上升緣偵測（per slot）
const prevDodgeBit = states.map(() => false);  // 翻滾閃避鍵上升緣偵測（per slot）
const dodges = states.map(() => makeDodge());  // 翻滾閃避狀態機（per slot）

// —— V4 地面導航（v4.0-1 P3）：taxiway graph（目前機場，見上 `taxi`）+ 跟我車(GLB)/綠中線燈/ATC 文字 ——
const groundNav = new GroundNav(scene);
let gnGate = /** @type {string|null} */ (null); // 目前導航目標登機門（活化時定一次）
// v4.0-2 到場流程狀態機：'none'＝非到場（沿用 v4.0-1 直接導到 gate）；
//   'exit'＝落地後脫離跑道（P1）；'taxi'＝脫離後滑到 gate（P2）；'parked'＝停妥（P3）。
let arrivalPhase = /** @type {'none'|'exit'|'taxi'|'parked'} */ ('none');
let arrivalExit = /** @type {string|null} */ (null); // 落地選定的脫離道節點 id（P1）
let arrivalGate = /** @type {string|null} */ (null); // 塔台指派登機門 id（P2；落地時定一次）
let arrivalSeq = 0; // 到場序（P2 輪派 gate；跨多次到場遞增＝每次停不同門）
const ARRIVAL_REACH_M = 70; // m 視為「抵達脫離道接點」的容差（轉 taxi 階段）
const BRIDGE_LEN = 40;      // m 空橋長（登機門 → 航廈前緣；HITL 2026-06-20：門貼近航廈後縮短）
// v4.1-1 離場流程狀態機：spawn-at-gate 的 ATR 走 boarding→pushback→taxiOut→holdShort→cleared→起飛。
// 'none'＝非離場。離場與到場互斥（同一架不會同時）。
let departPhase = /** @type {'none'|'boarding'|'pushback'|'taxiOut'|'holdShort'|'cleared'} */ ('none');
let departGate = /** @type {string|null} */ (null); // 離場登機門 id
let departSlot = -1;        // 離場中的 slot
let boardT = 0;            // 登機動畫計時（秒）
let pushT = 0;             // pushback 進度 0..1
/** @type {{from:{x:number,z:number}, to:{x:number,z:number}, h0:number, h1:number}|null} */
let pushPath = null;        // pushback 起終姿態（scripted 後推）
let holdT = 0;             // hold-short 排序計時（秒）
let boardReady = false;     // 登機完成、等玩家確認後推
let pendingConfirm = false;  // 確認鍵脈衝閂鎖（Enter / 遙控器；physics loop 設、離場流程取走）
let departKeysActive = false; // 是否已把遙控器切到「確認後推」子模式（避免重複廣播）
const BOARD_SEC = 4;        // 登機動畫長（短可愛）
const PUSH_SEC = 3.2;       // pushback 推出時長
const SEQ_SEC = 5;          // 起飛排序「前面一架」等待
const DEPART_RWY = /** @type {'r10'|'r28'} */ ('r10'); // 離場跑道頭（RWY10，與 spawnPose 起飛朝向一致）
const DEPART_GATES = ['g3', 'g4']; // slot 0/1 離場登機門（中央門）
/** 是否民航機（airliner tone）→ 走完整地面/空中走廊流程（ATR-72 / A330…）。 @param {string} id */
const isCivil = (id) => planeSpec(id).tone === 'airliner';
/** 空中走廊各 leg 的英文 ATC 語音（TTS；en ATC 較自然、國際本就英文）。 @type {Record<string,string>} */
const CORRIDOR_VOICE = {
  climb: 'Climb on the departure.',
  cross: 'Turn crosswind.',
  down: 'Downwind leg. Maintain altitude.',
  base: 'Turn base. Begin descent.',
  final: 'Final approach. Runway one zero, cleared to land.',
};
// v4.1 空中走廊（airborne corridor）：起飛後接離場爬升→下風→進場下降的 traffic pattern（一趟完整航班空中段）。
const corridorMarkers = new CorridorMarkers(scene);
const groundService = new GroundService(scene); // v4.1-1 登機地勤車 + pushback 拖車
let corridorActive = false;
let corridorSlot = -1;
let corridorIdx = 0;
/** @type {import('./scene/air-corridor.js').CorridorPoint[]} */
let corridorPts = [];
// P4 地面碰撞「越界」：偏離綠線太遠（taxi 速度域）→ 真實接 damagePct、安全/溫和提示重來。
const TAXI_OFF_M = 55;     // m 偏離綠線判越界（HITL 可調）
const TAXI_OFF_PCT = 10;   // 越界受損%（真實模式）
const taxiOffCd = states.map(() => 0); // 越界事件冷卻（per slot，避免每幀累加）
let lastTaxiOff = /** @type {{slot:number, off:number, at:number}|null} */ (null); // e2e/dev
const stallWarnCd = states.map(() => 0); // v4 失速警告冷卻（per slot，避免相位震盪時連發）
const pvpInvuln = states.map(() => 0);  // 被擊落後的無敵/暫退到期時間（per slot；PvP + 敵機共用）
const pvpSmoke = states.map(() => false); // 冒煙中（無敵期過了要清）
const prevLock = states.map(() => /** @type {string|null} */ (null)); // 鎖定上升緣（剛鎖到才響提示音）
let dogfightTaught = false; // 空戰首次教學一次性
let aiRound = 0;        // 敵機波次（難度曲線：越後越難）
/** @type {boolean[]} 近期對局結果（true=玩家清掉一波、false=玩家被擊落）→ adaptive 放水 */
const aiResults = [];
const PLANE_COLLIDE_R = 18; // 兩機相撞半徑（m）：溫和/真實才處罰（HITL）
let planeCollideCooldown = 0; // 相撞後果冷卻（避免每幀重複觸發）

const audio = new GameAudio(); // 音效（先建好，applyEnv 要呼叫 setWeather；ensure() 在第一次 gesture 才出聲）

// —— 天氣（v3.0-1）+ 生活感/日夜（v3.0-3）：modulate world.js + 後果軸閘 ——
const weatherRenderer = new WeatherRenderer(scene);
const weather = makeWeather();
const airportLife = new AirportLife(scene);   // 停機坪飛機/燈/窗光/風向袋/雷達/車（merged/instanced）
const dayNight = makeDayNight();               // 日夜時段（開場可選；純氛圍）
/** 套用天氣 × 日夜到場景（compose 一次；天氣 roll、換時段、換後果模式都呼叫）。 */
function applyEnv() {
  const dp = dayNightParams(dayNight.time);
  weatherRenderer.apply(weather.type, dp);     // fog/光/天空/雲/雨 + 日夜疊色
  airportLife.setNight(dp.nightLights);        // 夜/黃昏 → 跑道燈/窗光/停機坪燈亮
  audio.setWeather(weather.type, dp.nightLights); // 天氣音效（雨聲/側風底/夜底噪）
}
let ambientWeather = 'clear'; // 環境 roll 出的天氣（天氣挑戰任務會覆寫顯示，任務結束回環境）
let missionForcedWeather = /** @type {string|null} */ (null); // 上一幀天氣任務覆寫值（用來偵測「剛離開」）
/** 依機場 profile + 後果模式 roll 環境天氣，再 compose 套用。 */
function rollAndApplyWeather() {
  // 天氣偏好：家長手動鎖定（晴/多雲/雨/霧）優先；'auto' 才照後果模式 roll（HITL 2026-06-16：雨要能關）。
  ambientWeather = settings.weather && settings.weather !== 'auto'
    ? settings.weather
    : rollWeather(weatherProfile(air.spec.weather), settings.mode);
  weather.type = ambientWeather;
  missionForcedWeather = null;
  applyEnv();
}
/**
 * 天氣挑戰任務進場 → 覆寫成指定天氣（v3.0-4「兩者都要」第二半）；任務結束 → 回環境。每幀呼叫。
 * 只在「有任務要求且與現值不同」或「剛離開天氣任務」時重套——不主動覆蓋手動/預覽天氣（C 鍵/dev）。
 */
function refreshMissionWeather() {
  let forced = null;
  if (playMode === 'mission') {
    for (let i = 0; i < MAX_SLOTS; i++) {
      const m = wasDriven[i] ? runner.current[i] : null;
      if (m && m.weatherRequirement) { forced = m.weatherRequirement; break; }
    }
  }
  if (forced) {
    if (forced !== weather.type) { weather.type = forced; applyEnv(); }
    missionForcedWeather = forced;
  } else if (missionForcedWeather !== null) { // 剛離開天氣任務 → 回環境天氣
    missionForcedWeather = null;
    weather.type = ambientWeather;
    applyEnv();
  } // 否則：無任務天氣、也沒剛離開 → 不動（讓 roll/設定/C 預覽主導）
}
rollAndApplyWeather(); // 開場先 roll 一次（依目前後果模式 + 時段）

// —— 側風/亂流（v3.0-2，只真實模式）：wind 由 weather 強度×固定風向；gust 由時間平滑噪音 ——
const WIND_FROM_DEG = 20; // 風從 NNE 來（吹向 ~200°），給跑道 10/28 一點側風（HITL 可調）
const windDamageCd = states.map(() => 0); // 亂流受損冷卻（per slot，避免每幀累加）
/** 風速向量（吹向＝風來向+180）。 @param {number} speed @returns {{x:number,z:number}} */
function windVec(speed) {
  const toRad = ((WIND_FROM_DEG + 180) * Math.PI) / 180;
  return { x: Math.sin(toRad) * speed, z: -Math.cos(toRad) * speed };
}
/** 平滑亂流擾動（時間噪音、非亂數→流暢可重現的抖動）。 @param {number} t 秒 @param {number} turb 0..1 */
function gustAt(t, turb) {
  const n1 = Math.sin(t * 3.1) * 0.6 + Math.sin(t * 7.7 + 1.3) * 0.4;
  const n2 = Math.sin(t * 2.6 + 2) * 0.6 + Math.sin(t * 6.3 + 0.7) * 0.4;
  return { roll: n1 * 0.16 * turb, pitch: n2 * 0.07 * turb }; // 幅度寧可先弱（減暈）
}
/** 套用天氣受損%（接後果軸 damagePct）：跨檻冒煙/墜毀才出聲。 @param {number} i @param {number} pct @param {string} label */
function applyWeatherDamage(i, pct, label) {
  const res = addDamagePct(conseq[i], pct);
  if (res.outcome === 'smoke') { toast(i, `⚠️ ${label}受損冒煙！`); planes[i].setDamaged(true); }
  else if (res.outcome === 'destroy') { toast(i, `💥 ${label}受損過重墜毀！`); audio.explode(); respawnAtRunway(i); }
}

// dev/HITL：按 C 循環天氣預覽（晴→多雲→雨→霧）。正式天氣由 roll + 天氣挑戰任務(v3.0-4)驅動。
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyC') return;
  const order = ['clear', 'cloudy', 'rain', 'fog'];
  weather.type = order[(order.indexOf(weather.type) + 1) % order.length];
  applyEnv();
});

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
    const lm = lmById.get('taipei101') ?? air.landmarks[0]; // 地標衝刺：飛到 101（或第一個地標）
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
      Object.assign(states[i], makePlane(spawnFor(i)));
      // v4.1-1：ATR（民航）spawn-at-gate → 啟動離場流程（登機→後推→taxi→排序→起飛）。
      if (isCivil(planeId) && (playMode === 'free' || playMode === 'mission')) startDeparture(i);
      conseq[i] = makeConsequence(settings.mode, settings.heartsMax); // 新上線＝照當前設定重置後果狀態
      resetFuel(i); // 新上線＝滿油
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

// —— 音效（瀏覽器規定：第一次 gesture 才出聲）——（audio 實例在天氣區塊前已建）
function enableAudio() {
  audio.ensure();
  try { window.speechSynthesis?.getVoices(); } catch { /* 預熱 TTS 語音清單（async 載入；ATC 念稿前備齊） */ }
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
  rollAndApplyWeather(); // 後果模式變 → 重 roll 天氣（安全恆晴/溫和溫和/真實全開）
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
  for (const b of document.querySelectorAll('#shakeRow .set-opt')) {
    b.classList.toggle('active', b.getAttribute('data-shake') === (settings.camShake ? '1' : '0'));
  }
  for (const b of document.querySelectorAll('#timeRow .set-opt')) {
    b.classList.toggle('active', b.getAttribute('data-time') === dayNight.time);
  }
  for (const b of document.querySelectorAll('#weatherRow .set-opt')) {
    b.classList.toggle('active', b.getAttribute('data-weather') === settings.weather);
  }
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
for (const b of document.querySelectorAll('#shakeRow .set-opt')) {
  b.addEventListener('click', () => { // 亂流鏡頭晃動開關（減暈）
    settings.camShake = b.getAttribute('data-shake') === '1';
    saveSettings(localStorage, settings); renderSettingsUI();
  });
}
for (const b of document.querySelectorAll('#timeRow .set-opt')) {
  b.addEventListener('click', () => { // 日夜時段（純氛圍）
    const t = b.getAttribute('data-time');
    if (t) { dayNight.time = t; applyEnv(); renderSettingsUI(); }
  });
}
for (const b of document.querySelectorAll('#weatherRow .set-opt')) {
  b.addEventListener('click', () => { // 天氣偏好（家長鎖定/關雨；auto＝照模式 roll）
    const w = b.getAttribute('data-weather');
    if (w && WEATHER_PREFS.includes(/** @type {any} */ (w))) {
      settings.weather = /** @type {any} */ (w);
      saveSettings(localStorage, settings);
      rollAndApplyWeather(); // 立即套用（鎖定值或重 roll）
      renderSettingsUI();
    }
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
  for (let i = 0; i < MAX_SLOTS; i++) resetFuel(i); // 換機＝換油箱（新機種 fuelSec）
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
  // V5 航網收集：飛過的航線點亮（地理教材 fact）。
  $('routeCollectionList').innerHTML = ROUTES.map((r) => {
    const flown = collection.routes.has(r.id);
    return `<li class="${flown ? 'lit' : ''}">${flown ? '✈️' : '☆'} ${r.name}${flown ? `<small>${r.fact.text}</small>` : ''}</li>`;
  }).join('');
  $('routeCollectionCount').textContent = `航線 ${collection.routes.size}/${ROUTE_IDS.length}`;
  $('netCelebrateReplay').style.display = collection.networkCelebrated ? 'inline-block' : 'none';
}
$('collectionBtn').addEventListener('click', () => { renderCollection(); collectionEl.classList.remove('hidden'); });
$('collectionClose').addEventListener('click', () => collectionEl.classList.add('hidden'));

// —— 台北飛透透大慶祝（一次性 gate；收集簿可重看）——
const celebrationEl = $('celebration');
const CELEB_LANDMARK = { title: '台北飛透透！', sub: '全部地標都點亮了，你把整個台北都飛遍了！👏' };
/** 大慶祝（地標全亮 / 九航線全通共用一個 modal，換標題/文案）。 @param {string} [title] @param {string} [sub] */
function triggerCelebration(title = CELEB_LANDMARK.title, sub = CELEB_LANDMARK.sub) {
  $('celebTitle').textContent = title;
  $('celebSub').textContent = sub;
  celebrationEl.classList.remove('hidden'); audio.fireworks();
}
$('celebrationClose').addEventListener('click', () => celebrationEl.classList.add('hidden'));
$('celebrateReplay').addEventListener('click', () => { collectionEl.classList.add('hidden'); triggerCelebration(); });
$('netCelebrateReplay').addEventListener('click', () => { collectionEl.classList.add('hidden'); triggerCelebration('九航線全通！🎉', '你飛遍台灣九座機場的天空，成為真正的小飛官！👏'); });

/** @param {number} slot @param {string} text */
function toast(slot, text) {
  hud.toast(slot, text); // CenterSlot 瞬時 overlay
}

// ============================================================================
// V5 航網：台灣全圖選線 + 雲上巡航（時間壓縮 + 半自動）+ 機場切換（load/unload）
// 北極星 ROADMAP §4 V5 / handoff v5.0-1。demo 機場（v5.0-1 可飛）＝松山/高雄/金門；其餘 v5.1-2 解鎖。
// ============================================================================
/** @type {import('./scene/airports.js').Route|null} */ let selectedRoute = null; // 全圖選定航線
let selectedDest = /** @type {string|null} */ (null); // 選定目的地機場（航線另一端）
/** @type {import('./missions/route-engine.js').Cruise|null} */ let cruise = null;  // 進行中的巡航
let cruiseSlot = -1;          // 飛航線的 slot（航線飛行＝單機主導）
let cruiseDest = /** @type {string|null} */ (null);   // 巡航目的地機場 id
let cruiseRouteId = /** @type {string|null} */ (null); // 巡航航線 id（v5.0-2 收集點亮用）
let lastRouteFlown = /** @type {string|null} */ (null); // 最近完成的航線 id（e2e/收集 hook）
/** @type {{routeId:string, pax:number}|null} 抵達後待落地結算的航班（載客/準點） */ let lastFlight = null;
/** 各機種載客數（航班任務「載客」；遊戲化）。 */
const PAX = /** @type {Record<string,number>} */ ({ t34c: 2, f16: 1, atr72: 60, b737: 150, a330: 250 });
/** @param {string} id @returns {number} */
const paxFor = (id) => PAX[id] ?? 20;

/** 某機場是否本階段可飛（v5.0-1 demo 三場；v5.1-2 解鎖全部）。 @param {string} id */
const airportUnlocked = (id) => DEMO_AIRPORTS.includes(/** @type {any} */ (id));

/**
 * 切換目前機場（航網 load/unload）：remove 舊 group、add 新場景、重指 env/taxi/runwayDir、
 * 清地面/空中流程狀態、換目的地天氣 profile。各機場以自己跑道中心為世界原點。
 * @param {string} toId
 */
function loadAirport(toId) {
  if (toId === curAirportId) return;
  scene.remove(air.group);
  curAirportId = toId;
  air = getAirport(toId);
  scene.add(air.group);
  labels = /** @type {LandmarkLabels} */ (labelCache.get(toId));
  env = air.env; taxi = air.taxi; RWDIR = air.runwayDir;
  clearDeparture(); clearCorridor();
  arrivalPhase = 'none'; arrivalExit = null; arrivalGate = null; gnGate = null;
  rollAndApplyWeather(); // 目的地機場天氣 profile（金門霧/澎湖側風…招牌活化）
}

/** 武裝巡航：起飛後若有選定航線即由 justTookOff 呼叫。 @param {number} slot */
function beginCruise(slot) {
  if (!selectedRoute || !selectedDest) return;
  cruise = makeCruise(selectedRoute, routeDistanceKm(curAirportId, selectedDest));
  cruiseSlot = slot; cruiseDest = selectedDest; cruiseRouteId = selectedRoute.id;
  clearDeparture(); clearCorridor();
  toast(slot, `🛫 飛往 ${airportSpec(selectedDest).name}！爬升到雲端開始巡航`);
}

/** 把飛機放到目的地跑道「最終進場」（airborne、對正、放輪、進場速度）。 @param {number} slot */
function placeOnApproach(slot) {
  const dir = air.runwayDir; const L = air.runwayLength;
  const back = -L / 2 - 2200; // 跑道頭外 2.2km
  const heading = Math.atan2(dir.x, -dir.z);
  Object.assign(states[slot], makePlane({ x: dir.x * back, z: dir.z * back, heading }));
  states[slot].mode = 'flying'; states[slot].pos.y = 360; states[slot].speed = 70; states[slot].gearDown = true;
  planes[slot].setDamaged(false);
}

/** 巡航抵達：load 目的地 airspace + 飛機放最終進場 + 點亮航線（航網收集）+ 九航線全通慶祝。 */
function arriveCruise() {
  if (!cruise || !cruiseDest) return;
  const slot = cruiseSlot;
  const routeId = /** @type {string} */ (cruiseRouteId);
  loadAirport(cruiseDest);
  placeOnApproach(slot);
  toast(slot, `☁️ 抵達 ${air.spec.name} 上空，對正跑道降落！`);
  audio.landingChime();
  lastRouteFlown = routeId;
  lastFlight = { routeId, pax: paxFor(planeId) }; // 落地時結算載客/準點
  // 航網收集：飛過這條航線即點亮（飛抵＝飛過）；九航線全通 → 一次性大慶祝。
  flyRoute(collection, routeId);
  saveCollection(localStorage, collection);
  if (shouldCelebrateNetwork(collection, ROUTE_IDS)) {
    collection.networkCelebrated = true; saveCollection(localStorage, collection);
    triggerCelebration('九航線全通！🎉', '你飛遍台灣九座機場的天空，成為真正的小飛官！👏');
  }
  cruise = null; cruiseSlot = -1; cruiseDest = null; cruiseRouteId = null;
  selectedRoute = null; selectedDest = null;
  cruiseOverlayEl.classList.remove('show');
}

/** 巡航中油盡（真實模式、航程不足）→ 海上迫降（複用 v1.1-2 判定）+ 返出發機場。 @param {number} slot */
function ditchCruise(slot) {
  if (!cruise) return;
  const destName = airportSpec(cruiseDest ?? '').name;
  judgeForcedLanding({ terrain: TERRAIN.WATER, speed: states[slot].speed, sinkRate: states[slot].lastSink, bank: 0 }); // 複用迫降品質（water 寬鬆）
  audio.forcedLandingSound('water'); net.sendFx(slot, 'bump');
  toast(slot, `⛽ 油不夠飛到 ${destName}！海上迫降 🌊 換大一點的飛機再試`);
  cruise = null; cruiseSlot = -1; cruiseDest = null; cruiseRouteId = null;
  selectedRoute = null; selectedDest = null;
  cruiseOverlayEl.classList.remove('show');
  respawnAtRunway(slot); // 返回出發機場跑道（滿油；航線未點亮＝沒飛到）
}

/**
 * 巡航每物理步（cruiseSlot 專用）：climb 段照常飛（玩家爬升、偵測進雲）；cruise 段半自動快轉。
 * @param {number} i @param {import('./flight/flight-model.js').Input} input @returns {boolean} 是否已自處理（true → 略過一般物理）
 */
function updateCruiseStep(i, input) {
  if (!cruise) return false;
  const cs = stepCruise(cruise, { dt: DT, alt: states[i].pos.y, headingAdjust: input.r ?? 0 });
  if (cs.justEnteredCruise) { cruiseOverlayEl.classList.add('show'); toast(i, '☁️ 進入雲上巡航（自動快轉）'); audio.atcVoice('Climbing to cruise altitude. Enjoy the flight.'); }
  if (cs.justArrived) { arriveCruise(); return true; }
  if (cruise && cruise.phase === 'cruise') { // 半自動平飛快轉：玩家可微調航向
    // 油耗（只真實）：整條航線成本攤在巡航秒數上；航程不足 → 油盡 → 海上迫降返航（航程 gate 教學）。
    if (conseq[i].mode === 'real') {
      const fr = burn(fuel[i], routeFuelCostSec(cruise.distanceKm) * (DT / cruise.durationSec));
      if (!lowFuelWarned[i] && isLow(fuel[i])) { lowFuelWarned[i] = true; toast(i, '⛽ 巡航油量偏低！'); audio.stallWarn(); }
      if (fr.justEmptied) { ditchCruise(i); return true; }
    }
    stepPlane(states[i], { r: (input.r ?? 0) * 0.25, p: -0.015, th: 0.85, gearUp: true }, DT, env, flightParams(planeId));
    return true;
  }
  return false; // climb：讓一般 stepPlane 跑（玩家自己爬升上雲）
}

// —— 全圖選線 UI（台灣地圖＝地理教材；九機場真實相對位置）——
const routeMapEl = $('routeMap');
const routeMapSvg = $('routeMapSvg');
const routeListEl = $('routeList');
const routeDepartBtn = /** @type {HTMLButtonElement} */ ($('routeDepartBtn'));
const cruiseOverlayEl = $('cruiseOverlay');
let mapPendingDest = /** @type {string|null} */ (null); // 全圖上暫選的目的地（按出發才定）

const MAP_W = 100, MAP_H = 122;
// 台灣本島輪廓（lat,lng；順時針）——與機場同投影，地理相對位置正確（教材）。
const TAIWAN_OUTLINE = [
  [25.30, 121.54], [25.01, 122.01], [24.60, 121.87], [24.02, 121.62], [23.10, 121.40],
  [22.75, 121.16], [21.92, 120.86], [22.20, 120.63], [22.55, 120.30], [23.10, 120.10],
  [23.70, 120.13], [24.27, 120.50], [24.83, 120.93], [25.16, 121.28],
];

/** 繪製全圖（台灣輪廓 + 九機場 + 目前點/可飛點/鎖定點 + 暫選航線）。 */
function renderRouteMap() {
  const poly = TAIWAN_OUTLINE.map(([lat, lng]) => { const p = mapXY(lat, lng); return `${(p.x * MAP_W).toFixed(1)},${(p.y * MAP_H).toFixed(1)}`; }).join(' ');
  let svg = `<polygon points="${poly}" fill="#3a5a44" stroke="#7fc97f" stroke-width="0.7"/>`;
  // 暫選航線連線（目前機場 → 暫選目的地）
  if (mapPendingDest) {
    const a = mapXY(AIRPORTS[curAirportId].lat, AIRPORTS[curAirportId].lng);
    const b = mapXY(AIRPORTS[mapPendingDest].lat, AIRPORTS[mapPendingDest].lng);
    svg += `<line x1="${(a.x * MAP_W).toFixed(1)}" y1="${(a.y * MAP_H).toFixed(1)}" x2="${(b.x * MAP_W).toFixed(1)}" y2="${(b.y * MAP_H).toFixed(1)}" stroke="#f2b94b" stroke-width="0.8" stroke-dasharray="2 1.5"/>`;
  }
  const dests = new Set(routesFrom(curAirportId).map((r) => routeOtherEnd(r, curAirportId)));
  for (const id of AIRPORT_IDS) {
    const ap = AIRPORTS[id]; const p = mapXY(ap.lat, ap.lng);
    const cx = (p.x * MAP_W).toFixed(1); const cy = (p.y * MAP_H).toFixed(1);
    const isCur = id === curAirportId;
    const reachable = dests.has(id) && airportUnlocked(id);
    const locked = dests.has(id) && !airportUnlocked(id);
    const fill = isCur ? '#f2b94b' : reachable ? '#7fc97f' : locked ? '#6b7280' : '#2a3450';
    const r = isCur ? 2.6 : 2.0;
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="#1a2233" stroke-width="0.4"${(reachable || locked) ? ` data-dest="${id}" style="cursor:pointer"` : ''}/>`;
    if (reachable || locked) svg += `<circle cx="${cx}" cy="${cy}" r="5" fill="transparent" data-dest="${id}" style="cursor:pointer"/>`; // 大命中區
    svg += `<text x="${cx}" y="${(p.y * MAP_H - 3).toFixed(1)}" font-size="3.2" fill="#f2ead8" text-anchor="middle">${ap.name}${locked ? ' 🔒' : ''}</text>`;
  }
  routeMapSvg.innerHTML = svg;
  for (const el of routeMapSvg.querySelectorAll('[data-dest]')) {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-dest');
      if (!id) return;
      if (!airportUnlocked(id)) { mapPendingDest = null; renderRouteMap(); routeListEl.textContent = `🔒 ${AIRPORTS[id].name} 之後的版本開放（v5.1-2）`; routeDepartBtn.disabled = true; return; }
      mapPendingDest = id; renderRouteMap(); refreshRouteInfo();
    });
  }
  if (!mapPendingDest) refreshRouteInfo();
}

/** 更新暫選航線資訊（距離 + 出發按鈕）。 */
function refreshRouteInfo() {
  if (!mapPendingDest) {
    routeListEl.innerHTML = `📍 目前在 <b>${air.spec.name}</b>　點地圖上綠色機場選航線`;
    routeDepartBtn.disabled = true; return;
  }
  const km = routeDistanceKm(curAirportId, mapPendingDest);
  // 航程 gate：目前機種飛得到嗎（真實模式飛不到 → 油盡海上迫降；安全/溫和無限）。
  const reach = canReach(planeSpec(planeId).fuelSec, km);
  const fuelNote = reach ? '⛽ 油量足夠' : `⛽ <span style="color:#e0533d">這台飛機油可能不夠（換大油箱機種）</span>`;
  routeListEl.innerHTML = `🛫 <b>${air.spec.name}</b> → <b>${AIRPORTS[mapPendingDest].name}</b>　約 ${km} 公里<br/><small>${airportSpec(mapPendingDest).signature}　·　${fuelNote}</small>`;
  routeDepartBtn.disabled = false;
}

$('routeMapBtn').addEventListener('click', () => { mapPendingDest = null; renderRouteMap(); routeMapEl.classList.remove('hidden'); });
$('routeMapClose').addEventListener('click', () => routeMapEl.classList.add('hidden'));
routeDepartBtn.addEventListener('click', () => {
  if (!mapPendingDest) return;
  const r = routesFrom(curAirportId).find((rt) => routeOtherEnd(rt, curAirportId) === mapPendingDest);
  if (!r) return;
  selectedRoute = r; selectedDest = mapPendingDest;
  routeMapEl.classList.add('hidden');
  const driven = wasDriven.findIndex(Boolean);
  toast(driven >= 0 ? driven : 0, `🗺 航線設定：${air.spec.name} → ${AIRPORTS[selectedDest].name}。起飛後自動巡航！`);
});

/** 巡航 overlay HUD（進度條 + ETA + 目的地）每幀更新。 */
function updateCruiseHud() {
  if (!cruise) { if (cruiseOverlayEl.classList.contains('show')) cruiseOverlayEl.classList.remove('show'); return; }
  if (cruise.phase !== 'cruise') return; // climb 段不顯（玩家自己爬）
  cruiseOverlayEl.classList.add('show');
  const pct = Math.round(cruise.progress * 100);
  $('cruiseDest').textContent = `☁️ 雲上巡航　${air.spec.name} → ${airportSpec(cruiseDest ?? '').name}`;
  $('cruiseBarFill').style.width = `${pct}%`;
  $('cruiseEta').textContent = `${cruisePhaseLabel(cruise.phase)}　剩 ${cruiseEtaSec(cruise)} 秒`;
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
      dodge: !!(live.b & BTN.DODGE), confirm: !!(live.b & BTN.CONFIRM), // 翻滾閃避鍵 / 離場確認鍵
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
  Object.assign(states[i], makePlane(air.spawnPose(i)));
  planes[i].setDamaged(false);
  resetFuel(i); // 回跑道＝滿油（清熄火）
  if (departSlot === i) clearDeparture(); // 離場中墜機 → 收離場狀態（避免在跑道跑 pushback/taxi 邏輯）
  if (corridorSlot === i) clearCorridor();
  arrivalPhase = 'none'; arrivalExit = null; arrivalGate = null; gnGate = null;
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
  const terrain = air.terrainAt(s.pos.x, s.pos.z);
  let roadOk = false;
  if (terrain === TERRAIN.ROAD) { // 找所屬車道的最長直段（兩軸取長者）
    const sample = (/** @type {number} */ x, /** @type {number} */ z) => air.terrainAt(x, z);
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
    if (wasDriven[i] && states[i].mode === 'flying' && now >= pvpInvuln[i]) players.push({ slot: i, pos: states[i].pos, heading: states[i].heading, alive: true });
  }
  dogfight.setPlayers(players);
  // 敵機難度：難度曲線(波次) + adaptive 放水(近期勝負) + heuristic 地板（在 enemy-ai 內）
  if (dogfight.enemies.length) dogfight.setDifficulty(difficultyLevel(aiRound), adaptiveHandicap(aiResults));

  for (let i = 0; i < MAX_SLOTS; i++) {
    if (!wasDriven[i]) { prevSwitchBit[i] = false; prevDodgeBit[i] = false; continue; }
    // 冒煙暫退無敵期過了 → 清冒煙
    if (pvpSmoke[i] && now >= pvpInvuln[i]) { pvpSmoke[i] = false; planes[i].setDamaged(false); }
    const s = states[i];
    if (s.mode !== 'flying') { // 回到地面（機場附近）→ 補滿彈藥
      if (Math.hypot(s.pos.x, s.pos.z) < 2000) dogfight.reloadAll(i);
      prevSwitchBit[i] = false; prevDodgeBit[i] = false;
      continue;
    }
    const inp = lastInputs[i];
    if (inp.weaponSwitch && !prevSwitchBit[i]) toast(i, `🔁 ${dogfight.cycleWeapon(i)}`); // 換武器（上升緣循環）
    prevSwitchBit[i] = !!inp.weaponSwitch;
    // 翻滾閃避（上升緣觸發、冷卻內忽略）：拔掉咬著自己的飛彈鎖 + 視覺滾筒翻 + 橫向 jink。
    if (inp.dodge && !prevDodgeBit[i] && dodgeReady(dodges[i], now)
        && triggerDodge(dodges[i], now, (inp.r ?? 0) >= 0 ? 1 : -1)) {
      dogfight.breakLocksOn(i); audio.whoosh(); net.sendFx(i, 'bump'); toast(i, '🌀 翻滾閃避！');
    }
    prevDodgeBit[i] = !!inp.dodge;
    // 閃避窗內：持續拔鎖（剛射出的也甩掉）+ 朝側向 jink 一小段（真的閃開一截）。
    if (dodging(dodges[i], now)) {
      dogfight.breakLocksOn(i);
      const j = dodges[i].dir * DODGE.JINK_MPS * DT;
      s.pos.x += Math.cos(s.heading) * j;
      s.pos.z += Math.sin(s.heading) * j;
    }
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

let lastAtc = ''; // ATC 文字變更偵測（無線電音效只在內容變時響，不每幀）
/** @param {string} text ATC 文字框架（空＝隱藏） @param {boolean} [radio] 內容變更時播塔台無線電「咔」 */
function setAtc(text, radio = false) {
  const el = $('atcBanner');
  el.textContent = text;
  el.classList.toggle('show', !!text);
  if (radio && text && text !== lastAtc) audio.atcRadio(); // v4.1-2 柔和無線電咔（語音改各階段轉換用英文念，見 atcSay）
  lastAtc = text;
}

/** 該 slot 的出生姿態：ATR（民航）＝離場登機門（spawn-at-gate）；T-34C/F-16＝跑道頭（快起飛）。 @param {number} slot */
function spawnFor(slot) {
  if (isCivil(planeId)) {
    const g = taxi.nodes.get(DEPART_GATES[slot] ?? DEPART_GATES[0]);
    if (g) { const pose = gateParkPose(/** @type {any} */ (g), RWDIR); return { x: pose.x, z: pose.z, heading: pose.heading }; }
  }
  return air.spawnPose(slot);
}

/** 啟動離場流程（ATR spawn-at-gate 後）：登機階段起；與到場互斥。 @param {number} slot */
function startDeparture(slot) {
  departPhase = 'boarding'; departSlot = slot;
  departGate = DEPART_GATES[slot] ?? DEPART_GATES[0];
  boardT = 0; pushT = 0; pushPath = null; holdT = 0; boardReady = false; pendingConfirm = false;
  arrivalPhase = 'none'; arrivalExit = null; arrivalGate = null; gnGate = null;
}

/** 地面 ModeSlot 提示文字：離場 slot 顯示當前離場階段引導，否則「推滿油門起飛」。 @param {number} i */
function departHintFor(i) {
  if (i !== departSlot || departPhase === 'none') return '🛫 推滿油門起飛！';
  switch (departPhase) {
    case 'boarding': return boardReady ? '✅ 確認後推（按 Enter／手機鈕）' : '🛫 登機中…請稍候';
    case 'pushback': return '🚜 後推中…引導車推飛機';
    case 'taxiOut': return '🟢 跟綠燈滑到跑道頭';
    case 'holdShort': return '⏳ 等待點等待起飛許可';
    default: return '🛫 推滿油門起飛！'; // cleared
  }
}

/** 結束離場流程（起飛/換機/重生）。 */
function clearDeparture() {
  departPhase = 'none'; departGate = null; departSlot = -1; pushPath = null; boardReady = false;
  groundService.clear();
  if (departKeysActive) { departKeysActive = false; net.sendMode(playMode); } // 還原遙控器 context 鍵
}

/** 起飛後啟動空中走廊（離場爬升→下風→進場下降，一趟完整航班空中段）。 @param {number} slot */
function startDepartCorridor(slot) {
  corridorActive = true; corridorSlot = slot; corridorIdx = 0;
  corridorPts = patternPoints(RWDIR);
}

/** 收空中走廊（落地/換機/重生）。 */
function clearCorridor() { corridorActive = false; corridorSlot = -1; corridorIdx = 0; corridorMarkers.clear(); }

/**
 * 空中走廊每幀：airborne ATR → 推進航點、放穿越環、ATC 指引（離場/近場/進場）。
 * 末點＝跑道頭，飛到低空 → 由 flight-model 接地 → justLanded 接到場地面鏈。
 * @param {number} now
 */
function updateAirCorridor(now) {
  if (!(corridorActive && isCivil(planeId) && (playMode === 'free' || playMode === 'mission'))) {
    if (corridorActive) clearCorridor();
    return;
  }
  if (corridorSlot < 0 || !wasDriven[corridorSlot] || states[corridorSlot].mode !== 'flying') {
    corridorMarkers.update(DT); return; // 地面（剛起飛前/落地後）：環不推進
  }
  const p = states[corridorSlot].pos;
  const prevIdx = corridorIdx;
  corridorIdx = advanceCorridor(corridorPts, p, corridorIdx);
  corridorMarkers.show(corridorPts, corridorIdx);
  corridorMarkers.update(DT);
  setAtc(corridorAtc(corridorPts[corridorIdx]), true); // 航點變更時響無線電（每 leg）
  if (corridorIdx !== prevIdx) audio.atcVoice(CORRIDOR_VOICE[corridorPts[corridorIdx]?.leg] ?? ''); // 進新航點 → 念英文指引
}

/** 開始後推（pushback）：scripted 把飛機從 gate 推到 apron 接點、轉向 taxi 方向。 @param {number} slot */
function startPushback(slot) {
  departPhase = 'pushback'; pushT = 0; boardReady = false;
  const path = departGate ? departureRoute(taxi, departGate, DEPART_RWY) : []; // [gate, apron, parallel, …, hold]
  const apron = path[1] ? taxi.nodes.get(path[1]) : null;
  const next = path[2] ? taxi.nodes.get(path[2]) : null;
  const from = { x: states[slot].pos.x, z: states[slot].pos.z };
  const to = apron ? nodeWorld(/** @type {any} */ (apron), RWDIR) : from;
  let h1 = states[slot].heading;
  if (apron && next) {
    const aW = nodeWorld(/** @type {any} */ (apron), RWDIR);
    const nW = nodeWorld(/** @type {any} */ (next), RWDIR);
    h1 = Math.atan2(nW.x - aW.x, -(nW.z - aW.z)); // forward={sin h,-cos h} → 朝下一節點
  }
  pushPath = { from, to, h0: states[slot].heading, h1 };
  if (departKeysActive) { departKeysActive = false; net.sendMode(playMode); } // 確認完成 → 遙控器還原
  toast(slot, '🚜 開始後推（pushback）！');
  audio.atcVoice('Pushback approved. Stand by for taxi.');
}

/** 越界偵測（taxi 速度域、route 顯示時）：偏離綠線太遠 → 真實 damagePct、安全/溫和提示。 */
function checkTaxiOff(/** @type {number} */ slot, /** @type {{x:number,z:number}} */ p, /** @type {number} */ now) {
  const off = groundNav.offRouteDistance(p);
  if (off > TAXI_OFF_M && now > taxiOffCd[slot]) {
    taxiOffCd[slot] = now + 1500;
    lastTaxiOff = { slot, off: Math.round(off), at: now };
    if (conseq[slot].mode === 'real') applyWeatherDamage(slot, TAXI_OFF_PCT, '滑行偏離');
    else { toast(slot, '🚧 偏離滑行道，回到綠線！'); net.sendFx(slot, 'bump'); }
  }
}

/**
 * 地面導航分派（v4.1-1）：民航機(ATR-72) 地面 → 離場流程（spawn-at-gate→登機→後推→taxi→排序→起飛）
 * 或 到場流程（落地→脫離→指派門→停妥靠橋）。離場與到場互斥。離地/換非民航機 → 收起。
 * @param {number} now
 */
function updateGroundNav(now) {
  if (!(isCivil(planeId) && (playMode === 'free' || playMode === 'mission'))) {
    if (groundNav.active) groundNav.clear();
    if (departPhase !== 'none') clearDeparture();
    arrivalPhase = 'none'; arrivalExit = null; arrivalGate = null; gnGate = null; setAtc('');
    return;
  }
  // 離場流程（綁 departSlot，地面期間；taxiOut 內自帶越界）
  if (departPhase !== 'none' && departSlot >= 0 && wasDriven[departSlot] && states[departSlot].mode !== 'flying') {
    updateDeparture(departSlot, now, states[departSlot].pos);
    return;
  }
  // 到場流程 / 閒置：scan 第一架地面 ATR
  let slot = -1;
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (wasDriven[i] && states[i].mode !== 'flying' && Math.hypot(states[i].pos.x, states[i].pos.z) < 3500) { slot = i; break; }
  }
  if (slot < 0) {
    if (groundNav.active) groundNav.clear();
    arrivalPhase = 'none'; arrivalExit = null; arrivalGate = null; gnGate = null; setAtc('');
    return;
  }
  const p = states[slot].pos;
  if (arrivalPhase !== 'none') { updateArrival(slot, now, p); checkTaxiOff(slot, p, now); }
  else { if (groundNav.active) groundNav.clear(); setAtc(''); } // 閒置 ATR 在地面（如墜機後重生）：無導航（不再 buggy 導最近門）
}

/** 到場流程：落地→脫離(P1)→指派門(P2)→停妥靠橋(P3)。 @param {number} slot @param {number} now @param {{x:number,z:number}} p */
function updateArrival(slot, now, p) {
  const gateLabel = taxi.nodes.get(arrivalGate ?? '')?.label ?? '登機門';
  // P3 停妥判定：taxi 階段 + 在指派門框內 + 朝向對 + 速度≈0 → 停妥靠橋（一次性）。
  if (arrivalPhase === 'taxi' && arrivalGate) {
    const gNode = taxi.nodes.get(arrivalGate);
    if (gNode && isParkedAtGate(states[slot], /** @type {any} */ (gNode), RWDIR)) {
      arrivalPhase = 'parked';
      groundNav.clear();
      const gateW = nodeWorld(/** @type {any} */ (gNode), RWDIR);
      const termDir = { x: RWDIR.z, z: -RWDIR.x }; // 朝航廈（−lateral）
      groundNav.dock({ x: gateW.x + termDir.x * BRIDGE_LEN, z: gateW.z + termDir.z * BRIDGE_LEN }, gateW);
      toast(slot, `🛬 停妥靠橋！歡迎抵達松山 ${gNode.label ?? ''}`);
      audio.landingChime();
      setAtc(atcDocked(gNode.label ?? '登機門'), true);
      audio.atcVoice('Welcome to Songshan. See you next time.');
    }
  }
  if (arrivalPhase === 'parked') { groundNav.update(DT, p, now); return; } // 停妥：僅跑空橋動畫，ATC 維持「已靠橋」
  if (arrivalPhase === 'exit' && arrivalExit) { // P1：脫離跑道
    const exitNode = taxi.nodes.get(arrivalExit);
    const exitW = exitNode ? nodeWorld(/** @type {any} */ (exitNode), RWDIR) : null;
    if (exitW && Math.hypot(exitW.x - p.x, exitW.z - p.z) < ARRIVAL_REACH_M) {
      arrivalPhase = 'taxi'; gnGate = null;
    } else if (exitW && (!groundNav.active || gnGate !== arrivalExit)) {
      gnGate = arrivalExit;
      const par = exitParallel(taxi, arrivalExit);
      const parW = par ? nodeWorld(/** @type {any} */ (taxi.nodes.get(par)), RWDIR) : null;
      const route = [{ x: p.x, z: p.z }, exitW, ...(parW ? [parW] : [])];
      groundNav.setRoute(route, atcExit(exitNode?.label ?? '脫離道', gateLabel));
      audio.atcVoice('Vacate the runway. Taxi to your gate, follow the green lights.');
    }
  } else if (arrivalPhase === 'taxi' && (!groundNav.active || gnGate == null)) { // P2：滑到「指派」門
    gnGate = arrivalGate;
    const start = nearestNode(taxi, p, RWDIR);
    const path = start && gnGate ? arrivalRoute(taxi, start, gnGate) : [];
    const lbl = gnGate ? atcTaxiToGate(gateLabel) : '';
    const pts = routeWorldPoints(taxi, path, RWDIR);
    groundNav.setRoute(pts.length ? [{ x: p.x, z: p.z }, ...pts] : pts, lbl);
    audio.atcVoice('Taxi to your gate. Follow the green lights to the bridge.');
  }
  groundNav.update(DT, p, now);
  setAtc(groundNav.atcText, true);
}

/** 離場流程：登機→後推→taxi 到跑道頭→起飛排序→可起飛。 @param {number} slot @param {number} now @param {{x:number,z:number}} p */
function updateDeparture(slot, now, p) {
  const gLabel = taxi.nodes.get(departGate ?? '')?.label ?? '登機門';
  const rwyLabel = DEPART_RWY === 'r28' ? 'RWY 28' : 'RWY 10';
  if (departPhase === 'boarding') {
    if (groundNav.active) groundNav.clear();
    groundService.showBoarding(states[slot].pos, states[slot].heading, RWDIR); // 加油/行李車
    boardT += DT;
    if (boardT >= BOARD_SEC) {
      if (!boardReady) { boardReady = true; departKeysActive = true; net.sendMode('depart'); audio.atcVoice('Boarding complete. Request pushback. Press confirm.'); } // 遙控器換「確認後推」鍵
      setAtc(atcBoardComplete(gLabel), true);
      if (pendingConfirm || boardT >= BOARD_SEC + 8) { pendingConfirm = false; startPushback(slot); } // 確認或逾時自動
    } else {
      setAtc(atcBoarding(gLabel, Math.floor((boardT / BOARD_SEC) * 72))); // 計數器：不響無線電（避免每幀咔）
    }
    return;
  }
  if (departPhase === 'pushback') {
    if (groundNav.active) groundNav.clear();
    pushT = Math.min(1, pushT + DT / PUSH_SEC);
    groundService.showTug(states[slot].pos, states[slot].heading); // 拖車在機鼻推
    if (pushPath) { // scripted 後推：位置/朝向 smoothstep 插值
      const e = pushT * pushT * (3 - 2 * pushT);
      states[slot].pos.x = pushPath.from.x + (pushPath.to.x - pushPath.from.x) * e;
      states[slot].pos.z = pushPath.from.z + (pushPath.to.z - pushPath.from.z) * e;
      const dh = Math.atan2(Math.sin(pushPath.h1 - pushPath.h0), Math.cos(pushPath.h1 - pushPath.h0));
      states[slot].heading = wrapAngle(pushPath.h0 + dh * e);
      states[slot].speed = 0; states[slot].mode = 'rolling';
    }
    setAtc(atcPushback(gLabel), true);
    if (pushT >= 1) { departPhase = 'taxiOut'; gnGate = null; groundService.clear(); } // 後推完成 → 收地勤車
    return;
  }
  if (departPhase === 'taxiOut') {
    const holdId = DEPART_RWY === 'r28' ? 'h28' : 'h10';
    const holdNode = taxi.nodes.get(holdId);
    const holdW = holdNode ? nodeWorld(/** @type {any} */ (holdNode), RWDIR) : null;
    if (holdW && Math.hypot(holdW.x - p.x, holdW.z - p.z) < ARRIVAL_REACH_M) {
      departPhase = 'holdShort'; holdT = 0; groundNav.clear();
      audio.atcVoice('Hold short runway one zero. One aircraft ahead departing.');
    } else if (!groundNav.active || gnGate !== holdId) {
      gnGate = holdId;
      const start = nearestNode(taxi, p, RWDIR);
      const path = start ? departureRoute(taxi, start, DEPART_RWY) : [];
      const pts = routeWorldPoints(taxi, path, RWDIR);
      groundNav.setRoute(pts.length ? [{ x: p.x, z: p.z }, ...pts] : pts, atcTaxiToHold(rwyLabel));
      audio.atcVoice('Taxi to runway one zero holding point. Follow the green lights.');
    }
    groundNav.update(DT, p, now);
    setAtc(groundNav.atcText, true);
    checkTaxiOff(slot, p, now); // 離場 taxi 也吃越界
    return;
  }
  if (departPhase === 'holdShort') {
    if (groundNav.active) groundNav.clear();
    holdT += DT;
    if (holdT < SEQ_SEC) setAtc(atcHoldShort(rwyLabel), true);
    else {
      departPhase = 'cleared'; gnGate = null;
      setAtc(atcCleared(rwyLabel), true);
      toast(slot, '🛫 可以起飛了！推滿油門'); audio.landingChime();
      audio.atcVoice('Little Pilot, runway one zero, cleared for takeoff.');
    }
    return;
  }
  if (departPhase === 'cleared') { // 進跑道、對正、推油門（綠線帶上跑道並沿跑道；起飛偵測在 justTookOff）
    if (!groundNav.active || gnGate !== 'TKOF') {
      gnGate = 'TKOF';
      const r10W = nodeWorld(/** @type {any} */ (taxi.nodes.get('r10')), RWDIR);
      const r28W = nodeWorld(/** @type {any} */ (taxi.nodes.get('r28')), RWDIR);
      groundNav.setRoute([{ x: p.x, z: p.z }, r10W, r28W], atcCleared(rwyLabel));
    }
    groundNav.update(DT, p, now);
    setAtc(groundNav.atcText, true); // 進跑道中不做越界（離開等待點上跑道）
  }
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
      if (engineOut[i]) input.th = 0; // V5 油盡熄火：引擎死、推力 0 → 滑翔迫降（接 v1.1-2）
      input.landAnywhere = conseq[i].mode === 'real'; // 真實模式：機場外可迫降
      if (conseq[i].mode === 'real' && states[i].mode === 'flying') { // v3.0-2 側風/亂流（只真實模式）
        const wf = weatherForces(weather.type);
        if (wf.windSpeed > 0) input.wind = windVec(wf.windSpeed);
        if (wf.turb > 0) input.gust = gustAt(now / 1000, wf.turb);
      }
      lastInputs[i] = input;
      if (input.confirm) pendingConfirm = true; // v4.1-1 離場確認閂鎖（脈衝可能被某 sub-step 取走，這裡 latch）
      // V5 航線巡航：cruiseSlot 在 cruise 段＝半自動快轉（略過一般物理/碰撞）；climb 段照常飛（玩家爬升上雲）。
      if (cruise && i === cruiseSlot && updateCruiseStep(i, input)) continue;
      const prev = { ...states[i].pos };
      stepPlane(states[i], input, DT, env, flightParams(planeId)); // 機型手感（T-34C 缺省＝位元不變）
      if (states[i].justForcedTouch) { handleForcedLanding(i, now); continue; }
      const hit = collidePlane(states[i], prev, air.solidAt);
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
      if (states[i].justStall && now > stallWarnCd[i]) { // v4 失速：警告 + 失速喇叭（壓低機頭/補油門找回速度）
        stallWarnCd[i] = now + 2500;
        toast(i, '⚠️ 失速！壓低機頭、補油門');
        audio.stallWarn();
      }
      if (states[i].justTookOff) {
        toast(i, '起飛！✈️');
        // V5 航線飛行：起飛時若已選定航線 → 進雲上巡航（任何機種；取代本場 traffic pattern）。
        if (selectedRoute && cruiseSlot < 0) beginCruise(i);
        // 否則民航機起飛接本場空中走廊（HITL 2026-06-20：確保空中指引一定出現）。
        else if (isCivil(planeId)) { clearDeparture(); startDepartCorridor(i); }
      }
      if (states[i].justLanded) {
        toast(i, '降落成功！👏'); audio.landingChime();
        if (lastFlight) { toast(i, `🛬 航班完成！載客 ${lastFlight.pax} 人・準點抵達 ⭐`); audio.missionSuccess(); lastFlight = null; } // V5 載客+準點結算
        // v4.0-2 到場流程啟動：民航機落地 → 塔台指派 gate（P2）+ 進「脫離跑道」階段（P1）。
        if (isCivil(planeId)) {
          clearDeparture(); clearCorridor(); // 落地＝到場：清離場/空中走廊（避免殘留擋住到場流程）
          const fwd = { x: Math.sin(states[i].heading), z: -Math.cos(states[i].heading) };
          arrivalExit = selectArrivalExit(taxi, states[i].pos, fwd, RWDIR);
          arrivalGate = assignArrivalGate(taxi, arrivalSeq++); // P2 塔台指派（輪派）
          arrivalPhase = arrivalExit ? 'exit' : 'taxi';
          gnGate = null; // 強制重算導航路線（脫離道優先）
          const gLbl = taxi.nodes.get(arrivalGate ?? '')?.label ?? '登機門';
          toast(i, `🗼 塔台指派 ${gLbl}`); // 落地即告知目的地門
        }
        if (playMode === 'mission') handleRunnerEvent(i, runner.notify(i, 'landed_runway', { x: states[i].pos.x, z: states[i].pos.z }));
        // v3.0-2 側風劣質著陸：偏離跑道中線/接地過快 → 受損%（真實模式 + 有風才咬）
        if (conseq[i].mode === 'real' && weatherForces(weather.type).windSpeed > 0) {
          const offsetM = Math.abs(states[i].pos.x * (-RWDIR.z) + states[i].pos.z * RWDIR.x); // 離跑道中線橫距
          applyWeatherDamage(i, crosswindDamagePct({ offsetM, speedMps: states[i].speed }), '側風');
        }
      }
      // v3.0-2 亂流甩出安全包絡 → 受損%（冷卻避免每幀累加；台北輕、磁吸多半接住）
      if (conseq[i].mode === 'real' && states[i].mode === 'flying' && now > windDamageCd[i] && weatherForces(weather.type).turb > 0) {
        const pct = turbulenceDamagePct({ bank: states[i].bank, pitch: states[i].pitch });
        if (pct > 0) { windDamageCd[i] = now + 1200; applyWeatherDamage(i, pct, '亂流'); }
      }
      // V5 油量（本地飛行；只真實模式咬，安全/溫和不耗）：耗油 → 油低警告 → 油盡熄火接迫降。
      if (conseq[i].mode === 'real' && states[i].mode === 'flying' && !engineOut[i]) {
        const fr = burn(fuel[i], DT * burnRate(input.th));
        if (!lowFuelWarned[i] && isLow(fuel[i])) { lowFuelWarned[i] = true; toast(i, '⛽ 油量偏低！快找機場降落'); audio.stallWarn(); net.sendFx(i, 'bump'); }
        if (fr.justEmptied) { engineOut[i] = true; toast(i, '⛽ 沒油了！引擎熄火，找地方迫降 🛬'); audio.heartLoss(); net.sendFx(i, 'bump'); }
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
  // 鏡頭距離隨機體大小（大機把鏡頭往後/上拉，避免鑽進機身）：ATR(27)→1、A330(50)→~1.8、voxel→1。
  const _m = planeSpec(planeId).model;
  const camScale = Math.max(1, (isGlbModel(_m) ? _m.lengthM : 12) / 28);
  const views = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (!wasDriven[i]) continue;
    planes[i].rollSpin = playMode === 'dogfight' ? dodgeRoll(dodges[i], now) : 0; // 翻滾閃避視覺
    planes[i].sync(states[i], lastInputs[i].th, frame, env.groundY);
    // 亂流鏡頭微晃（只真實模式 + 設定開；安全/溫和或關閉＝0 完全不晃，減暈）
    const shake = (conseq[i].mode === 'real' && settings.camShake && states[i].mode === 'flying') ? weatherForces(weather.type).turb : 0;
    cams[i].update(states[i], frame, shake, camScale);
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
      let altText = `⛰ ${Math.round(s.pos.y)}m　💨 ${Math.round(s.speed * 3.6)}`;
      if (conseq[i].mode === 'real') { // v3.0-2 風向指示（真實模式有風才顯）：箭頭指風來向（相對機頭）
        const wf = weatherForces(weather.type);
        if (wf.windSpeed > 0) {
          const rel = wrapAngle((WIND_FROM_DEG * Math.PI) / 180 - s.heading);
          altText += `　🌬<span class="t-arrow" style="transform:rotate(${rel}rad)">⬆️</span>${wf.windSpeed}`;
        }
      }
      // V5 油量表：真實＝剩餘%（≤20% 紅字警示）；安全/溫和＝∞（寬鬆）。
      altText += conseq[i].mode === 'real'
        ? `　<span style="color:${isLow(fuel[i]) ? '#e0533d' : 'inherit'}">⛽${Math.round(fuelFrac(fuel[i]) * 100)}%</span>`
        : '　⛽∞';
      hud.setAlt(i, altText);
    } else {
      hud.setMode(i, departHintFor(i)); // 離場流程相關提示（登機/確認後推/滑行…），否則「推滿油門起飛」
      hud.setAlt(i, ''); // 地面上隱藏高度帶
    }
    // 回家箭頭：飛離機場 >900m 才出現；箭頭 = 機場方位相對機頭的夾角
    const dist = Math.hypot(s.pos.x, s.pos.z);
    if (s.mode === 'flying' && dist > 900) {
      const bearingHome = Math.atan2(-s.pos.x, s.pos.z); // 朝原點（目前機場）的 heading
      const rel = wrapAngle(bearingHome - s.heading);     // 0 = 正前方
      hud.setHome(i, rel, `${air.spec.name} ${(dist / 1000).toFixed(1)}km`);
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
  updateCruiseHud(); // V5 雲上巡航 overlay（進度/ETA/目的地）
  updateGroundNav(now); // V4 地面導航（ATR 在地面 → 跟我車/綠中線燈/ATC 文字）
  updateAirCorridor(now); // V4.1 空中走廊（ATR 空中 → 離場/進場穿越環 + ATC）
  if (playMode === 'race') raceMarkers.pulse(now / 1000); // 賽道輕微脈動（好找）
  const wfi = wasDriven.findIndex(Boolean); // 天氣：雨跟著首架在線飛機（否則機場上空）
  weatherRenderer.update(frame, wfi >= 0 ? states[wfi].pos : { x: 0, y: 300, z: 0 });
  airportLife.update(frame, (WIND_FROM_DEG * Math.PI) / 180, weatherForces(weather.type).windSpeed); // 雷達轉 + 風向袋對風
  refreshMissionWeather(); // 天氣挑戰任務覆寫天氣（只在變更時重套）

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
  get weather() { return weather.type; }, // v3.0-1 e2e/dev
  setWeather: (/** @type {string} */ t) => { weather.type = t; applyEnv(); },
  rollWeather: () => { rollAndApplyWeather(); return weather.type; },
  weatherRenderer, // e2e：驗 fog 被天氣 modulate
  lastInputs, // v3.0-2 e2e：驗側風 wind 有餵進輸入
  get timeOfDay() { return dayNight.time; }, // v3.0-3 e2e/dev
  setTimeOfDay: (/** @type {string} */ t) => { if (TIMES_OF_DAY.includes(/** @type {any} */ (t))) { dayNight.time = t; applyEnv(); } },
  airportLife, // e2e：驗夜燈/擺件
  setPlayMode: (/** @type {string} */ m) => applyPlayMode(m),
  get planeGlbLoaded() { return planes.map((p) => !!(/** @type {any} */ (p)._glbRoot)); }, // v4.0-1 e2e：GLB 機體載入完成
  groundNav, // v4.0-1 P3 e2e/dev：地面導航（active/route/ATC）
  taxiway: taxi, // v4.0-1 e2e/dev：滑行道 graph
  get lastTaxiOff() { return lastTaxiOff; }, // v4.0-1 P4 e2e/dev：最近一次越界事件
  get arrival() { return { phase: arrivalPhase, exit: arrivalExit, gate: arrivalGate, seq: arrivalSeq }; }, // v4.0-2 P1/P2 e2e/dev
  get departure() { return { phase: departPhase, gate: departGate, slot: departSlot, boardReady, pushT }; }, // v4.1-1 e2e/dev
  get corridor() { const w = corridorPts[corridorIdx]; return { active: corridorActive, idx: corridorIdx, n: corridorPts.length, leg: w?.leg ?? null, target: w ? { x: w.x, z: w.z, alt: w.alt } : null }; }, // v4.1 空中走廊 e2e/dev
  confirmDeparture() { pendingConfirm = true; }, // v4.1-1 e2e/dev：模擬遙控器/Enter 確認
  setDogfightMode: (/** @type {string} */ m) => { dogfightMode = m; },
  setPlane: (/** @type {string} */ id) => setPlane(id),
  flightParams: (/** @type {string} */ id) => flightParams(id ?? planeId),
  dogfight, // v2.0-2 e2e/dev：戳武器/彈藥/分數/氣球/彈丸狀態
  dodges, // v3 e2e/dev：翻滾閃避狀態
  isDodging: (/** @type {number} */ slot) => dodging(dodges[slot], performance.now()), // v3 e2e：是否在閃避窗
  breakLocks: (/** @type {number} */ slot) => dogfight.breakLocksOn(slot),
  terrainAt: (/** @type {number} */ x, /** @type {number} */ z) => air.terrainAt(x, z),
  // e2e/dev：直接完成當前任務（略過飛到定點），驗任務迴圈 + 收集 + 慶祝
  completeMission: (/** @type {number} */ slot) => {
    const ev = runner.devComplete(slot, { x: states[slot].pos.x, z: states[slot].pos.z });
    handleRunnerEvent(slot, ev);
    return ev;
  },
  get drawCalls() { return vr.info.render.calls; },
  // —— V5 航網 e2e/dev hooks ——
  get curAirport() { return curAirportId; },
  get airportName() { return air.spec.name; },
  loadAirport: (/** @type {string} */ id) => loadAirport(id),
  selectRoute: (/** @type {string} */ destId) => { // 直接設定航線（略過全圖點擊）
    const r = routesFrom(curAirportId).find((rt) => routeOtherEnd(rt, curAirportId) === destId);
    if (r) { selectedRoute = r; selectedDest = destId; }
    return !!r;
  },
  get cruise() { return cruise ? { phase: cruise.phase, progress: cruise.progress, dest: cruiseDest, routeId: cruiseRouteId } : null; },
  get selectedDest() { return selectedDest; },
  get lastRouteFlown() { return lastRouteFlown; },
  get fuel() { return fuel.map((f) => fuelFrac(f)); }, // v5.0-2 e2e：油量比例
  get engineOut() { return [...engineOut]; },
  setFuel: (/** @type {number} */ slot, /** @type {number} */ frac) => { if (fuel[slot]) { fuel[slot].sec = fuel[slot].max * frac; lowFuelWarned[slot] = false; } }, // e2e：設定油量
  canReachDest: (/** @type {string} */ destId) => canReach(planeSpec(planeId).fuelSec, routeDistanceKm(curAirportId, destId)), // e2e：航程 gate
  arriveNow: () => { if (cruise) { cruise.phase = 'cruise'; cruise.progress = 1; cruise.elapsed = cruise.durationSec; arriveCruise(); } }, // e2e：快轉巡航抵達
  airports: AIRPORTS,
};
