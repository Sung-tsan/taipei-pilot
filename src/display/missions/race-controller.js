// @ts-check
// 競速控制器（維度 10 拆檔 first pass）：main.js 抽出的競速 glue —— 賽道建置、進/離、
// 每步計時/穿圈/名次、完賽收集簿、HUD 計分卡。行為與 main.js 內嵌版完全一致（純搬家）。
// 規則核心在 race.js（純邏輯、vitest 直測）；視覺在 race-markers.js；紀錄在 race-records.js。
// raceType（rings/landmark）是玩法選單的 seam、留在 main.js，這裡以 getter 注入。
import { RACE_TYPES, makeRace, updateRacer, ranking, allFinished } from './race.js';
import { courseKey, loadRaceRecords, saveRaceRecords, recordRaceRun } from './race-records.js';
import { RaceMarkers } from './race-markers.js';
import { ringsAlongRiver } from './missions.js';
import { wrapAngle } from '../../lib/math.js';

export const RACE_LABELS = /** @type {Record<string,string>} */ ({ landmark: '🟢 地標衝刺', rings: '🌊 河谷穿圈' });
const RACE_RING_Y = 250, RACE_RING_R = 95;

/**
 * @typedef {Object} RaceDeps
 * @property {Map<string, any>} lmById 地標 id → 地標（目前機場）
 * @property {Map<string, import('../scene/rivers.js').River>} riverByName 河名 → 河
 * @property {import('../scene/rivers.js').River[]} rivers 全部河（fallback 用）
 * @property {import('../audio.js').GameAudio} audio
 * @property {(slot:number, text:string)=>void} toast
 * @property {import('../flight/flight-model.js').PlaneState[]} states
 * @property {boolean[]} wasDriven
 * @property {number} maxSlots
 * @property {() => import('../scene/airport-scene.js').AirportScene} getAir 目前機場場景（landmark fallback）
 * @property {() => string} getCurAirportId 目前機場 id（收集簿 courseKey）
 * @property {() => string} getRaceType 目前賽道型（rings/landmark）
 */

// —— 競速（v2.1-1）：兩型（穿圈航線 / 地標衝刺）+ 起點/終點視覺（HITL #4）——
export class RaceController {
  /** @param {import('three').Scene} scene @param {RaceDeps} deps */
  constructor(scene, deps) {
    this.deps = deps;
    /** 賽道視覺標記（起點閘門 + 航圈；e2e 戳 rings/startMesh） */
    this.markers = new RaceMarkers(scene);
    /** @type {ReturnType<typeof makeRace>|null} */ this.race = null;
    this.celebrated = false;          // 全員完賽一次性 banner
    this.records = loadRaceRecords(); // v5.2 競速收集簿：per 賽道最佳成績（雙人共享）
    /** 競速賽道目標座標（給導引箭頭）：rings→course.rings；landmark→target */
    /** @type {{x:number,z:number}[]} */ this.waypoints = [];
  }

  /** 依 raceType 產生賽道（race.js course + 視覺 waypoints + 起點）。 @param {string} type */
  buildCourse(type) {
    const d = this.deps;
    const start = { x: 0, z: 0, y: 80 };
    if (type === 'landmark') {
      const lm = d.lmById.get('taipei101') ?? d.getAir().landmarks[0]; // 地標衝刺：飛到 101（或第一個地標）
      const target = { x: lm.x, z: lm.z, r: 140 };
      this.waypoints = [{ x: lm.x, z: lm.z }];
      return { race: makeRace(RACE_TYPES.LANDMARK, [0, 1], { target }), waypoints: [{ x: lm.x, z: lm.z, y: RACE_RING_Y, r: 140 }], start };
    }
    // 穿圈航線：沿一條河佈 4 圈（風景航線）
    const river = d.riverByName.get('基隆河') ?? d.rivers[0];
    const pts = ringsAlongRiver(river.points, 4).map((p) => ({ x: p.x, z: p.z, r: RACE_RING_R }));
    this.waypoints = pts.map((p) => ({ x: p.x, z: p.z }));
    return {
      race: makeRace(RACE_TYPES.RING_ROUTE, [0, 1], { rings: pts }),
      waypoints: pts.map((p) => ({ x: p.x, z: p.z, y: RACE_RING_Y, r: p.r })),
      start,
    };
  }

  /** 進/離競速：建/清賽道 + race 狀態。 @param {boolean} on */
  setActive(on) {
    if (on) {
      const built = this.buildCourse(this.deps.getRaceType());
      this.race = built.race;
      this.markers.build(built.waypoints, built.start);
      this.celebrated = false;
    } else {
      this.race = null;
      this.markers.clear();
    }
  }

