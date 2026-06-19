// @ts-check
import { describe, it, expect } from 'vitest';
import { patternPoints, advanceCorridor, corridorAtc, PATTERN } from '../src/display/scene/air-corridor.js';

const DIR = { x: 1, z: 0 }; // along=+x、lateral=+z（測試用簡化 frame）

describe('空中走廊 air-corridor（v4.1）', () => {
  it('patternPoints：8 航點、climb→final、末點在跑道頭低空', () => {
    const pts = patternPoints(DIR);
    expect(pts.length).toBe(PATTERN.length);
    expect(pts[0].leg).toBe('climb');
    expect(/** @type {any} */ (pts.at(-1)).leg).toBe('final');
    expect(/** @type {any} */ (pts.at(-1)).alt).toBeLessThan(40); // 末點＝通過跑道頭、低空
    expect(/** @type {any} */ (pts.at(-1)).x).toBeLessThan(0);    // 落地朝東 → threshold 在西（−along）
    expect(pts[0].x).toBeGreaterThan(1300);                       // 爬升航點在跑道東端外
  });

  it('advanceCorridor：到達航點 → 進下一個；遠離 → 不動；末點 → 停', () => {
    const pts = patternPoints(DIR);
    expect(advanceCorridor(pts, { x: pts[0].x, z: pts[0].z }, 0)).toBe(1);
    expect(advanceCorridor(pts, { x: 99999, z: 0 }, 0)).toBe(0);
    const last = pts.length - 1;
    expect(advanceCorridor(pts, { x: pts[last].x, z: pts[last].z }, last)).toBe(last);
  });

  it('corridorAtc：leg 前綴 + 含 label；空航點 → 空字串', () => {
    const pts = patternPoints(DIR);
    expect(corridorAtc(pts[0])).toContain('離場');
    expect(corridorAtc(/** @type {any} */ (pts.at(-1)))).toContain('進場');
    expect(corridorAtc(/** @type {any} */ (pts.at(-1)))).toContain(/** @type {any} */ (pts.at(-1)).label);
    expect(corridorAtc(undefined)).toBe('');
  });
});
