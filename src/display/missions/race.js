// @ts-check
// 競爭任務賽（競速）規則核心 —— 純狀態機，零 DOM/Three，vitest 直測。
// 兩型：①地標尋寶競速（誰先飛進目標光圈）②穿圈航線競速（誰先依序穿完 rings）。
// 名次＝完成時間；雙人各自獨立計時；友善競爭（落後不淘汰、完賽都點亮收集）。
// 幾何複用 v1.1-3 任務判定（inLandmarkRing / advanceRings），不另發明算法。
// 時間由呼叫端傳入（單調遞增的 ms 或 tick，不用 Date.now）。北極星 ROADMAP §4 v2.1。
import { inLandmarkRing, advanceRings } from './missions.js';

export const RACE_TYPES = /** @type {const} */ ({
  LANDMARK: 'landmark_race',
  RING_ROUTE: 'ring_route_race',
});

/**
 * @typedef {{ x:number, z:number, r:number }} RingSpec 圈位＋半徑（r＝光圈/穿圈容差）
 * @typedef {{ target: RingSpec }} LandmarkCourse 地標尋寶賽道
 * @typedef {{ rings: RingSpec[] }} RingRouteCourse 穿圈航線賽道
 *
 * @typedef {{
 *   started: boolean,      // 該 slot 是否已開賽（startRace 後為 true）
 *   startAt: number,       // 開賽當下的時間戳（呼叫端傳入的 now）
 *   ringIndex: number,     // 目前該穿第幾個 ring（RING_ROUTE 用；LANDMARK 恆 0）
 *   finished: boolean,     // 是否完賽
 *   finishTime: number|null, // 完賽耗時＝完賽 now - startAt（未完賽為 null）
 * }} RacerState
 *
 * @typedef {{
 *   type: string,
 *   course: LandmarkCourse | RingRouteCourse | any,
 *   racers: Record<number, RacerState>, // slot → 狀態
 *   slots: number[],
 * }} RaceState
 *
 * @typedef {{ type:'ring', slot:number, ringIndex:number }
 *         | { type:'finish', slot:number, finishTime:number }} RaceEvent
 */

/** 建立單一賽手的初始狀態 @returns {RacerState} */
function makeRacer() {
  return { started: false, startAt: 0, ringIndex: 0, finished: false, finishTime: null };
}

/**
 * 取此型別下的目標 rings 序列（統一成 RingSpec[]，方便 update 共用判定）。
 * LANDMARK：只有單一 target，視為「一圈」。
 * RING_ROUTE：照 course.rings 依序。未知型別/空 course → 回空陣列（fallback 不爆）。
 * @param {RaceState} race
 * @returns {RingSpec[]}
 */
function courseRings(race) {
  const c = race.course || {};
  if (race.type === RACE_TYPES.LANDMARK) {
    return c.target ? [c.target] : [];
  }
  if (race.type === RACE_TYPES.RING_ROUTE) {
    return Array.isArray(c.rings) ? c.rings : [];
  }
  return []; // 未知 type → 永遠不會完賽，但不報錯
}

/**
 * 建立競速狀態（尚未開賽，startRace 才開始計時）。
 * @param {string} type RACE_TYPES 之一
 * @param {number[]} slots 例 [0,1]（雙人）；可單人或多人
 * @param {LandmarkCourse | RingRouteCourse | any} course
 *   LANDMARK 給 `{ target:{x,z,r} }`；RING_ROUTE 給 `{ rings:[{x,z,r}, ...] }`。
 * @returns {RaceState}
 */
export function makeRace(type, slots, course) {
  /** @type {Record<number, RacerState>} */
  const racers = {};
  const list = Array.isArray(slots) ? slots : [];
  for (const slot of list) racers[slot] = makeRacer();
  return { type, course: course || {}, racers, slots: list.slice() };
}

/**
 * 所有 slot 同時開賽（startAt = now，各自獨立計時的共同起點）。
 * 重複呼叫會重設起點（友善：允許重新開賽）。
 * @param {RaceState} race
 * @param {number} now 單調遞增時間戳（ms 或 tick）
 * @returns {RaceState} 原物件（原地修改後回傳，方便鏈式）
 */