  /** 競速每步：起飛即各自開始計時 → 依序穿圈/到終點 → 名次（落後不淘汰、完賽都報名次）。 @param {number} now */
  update(now) {
    const d = this.deps;
    const r = this.race;
    if (!r) return;
    for (let i = 0; i < d.maxSlots; i++) {
      if (!d.wasDriven[i]) continue;
      const racer = r.racers[i];
      if (!racer) continue;
      const s = d.states[i];
      if (!racer.started && s.mode === 'flying') { racer.started = true; racer.startAt = now; d.toast(i, '🏁 出發！'); } // 各自獨立計時
      if (!racer.started || racer.finished) continue;
      const ev = updateRacer(r, i, { x: s.pos.x, z: s.pos.z }, now);
      if (!ev) continue;
      if (ev.type === 'ring') { d.audio.lockTone(); d.toast(i, `✅ 第 ${ev.ringIndex} 圈！`); }
      else if (ev.type === 'finish') this.handleFinish(i, ev.finishTime);
    }
    const maxPassed = Math.max(0, ...r.slots.map((sl) => r.racers[sl]?.ringIndex ?? 0)); // 過圈淡化用領先進度
    this.markers.setProgress(maxPassed);
  }

  /** 完賽：報名次（友善＝落後也有名次）＋收集簿記最佳成績；全員完賽放煙火。 @param {number} i @param {number} finishTime */
  handleFinish(i, finishTime) {
    const d = this.deps;
    if (!this.race) return;
    const rank = ranking(this.race).find((r) => r.slot === i)?.rank ?? 1;
    d.toast(i, `🏁 第 ${rank} 名！${(finishTime / 1000).toFixed(1)} 秒`);
    d.audio.missionSuccess();
    // v5.2 競速收集簿：記錄本次、破紀錄再補一個大回饋
    const rec = recordRaceRun(this.records, courseKey(d.getCurAirportId(), d.getRaceType()), finishTime);
    saveRaceRecords(localStorage, this.records);
    if (rec.isNewBest && rec.prevBestMs != null) { d.toast(i, `🥇 新紀錄！快了 ${((rec.prevBestMs - finishTime) / 1000).toFixed(1)} 秒`); d.audio.landingChime(); }
    else if (rec.isNewBest) d.toast(i, '📖 首次完賽，記進收集簿！');
    if (allFinished(this.race) && !this.celebrated) { // 全員完賽一次性慶祝
      this.celebrated = true;
      d.audio.fireworks();
      for (let s = 0; s < d.maxSlots; s++) if (d.wasDriven[s]) d.toast(s, '🎉 大家都完賽了！');
    }
  }

  /** 競速計分卡（TaskSlot）：計時 + 名次/進度 + 下一目標箭頭。 @param {number} i @param {import('../flight/flight-model.js').PlaneState} s @param {number} now */
  hudText(i, s, now) {
    const d = this.deps;
    if (!this.race) return '';
    const racer = this.race.racers[i];
    if (!racer) return '';
    if (racer.finished) {
      const rank = ranking(this.race).find((r) => r.slot === i)?.rank ?? 1;
      const best = this.records[courseKey(d.getCurAirportId(), d.getRaceType())]?.bestMs;
      const bestTxt = best ? `　🏆 最佳 ${(best / 1000).toFixed(1)}s` : '';
      return `🏁 完賽 第 ${rank} 名　⏱ ${((racer.finishTime ?? 0) / 1000).toFixed(1)}s${bestTxt}`;
    }
    const t = racer.started ? ((now - racer.startAt) / 1000).toFixed(1) : '0.0';
    const raceType = d.getRaceType();
    const wp = raceType === 'landmark' ? this.waypoints[0] : this.waypoints[racer.ringIndex];
    let lead = '';
    if (wp && s.mode === 'flying') {
      const bearing = Math.atan2(wp.x - s.pos.x, -(wp.z - s.pos.z));
      const rel = wrapAngle(bearing - s.heading);
      const dist = Math.hypot(wp.x - s.pos.x, wp.z - s.pos.z);
      lead = `<span class="t-arrow" style="transform:rotate(${rel}rad)">⬆️</span> ${(dist / 1000).toFixed(1)}km　`;
    }
    const prog = raceType === 'landmark' ? '衝終點🟢' : `第 ${racer.ringIndex + 1}/${this.waypoints.length} 圈`;
    return `${lead}⏱ ${t}s　${prog}`;
  }
}
