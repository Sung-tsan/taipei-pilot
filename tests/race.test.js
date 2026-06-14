// @ts-check
import { describe, it, expect } from 'vitest';
import {
  RACE_TYPES, makeRace, startRace, updateRacer, ranking, allFinished,
} from '../src/display/missions/race.js';
import { ringsAlongRiver } from '../src/display/missions/missions.js';

// —— 賽道工具 ——
const LANDMARK_COURSE = { target: { x: 1000, z: 0, r: 200 } };
// 三圈，間距遠大於半徑，互不重疊（沿用 missions.test.js 的不重疊原則）
const RING_COURSE = {
  rings: [
    { x: 0, z: 0, r: 150 },
    { x: 500, z: 0, r: 150 },
    { x: 1000, z: 0, r: 150 },
  ],
};

describe('makeRace / startRace 初始化', () => {
  it('makeRace：每個 slot 都有初始狀態（未開賽、index 0、未完賽）', () => {
    const race = makeRace(RACE_TYPES.LANDMARK, [0, 1], LANDMARK_COURSE);
    for (const slot of [0, 1]) {
      const r = race.racers[slot];
      expect(r.started).toBe(false);
      expect(r.startAt).toBe(0);
      expect(r.ringIndex).toBe(0);
      expect(r.finished).toBe(false);
      expect(r.finishTime).toBeNull();
    }
  });

  it('startRace：所有 slot 同步開賽、startAt=now', () => {
    const race = makeRace(RACE_TYPES.RING_ROUTE, [0, 1], RING_COURSE);
    startRace(race, 1000);
    for (const slot of [0, 1]) {
      expect(race.racers[slot].started).toBe(true);
      expect(race.racers[slot].startAt).toBe(1000);
    }
  });
});

describe('LANDMARK 地標尋寶競速', () => {
  it('飛進光圈才 finish，finishTime = now - startAt', () => {
    const race = makeRace(RACE_TYPES.LANDMARK, [0], LANDMARK_COURSE);
    startRace(race, 1000);
    // 還沒到目標 → null
    expect(updateRacer(race, 0, { x: 0, z: 0 }, 1500)).toBeNull();
    // 飛進光圈（dist 100 <= r 200）→ finish
    const ev = updateRacer(race, 0, { x: 1100, z: 0 }, 4000);
    expect(ev).toEqual({ type: 'finish', slot: 0, finishTime: 3000 });
    expect(race.racers[0].finished).toBe(true);
    expect(race.racers[0].finishTime).toBe(3000);
  });

  it('先到者 finishTime 較小、rank 正確（友善競爭兩人都完賽）', () => {
    const race = makeRace(RACE_TYPES.LANDMARK, [0, 1], LANDMARK_COURSE);
    startRace(race, 0);
    const evA = /** @type {any} */ (updateRacer(race, 0, { x: 1000, z: 0 }, 2000)); // slot0 用 2000ms
    const evB = /** @type {any} */ (updateRacer(race, 1, { x: 1000, z: 0 }, 5000)); // slot1 用 5000ms
    expect(evA?.finishTime).toBe(2000);
    expect(evB?.finishTime).toBe(5000);
    const rank = ranking(race);
    expect(rank).toEqual([
      { slot: 0, finishTime: 2000, rank: 1 },
      { slot: 1, finishTime: 5000, rank: 2 },
    ]);
    expect(allFinished(race)).toBe(true);
  });
});

describe('RING_ROUTE 穿圈航線競速', () => {
  it('必須依序穿，跳圈不算，穿完最後一圈才 finish', () => {
    const race = makeRace(RACE_TYPES.RING_ROUTE, [0], RING_COURSE);
    startRace(race, 0);
    // 跳到第 3 圈位置（index 2）但還沒穿過第 0、1 → 不算
    expect(updateRacer(race, 0, { x: 1000, z: 0 }, 100)).toBeNull();
    expect(race.racers[0].ringIndex).toBe(0);

    // 依序穿：第 0 圈
    const e0 = updateRacer(race, 0, { x: 0, z: 0 }, 200);
    expect(e0).toEqual({ type: 'ring', slot: 0, ringIndex: 1 });

    // 跳第 2 圈（index 2）不算（要先穿第 1 圈）
    expect(updateRacer(race, 0, { x: 1000, z: 0 }, 300)).toBeNull();
    expect(race.racers[0].ringIndex).toBe(1);

    // 第 1 圈
    const e1 = updateRacer(race, 0, { x: 500, z: 0 }, 400);
    expect(e1).toEqual({ type: 'ring', slot: 0, ringIndex: 2 });
    expect(race.racers[0].finished).toBe(false); // 還沒穿完

    // 第 2 圈（最後）→ finish
    const e2 = updateRacer(race, 0, { x: 1000, z: 0 }, 1000);
    expect(e2).toEqual({ type: 'finish', slot: 0, finishTime: 1000 });
    expect(race.racers[0].finished).toBe(true);
  });

  it('可用 ringsAlongRiver 產 rings（呼叫端負責補 r）', () => {
    const points = /** @type {[number,number][]} */ ([[0, 0], [600, 0], [1200, 0]]);
    const raw = ringsAlongRiver(points, 3);
    const rings = raw.map((p) => ({ x: p.x, z: p.z, r: 120 }));
    const race = makeRace(RACE_TYPES.RING_ROUTE, [0], { rings });
    startRace(race, 0);
    let lastIdx = 0;
    for (const ring of rings) {
      const ev = updateRacer(race, 0, { x: ring.x, z: ring.z }, 500);
      expect(ev).not.toBeNull();
      lastIdx = race.racers[0].ringIndex;
    }
    expect(lastIdx).toBe(rings.length);
    expect(race.racers[0].finished).toBe(true);
  });
});