export function startRace(race, now) {
  for (const slot of race.slots) {
    const racer = race.racers[slot];
    if (!racer) continue;
    racer.started = true;
    racer.startAt = now;
    racer.ringIndex = 0;
    racer.finished = false;
    racer.finishTime = null;
  }
  return race;
}

/**
 * 更新單一賽手位置 → 回傳事件或 null。
 * LANDMARK：飛進 target 光圈（dist<=r）→ finished、記 finishTime=now-startAt，
 *   回 `{type:'finish', slot, finishTime}`。
 * RING_ROUTE：依序進下一個 ring（dist<=r）→ ringIndex++，回 `{type:'ring', slot, ringIndex}`；
 *   穿完最後一圈 → finished + `{type:'finish', slot, finishTime}`。
 * 友善：未開賽 / 已完賽 / 未知 slot → 回 null（不重複觸發、不報錯）。
 * 跳圈不算（沿用 advanceRings 的依序判定，一次最多進一圈）。
 * @param {RaceState} race
 * @param {number} slot
 * @param {{ x:number, z:number }} planePos 飛機位置（只看水平 x/z，高度不卡，6 歲友善）
 * @param {number} now 單調遞增時間戳
 * @returns {RaceEvent|null}
 */
export function updateRacer(race, slot, planePos, now) {
  const racer = race.racers[slot];
  if (!racer || !racer.started || racer.finished || !planePos) return null;

  const rings = courseRings(race);
  if (rings.length === 0) return null; // 空 course / 未知型別 → 永不完賽，不爆

  const before = racer.ringIndex;
  // 複用 v1.1-3 依序穿圈判定：一次最多進一圈、跳圈不算。
  // 每個 ring 用自己的 r 當容差（沿用 inLandmarkRing 的 <= 判定）。
  const next = rings[before];
  const advanced = next && inLandmarkRing(planePos.x, planePos.z, next, next.r);
  if (!advanced) return null;

  racer.ringIndex = before + 1;

  // 穿完最後一圈 → 完賽
  if (racer.ringIndex >= rings.length) {
    racer.finished = true;
    racer.finishTime = now - racer.startAt;
    return { type: 'finish', slot, finishTime: racer.finishTime };
  }
  // RING_ROUTE 中途穿圈事件（LANDMARK 只有一圈，走不到這）
  return { type: 'ring', slot, ringIndex: racer.ringIndex };
}

/**
 * 名次表：已完賽者依 finishTime 升序給 rank（1,2,...，同時間照 slot 穩定排序）；
 * 未完賽者排在後面，rank 給 null（代表「尚未完賽、無名次」，由呼叫端決定顯示）。
 * 友善競爭：未完賽者不淘汰，仍出現在表中（rank=null）。
 * @param {RaceState} race
 * @returns {{ slot:number, finishTime:number|null, rank:number|null }[]}
 */
export function ranking(race) {
  const rows = race.slots.map((slot) => {
    const r = race.racers[slot];
    return { slot, finishTime: r ? r.finishTime : null, finished: !!(r && r.finished) };
  });
  // 完賽者在前（依 finishTime 升序，平手照 slot），未完賽者在後（保持 slot 序）
  rows.sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) {
      const ft = /** @type {number} */ (a.finishTime) - /** @type {number} */ (b.finishTime);
      if (ft !== 0) return ft;
    }
    return a.slot - b.slot;
  });
  let rank = 0;
  return rows.map((row) => ({
    slot: row.slot,
    finishTime: row.finishTime,
    rank: row.finished ? ++rank : null, // 完賽才給名次；未完賽 rank=null
  }));
}

/**
 * 是否全員完賽（呼叫端據此點亮收集 / 觸發大慶祝）。
 * 空賽（無 slot）視為 false（沒有可慶祝的對象）。
 * @param {RaceState} race
 * @returns {boolean}
 */
export function allFinished(race) {
  if (race.slots.length === 0) return false;
  return race.slots.every((slot) => {
    const r = race.racers[slot];
    return !!(r && r.finished);
  });
}
