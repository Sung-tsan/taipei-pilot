// @ts-check
// 任務執行器：把 v1.1-3 純判定 + 收集 串成「供題→達成→點亮/記錄→揭曉→下一題」迴圈。
// 注入解析器（landmark 座標/fact、river 圈）+ collection → 可單測（不碰 DOM/Three）。
// 雙人各自佇列獨立（done per slot）；地標點亮全家共享（collection.lit）。北極星 handoff v1.1-4。
import {
  MISSION_TYPES, inLandmarkRing, advanceRings, checkAltitude, isTakeoffLandingDone, pickNextMission,
} from './missions.js';
import { lightLandmark, recordMission, shouldCelebrate } from './collection-store.js';

/**
 * @typedef {{
 *   pool: any[],
 *   landmarkIds: string[],
 *   landmarkPos: (id:string) => ({x:number,z:number,clear:number}|null),
 *   landmarkFact: (id:string) => string,
 *   riverRings: (name:string, count:number) => {x:number,z:number}[],
 *   collection: import('./collection-store.js').Collection,
 * }} RunnerDeps
 */

export class MissionRunner {
  /** @param {number} slots @param {RunnerDeps} deps */
  constructor(slots, deps) {
    this.deps = deps;
    /** @type {(any|null)[]} */ this.current = Array.from({ length: slots }, () => null);
    /** @type {Set<string>[]} */ this.done = Array.from({ length: slots }, () => new Set());
    /** @type {number[]} */ this.ringIndex = Array.from({ length: slots }, () => 0);
    /** @type {{x:number,z:number}[][]} */ this.rings = Array.from({ length: slots }, () => []);
  }

  /** 開新一輪供題（挑第一題） @param {number} slot @param {{x:number,z:number}} planePos */
  start(slot, planePos) {
    this._assign(slot, pickNextMission(this.deps.pool, planePos, this.done[slot]), planePos);
  }

  /** @param {number} slot @param {any|null} mission @param {{x:number,z:number}} planePos */
  _assign(slot, mission, planePos) {
    this.current[slot] = mission;
    this.ringIndex[slot] = 0;
    this.rings[slot] = mission && mission.type === MISSION_TYPES.RING_ROUTE
      ? this.deps.riverRings(mission.riverName, mission.ringCount ?? 5)
      : [];
  }

  /**
   * 每幀更新：檢查當前任務（地標/穿圈/高度）是否達成 → 點亮/記錄/下一題。
   * 起降練習走 notify()。回傳達成事件給 UI（揭曉/慶祝），無事回 null。
   * @param {number} slot @param {{ pos:{x:number,y:number,z:number}, mode:string }} plane
   * @returns {{completed:any, fact:string, lit:string|null, celebrate:boolean}|null}
   */
  update(slot, plane) {
    const m = this.current[slot];
    if (!m || plane.mode !== 'flying') return null;
    let done = false;
    if (m.type === MISSION_TYPES.LANDMARK_FIND) {
      const pos = this.deps.landmarkPos(m.targetId);
      done = !!pos && inLandmarkRing(plane.pos.x, plane.pos.z, pos, pos.clear);
    } else if (m.type === MISSION_TYPES.RING_ROUTE) {
      this.ringIndex[slot] = advanceRings(this.ringIndex[slot], plane.pos.x, plane.pos.z, this.rings[slot]);
      done = this.ringIndex[slot] >= this.rings[slot].length && this.rings[slot].length > 0;
    } else if (m.type === MISSION_TYPES.ALTITUDE) {
      done = checkAltitude(plane.pos.y, m.altRule);
    }
    return done ? this._complete(slot, m, { x: plane.pos.x, z: plane.pos.z }) : null;
  }

  /**
   * 外部事件（落地/迫降成功）→ 若當前是起降練習則達成。
   * @param {number} slot @param {string} event @param {{x:number,z:number}} planePos
   */
  notify(slot, event, planePos) {
    const m = this.current[slot];
    if (m && m.type === MISSION_TYPES.TAKEOFF_LANDING && isTakeoffLandingDone(event)) {
      return this._complete(slot, m, planePos);
    }
    return null;
  }

  /** 測試/開發用：直接完成當前任務（略過判定） @param {number} slot @param {{x:number,z:number}} planePos */
  devComplete(slot, planePos) {
    const m = this.current[slot];
    return m ? this._complete(slot, m, planePos) : null;
  }

  /** @param {number} slot @param {any} m @param {{x:number,z:number}} planePos */
  _complete(slot, m, planePos) {
    const { collection } = this.deps;
    /** @type {string|null} */ let lit = null;
    let fact = '做到了！🎉';
    if (m.type === MISSION_TYPES.LANDMARK_FIND) {
      if (lightLandmark(collection, m.targetId)) lit = m.targetId; // 全家共享去重
      fact = this.deps.landmarkFact(m.targetId) || fact;
    }
    recordMission(collection, m.id);
    this.done[slot].add(m.id);
    const celebrate = shouldCelebrate(collection, this.deps.landmarkIds);
    if (celebrate) collection.celebrated = true; // 一次性 gate
    this._assign(slot, pickNextMission(this.deps.pool, planePos, this.done[slot]), planePos);
    return { completed: m, fact, lit, celebrate };
  }
}