describe('ranking 排序 + 友善競爭（落後不淘汰）', () => {
  it('兩人不同時間完賽 → 依 finishTime 升序給名次', () => {
    const race = makeRace(RACE_TYPES.LANDMARK, [0, 1], LANDMARK_COURSE);
    startRace(race, 0);
    // slot1 先完賽（耗時 1000），slot0 後完賽（耗時 3000）
    updateRacer(race, 1, { x: 1000, z: 0 }, 1000);
    updateRacer(race, 0, { x: 1000, z: 0 }, 3000);
    const rank = ranking(race);
    expect(rank[0]).toEqual({ slot: 1, finishTime: 1000, rank: 1 });
    expect(rank[1]).toEqual({ slot: 0, finishTime: 3000, rank: 2 });
  });

  it('未完賽者不淘汰：出現在名次表末位、rank=null', () => {
    const race = makeRace(RACE_TYPES.LANDMARK, [0, 1], LANDMARK_COURSE);
    startRace(race, 0);
    updateRacer(race, 0, { x: 1000, z: 0 }, 2000); // 只有 slot0 完賽
    const rank = ranking(race);
    expect(rank[0]).toEqual({ slot: 0, finishTime: 2000, rank: 1 });
    expect(rank[1]).toEqual({ slot: 1, finishTime: null, rank: null });
    expect(allFinished(race)).toBe(false);
  });

  it('落後者最終也能完賽（不淘汰）→ allFinished 轉 true', () => {
    const race = makeRace(RACE_TYPES.LANDMARK, [0, 1], LANDMARK_COURSE);
    startRace(race, 0);
    updateRacer(race, 0, { x: 1000, z: 0 }, 2000);
    expect(allFinished(race)).toBe(false);
    // 落後的 slot1 很久之後才完賽，仍記一筆
    const ev = /** @type {any} */ (updateRacer(race, 1, { x: 1000, z: 0 }, 99999));
    expect(ev?.type).toBe('finish');
    expect(ev?.finishTime).toBe(99999);
    expect(allFinished(race)).toBe(true);
    const rank = ranking(race);
    expect(rank.map((r) => r.rank)).toEqual([1, 2]); // 兩人都有名次
  });

  it('同 finishTime 平手 → 照 slot 穩定排序', () => {
    const race = makeRace(RACE_TYPES.LANDMARK, [0, 1], LANDMARK_COURSE);
    startRace(race, 0);
    updateRacer(race, 1, { x: 1000, z: 0 }, 2000);
    updateRacer(race, 0, { x: 1000, z: 0 }, 2000);
    const rank = ranking(race);
    expect(rank.map((r) => r.slot)).toEqual([0, 1]); // 平手照 slot 升序
  });
});

describe('友善 / 邊界 / fallback 不爆', () => {
  it('finished 後重複 update 不重觸發、不報錯（回 null）', () => {
    const race = makeRace(RACE_TYPES.LANDMARK, [0], LANDMARK_COURSE);
    startRace(race, 0);
    const ev = updateRacer(race, 0, { x: 1000, z: 0 }, 2000);
    expect(ev?.type).toBe('finish');
    // 再呼叫 → null，finishTime 不被覆蓋
    expect(updateRacer(race, 0, { x: 1000, z: 0 }, 9999)).toBeNull();
    expect(race.racers[0].finishTime).toBe(2000);
  });

  it('未開賽就 update → null（不會偷算）', () => {
    const race = makeRace(RACE_TYPES.LANDMARK, [0], LANDMARK_COURSE);
    expect(updateRacer(race, 0, { x: 1000, z: 0 }, 1000)).toBeNull();
    expect(race.racers[0].finished).toBe(false);
  });

  it('未知 slot → null（不爆）', () => {
    const race = makeRace(RACE_TYPES.LANDMARK, [0], LANDMARK_COURSE);
    startRace(race, 0);
    expect(updateRacer(race, 99, { x: 1000, z: 0 }, 1000)).toBeNull();
  });

  it('未知 type → 永不完賽但不爆', () => {
    const race = makeRace('bogus_type', [0], LANDMARK_COURSE);
    startRace(race, 0);
    expect(updateRacer(race, 0, { x: 1000, z: 0 }, 1000)).toBeNull();
    expect(allFinished(race)).toBe(false);
  });

  it('空 course（LANDMARK 無 target / RING_ROUTE 無 rings）→ 不爆、不完賽', () => {
    const r1 = makeRace(RACE_TYPES.LANDMARK, [0], {});
    startRace(r1, 0);
    expect(updateRacer(r1, 0, { x: 0, z: 0 }, 100)).toBeNull();

    const r2 = makeRace(RACE_TYPES.RING_ROUTE, [0], { rings: [] });
    startRace(r2, 0);
    expect(updateRacer(r2, 0, { x: 0, z: 0 }, 100)).toBeNull();
    expect(allFinished(r2)).toBe(false);
  });

  it('null planePos → null（防呆）', () => {
    const race = makeRace(RACE_TYPES.LANDMARK, [0], LANDMARK_COURSE);
    startRace(race, 0);
    expect(updateRacer(race, 0, /** @type {any} */ (null), 100)).toBeNull();
  });

  it('空賽（無 slot）→ allFinished 為 false、ranking 為空', () => {
    const race = makeRace(RACE_TYPES.LANDMARK, [], LANDMARK_COURSE);
    expect(allFinished(race)).toBe(false);
    expect(ranking(race)).toEqual([]);
  });
});
