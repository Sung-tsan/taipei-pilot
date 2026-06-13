// @ts-check
import { describe, it, expect } from 'vitest';
import { MissionRunner } from '../src/display/missions/mission-runner.js';
import { MISSION_TYPES } from '../src/display/missions/missions.js';

const LANDMARKS = {
  L1: { x: 0, z: 0, clear: 200 },
  L2: { x: 1000, z: 0, clear: 200 },
};

function makeRunner(slots = 1) {
  const collection = { lit: new Set(), missionsDone: new Set(), celebrated: false };
  const pool = [
    { id: 'find_L1', type: MISSION_TYPES.LANDMARK_FIND, targetId: 'L1', pos: { x: 0, z: 0 }, size: 5, difficulty: 1 },
    { id: 'find_L2', type: MISSION_TYPES.LANDMARK_FIND, targetId: 'L2', pos: { x: 1000, z: 0 }, size: 5, difficulty: 1 },
    { id: 'alt1', type: MISSION_TYPES.ALTITUDE, altRule: { kind: 'above', value: 500 }, difficulty: 2 },
    { id: 'land1', type: MISSION_TYPES.TAKEOFF_LANDING, difficulty: 1 },
  ];
  const runner = new MissionRunner(slots, {
    pool,
    landmarkIds: ['L1', 'L2'],
    landmarkPos: (id) => /** @type {any} */ (LANDMARKS)[id] ?? null,
    landmarkFact: (id) => `fact ${id}`,
    riverRings: () => [{ x: 0, z: 0 }],
    collection,
  });
  return { runner, collection };
}

const flying = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => ({ pos: { x, y, z }, mode: 'flying' });

describe('MissionRunner 迴圈', () => {
  it('start 挑最近的題（origin → find_L1）', () => {
    const { runner } = makeRunner();
    runner.start(0, { x: 0, z: 0 });
    expect(runner.current[0].id).toBe('find_L1');
  });

  it('飛進地標光圈 → 達成、點亮(全家共享)、揭曉 fact、自動下一題', () => {
    const { runner, collection } = makeRunner();
    runner.start(0, { x: 0, z: 0 });
    expect(runner.update(0, flying(9999, 600, 0))).toBeNull(); // 還沒到
    const ev = runner.update(0, flying(0, 600, 0));
    expect(ev?.completed.id).toBe('find_L1');
    expect(ev?.lit).toBe('L1');
    expect(ev?.fact).toBe('fact L1');
    expect(collection.lit.has('L1')).toBe(true);
    expect(runner.current[0].id).toBe('find_L2'); // 下一題
  });

  it('全地標點亮 → 一次性大慶祝 celebrate=true（之後不再）', () => {
    const { runner, collection } = makeRunner();
    runner.start(0, { x: 0, z: 0 });
    runner.update(0, flying(0, 600, 0));      // L1
    const ev = runner.update(0, flying(1000, 600, 0)); // L2 → 全亮
    expect(ev?.celebrate).toBe(true);
    expect(collection.celebrated).toBe(true);
  });

  it('高度挑戰：到達高度帶即達成', () => {
    const { runner } = makeRunner();
    // 先清掉兩個地標題 → 輪到 alt1
    runner.start(0, { x: 0, z: 0 });
    runner.update(0, flying(0, 600, 0));
    runner.update(0, flying(1000, 600, 0));
    expect(runner.current[0].id).toBe('alt1');
    const ev = runner.update(0, flying(1000, 600, 0)); // y=600 >= 500
    expect(ev?.completed.id).toBe('alt1');
  });

  it('起降練習：notify 落地/迫降成功才達成', () => {
    const { runner } = makeRunner();
    runner.start(0, { x: 0, z: 0 });
    runner.update(0, flying(0, 600, 0));
    runner.update(0, flying(1000, 600, 0));
    runner.update(0, flying(1000, 600, 0)); // alt1
    expect(runner.current[0].id).toBe('land1');
    expect(runner.notify(0, 'crashed', { x: 0, z: 0 })).toBeNull();
    const ev = runner.notify(0, 'landed_runway', { x: 0, z: 0 });
    expect(ev?.completed.id).toBe('land1');
    expect(runner.current[0]).toBeNull(); // 全部供完
  });

  it('雙人各自佇列獨立（slot 0 完成不影響 slot 1）', () => {
    const { runner } = makeRunner(2);
    runner.start(0, { x: 0, z: 0 });
    runner.start(1, { x: 0, z: 0 });
    runner.update(0, flying(0, 600, 0)); // slot0 完成 find_L1
    expect(runner.current[0].id).toBe('find_L2');
    expect(runner.current[1].id).toBe('find_L1'); // slot1 還在 L1（佇列獨立）
  });
});
