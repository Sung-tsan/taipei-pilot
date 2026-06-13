// @ts-check
import { describe, it, expect } from 'vitest';
import {
  MISSION_TYPES, inLandmarkRing, ringsAlongRiver, advanceRings,
  checkAltitude, isTakeoffLandingDone, pickNextMission,
} from '../src/display/missions/missions.js';
import { airspaceTaipei } from '../src/display/missions/airspace-taipei.js';

describe('任務四型判定', () => {
  it('地標尋寶：進光圈才算（含半徑容差）', () => {
    const t = { x: 1000, z: 2000 };
    expect(inLandmarkRing(1000, 2000, t)).toBe(true);
    expect(inLandmarkRing(1200, 2000, t, 280)).toBe(true);  // 200 < 280
    expect(inLandmarkRing(1400, 2000, t, 280)).toBe(false); // 400 > 280
  });

  it('穿圈航線：依序穿、不可跳號', () => {
    const rings = [{ x: 0, z: 0 }, { x: 500, z: 0 }, { x: 1000, z: 0 }]; // 間距 > 半徑，不重疊
    let i = 0;
    expect(advanceRings(i, 999, 999, rings)).toBe(0);     // 沒進第 0 圈 → 不動
    i = advanceRings(i, 0, 0, rings); expect(i).toBe(1);
    expect(advanceRings(i, 1000, 0, rings)).toBe(1);      // 跳到第 2 圈不算（要先穿第 1）
    i = advanceRings(i, 500, 0, rings); expect(i).toBe(2);
    i = advanceRings(i, 1000, 0, rings); expect(i).toBe(3); // === rings.length → 完成
  });

  it('高度挑戰：above / below / band', () => {
    expect(checkAltitude(600, { kind: 'above', value: 520 })).toBe(true);
    expect(checkAltitude(400, { kind: 'above', value: 520 })).toBe(false);
    expect(checkAltitude(100, { kind: 'below', value: 120 })).toBe(true);
    expect(checkAltitude(150, { kind: 'below', value: 120 })).toBe(false);
    expect(checkAltitude(80, { kind: 'band', min: 50, max: 100 })).toBe(true);
    expect(checkAltitude(120, { kind: 'band', min: 50, max: 100 })).toBe(false);
  });

  it('起降練習：跑道落地 或 真實模式迫降成功', () => {
    expect(isTakeoffLandingDone('landed_runway')).toBe(true);
    expect(isTakeoffLandingDone('forced_landing_success')).toBe(true);
    expect(isTakeoffLandingDone('crashed')).toBe(false);
  });

  it('ringsAlongRiver：沿折線等距取 N 圈（座標取自折線，非硬編）', () => {
    const points = /** @type {[number,number][]} */ ([[0, 0], [100, 0], [200, 0]]);
    const rings = ringsAlongRiver(points, 4);
    expect(rings).toHaveLength(4);
    for (const r of rings) { expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x).toBeLessThanOrEqual(200); expect(r.z).toBe(0); }
    // 遞增分佈
    expect(rings[0].x).toBeLessThan(rings[3].x);
  });
});

describe('適應性挑選（純 JS）', () => {
  const here = { x: 0, z: 0 };
  const pool = [
    { id: 'near_small', pos: { x: 100, z: 0 }, size: 1, difficulty: 2 },
    { id: 'far_big', pos: { x: 4000, z: 0 }, size: 5, difficulty: 3 },
    { id: 'same_small', pos: { x: 1000, z: 0 }, size: 1, difficulty: 1 },
    { id: 'same_big', pos: { x: 1000, z: 0 }, size: 5, difficulty: 3 },
  ];

  it('先近後遠', () => {
    const m = pickNextMission([pool[0], pool[1]], here, new Set());
    expect(m.id).toBe('near_small');
  });

  it('同距離先大後小', () => {
    const m = pickNextMission([pool[2], pool[3]], here, new Set());
    expect(m.id).toBe('same_big');
  });

  it('上一題失敗 → 回填最簡單', () => {
    const m = pickNextMission(pool, here, new Set(), true);
    expect(m.id).toBe('same_small'); // difficulty 1 最低
  });

  it('全部完成 → null', () => {
    expect(pickNextMission([pool[0]], here, new Set(['near_small']))).toBeNull();
  });

  it('雙人各自獨立供題（各帶各的 doneIds）', () => {
    const a = pickNextMission([pool[0], pool[2]], here, new Set(['near_small'])); // A 做過 near
    const b = pickNextMission([pool[0], pool[2]], here, new Set());                // B 沒做過
    expect(a.id).toBe('same_small');
    expect(b.id).toBe('near_small'); // B 仍可拿到 near，互不影響
  });

  it('持續供題迴圈不卡：達成→下一題，直到全清且不重複（瀏覽器級 e2e 留 v1.1-4 UI）', () => {
    const done = new Set();
    const seen = [];
    for (let guard = 0; guard < 100; guard++) {
      const m = pickNextMission(pool, here, done);
      if (!m) break;
      expect(done.has(m.id)).toBe(false); // 不會發已完成的題
      done.add(m.id); seen.push(m.id);
    }
    expect(seen.length).toBe(pool.length); // 全部供完、迴圈自然結束
    expect(pickNextMission(pool, here, done)).toBeNull();
  });
});

describe('airspace-taipei 資料 + DRAFT 紀律（教訓 B5）', () => {
  it('四型任務都至少各有一個', () => {
    const types = new Set(airspaceTaipei.missions.map((m) => m.type));
    expect(types.has(MISSION_TYPES.LANDMARK_FIND)).toBe(true);
    expect(types.has(MISSION_TYPES.RING_ROUTE)).toBe(true);
    expect(types.has(MISSION_TYPES.ALTITUDE)).toBe(true);
    expect(types.has(MISSION_TYPES.TAKEOFF_LANDING)).toBe(true);
  });

  it('地標 targetId 都對得到 landmarks', () => {
    const ids = new Set(airspaceTaipei.landmarks.map((l) => l.id));
    for (const m of airspaceTaipei.missions) {
      if (m.type === MISSION_TYPES.LANDMARK_FIND) expect(ids.has(m.targetId)).toBe(true);
    }
  });

  it('所有 facts / prompts / 鳥瞰知識 已 Sung 校稿定稿（draft:false，2026-06-13）', () => {
    for (const l of airspaceTaipei.landmarks) expect(l.fact.draft).toBe(false);
    for (const m of airspaceTaipei.missions) expect(m.prompt.draft).toBe(false);
    for (const k of airspaceTaipei.aerialKnowledge) expect(k.text.draft).toBe(false);
  });

  it('facts 簡短（≤20 字，給 6 歲）', () => {
    for (const l of airspaceTaipei.landmarks) expect(l.fact.text.length).toBeLessThanOrEqual(20);
  });
});
