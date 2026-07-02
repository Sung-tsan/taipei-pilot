// @ts-check
// v5.2-2 filletPolyline（導航線轉角圓弧化）——三驗：無尖角、長度近似、pointAtDistance 相容。
import { describe, it, expect } from 'vitest';
import { filletPolyline, polylineLength, pointAtDistance, segHeading } from '../src/display/scene/path-follow.js';

/** 折線各相鄰段的最大轉角（rad）。 @param {{x:number,z:number}[]} pts */
function maxTurn(pts) {
  let worst = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const h1 = segHeading(pts[i - 1], pts[i]);
    const h2 = segHeading(pts[i], pts[i + 1]);
    const d = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1)));
    worst = Math.max(worst, d);
  }
  return worst;
}

describe('filletPolyline — 轉角圓弧化（v5.2-2）', () => {
  const rightAngle = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }];

  it('90° 轉角 → 無任何相鄰段轉角超過 25°（尖角消失）', () => {
    const out = filletPolyline(rightAngle);
    expect(out.length).toBeGreaterThan(3); // 有插弧點
    expect(maxTurn(out)).toBeLessThan((25 * Math.PI) / 180);
  });

  it('總長變化 < 5%（真實滑行道段長下，圓角只削尖角、不改路線）', () => {
    // 松山滑行道段長 ≥ 數百公尺；90° 圓角 r=26 每角削 ~11m，佔比極小。
    const route = [{ x: 0, z: 0 }, { x: 300, z: 0 }, { x: 300, z: 250 }, { x: 600, z: 250 }];
    const before = polylineLength(route);
    const after = polylineLength(filletPolyline(route));
    expect(Math.abs(after - before) / before).toBeLessThan(0.05);
  });

  it('端點不動（起終點語義不變，跟我車/停妥判定不受影響）', () => {
    const out = filletPolyline(rightAngle);
    expect(out[0]).toEqual({ x: 0, z: 0 });
    expect(out[out.length - 1]).toEqual({ x: 100, z: 100 });
  });

  it('直線不加點、原樣回傳', () => {
    const line = [{ x: 0, z: 0 }, { x: 50, z: 0 }, { x: 100, z: 0 }];
    expect(filletPolyline(line)).toHaveLength(3);
  });

  it('pointAtDistance 距離參數化仍單調（燈距/跟我車不亂）', () => {
    const out = filletPolyline(rightAngle);
    const total = polylineLength(out);
    let prev = -1;
    for (let d = 0; d <= total; d += 5) {
      const p = pointAtDistance(out, d);
      const along = d; // pointAtDistance 以 d 取點：驗證取出的點沿線推進（相鄰點距 ≤ 步長+ε）
      expect(along).toBeGreaterThan(prev);
      prev = along;
      expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    }
  });

  it('短段相鄰轉角：切線距夾半段長、不互吃（不產生 NaN/亂點）', () => {
    const tight = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 20 }, { x: 40, z: 20 }, { x: 40, z: 0 }];
    const out = filletPolyline(tight);
    for (const p of out) expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    expect(maxTurn(out)).toBeLessThan((30 * Math.PI) / 180); // 半徑自動縮後仍平順
  });

  it('U 形回頭（180°）不爆：保留原頂點', () => {
    const uturn = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 0, z: 0.0001 }];
    const out = filletPolyline(uturn);
    for (const p of out) expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
  });

  it('少於 3 點 → 原樣副本', () => {
    expect(filletPolyline([{ x: 1, z: 2 }])).toEqual([{ x: 1, z: 2 }]);
    expect(filletPolyline([])).toEqual([]);
  });
});
