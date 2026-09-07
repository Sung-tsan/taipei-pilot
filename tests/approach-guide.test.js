// @ts-check
import { describe, it, expect } from 'vitest';
import {
  toRunwayLocal, idealGlideAlt, approachStatus, approachModeLabel, approachTaskHtml,
  approachHomeCue, judgeRunwayLanding, landingSuccessToast, approachSpawnPose,
  finalApproachPoints, GLIDE_ANGLE, ALIGN_OK_RAD, LATERAL_OK_M,
} from '../src/display/flight/approach-guide.js';

const DIR_E = { x: 1, z: 0 }; // 朝東落地
const L = 3150; // 高雄級

describe('P1-3 approach-guide（進場對正／下滑／落地品質）', () => {
  it('toRunwayLocal：沿向／橫偏正交', () => {
    const loc = toRunwayLocal({ x: 100, z: 40 }, DIR_E);
    expect(loc.along).toBeCloseTo(100);
    expect(loc.lateral).toBeCloseTo(40);
  });

  it('idealGlideAlt：距頭越遠越高；頭上 ≈ 下限', () => {
    const far = idealGlideAlt(2200);
    const near = idealGlideAlt(100);
    expect(far).toBeGreaterThan(near);
    expect(far).toBeCloseTo(2200 * Math.tan(GLIDE_ANGLE), 0);
    expect(idealGlideAlt(0)).toBe(12);
  });

  it('approachStatus：正中五邊 → 對正＋下滑 ok', () => {
    const half = L / 2;
    const dist = 1400;
    const along = -half - dist;
    const y = idealGlideAlt(dist);
    const st = approachStatus({
      pos: { x: along, y, z: 0 },
      heading: Math.atan2(DIR_E.x, -DIR_E.z),
      gearDown: true,
      runwayDir: DIR_E,
      runwayLength: L,
    });
    expect(st.onFinal).toBe(true);
    expect(st.alignOk).toBe(true);
    expect(st.lateralOk).toBe(true);
    expect(st.glideOk).toBe(true);
    expect(st.distToThreshold).toBeCloseTo(dist, 0);
  });

  it('approachStatus：偏高＋航向偏 → glide high／align 否', () => {
    const half = L / 2;
    const dist = 1400;
    const along = -half - dist;
    const st = approachStatus({
      pos: { x: along, y: idealGlideAlt(dist) + 120, z: 80 },
      heading: Math.atan2(DIR_E.x, -DIR_E.z) + 0.35,
      gearDown: false,
      runwayDir: DIR_E,
      runwayLength: L,
    });
    expect(st.onFinal).toBe(true);
    expect(st.alignOk).toBe(false);
    expect(st.lateralOk).toBe(false);
    expect(st.glideHint).toBe('high');
    expect(st.gearDown).toBe(false);
  });

  it('文案：Mode／Task／Home 皆 zh-Hant 且含關鍵字', () => {
    const half = L / 2;
    const st = approachStatus({
      pos: { x: -half - 1000, y: idealGlideAlt(1000), z: 0 },
      heading: Math.atan2(DIR_E.x, -DIR_E.z),
      gearDown: true,
      runwayDir: DIR_E,
      runwayLength: L,
    });
    expect(approachModeLabel(st)).toMatch(/對正|下滑|輪/);
    expect(approachTaskHtml(st, '高雄小港')).toContain('高雄小港');
    expect(approachTaskHtml(st, '高雄小港')).toContain('目標高度');
    const home = approachHomeCue(st);
    expect(home).not.toBeNull();
    expect(home?.label).toMatch(/跑道/);
  });

  it('judgeRunwayLanding：柔觸＋對正 → soft 3★；偏重偏離 → firm', () => {
    const soft = judgeRunwayLanding({ sinkRate: 2, bank: 0.05, lateralM: 5 });
    expect(soft.grade).toBe('soft');
    expect(soft.stars).toBe(3);
    const firm = judgeRunwayLanding({ sinkRate: 8, bank: 0.3, lateralM: 80 });
    expect(firm.grade).toBe('firm');
    expect(firm.stars).toBe(1);
  });

  it('landingSuccessToast：含載客與成績鉤子', () => {
    const j = judgeRunwayLanding({ sinkRate: 2, bank: 0.05, lateralM: 5 });
    const t = landingSuccessToast(j, { pax: 250, gateNote: '航點全過 ✨' });
    expect(t).toContain('250');
    expect(t).toContain('漂亮落地');
    expect(t).toContain('航點全過');
    expect(t).toContain('⭐');
  });

  it('approachSpawnPose：對正、放輪、高度近理想下滑', () => {
    const pose = approachSpawnPose({ runwayDir: DIR_E, runwayLength: L, approachSpeed: 50 });
    expect(pose.gearDown).toBe(true);
    expect(pose.speed).toBe(50);
    expect(pose.heading).toBeCloseTo(Math.atan2(1, 0));
    const st = approachStatus({
      pos: { x: pose.x, y: pose.y, z: pose.z },
      heading: pose.heading,
      gearDown: true,
      runwayDir: DIR_E,
      runwayLength: L,
    });
    expect(st.onFinal).toBe(true);
    expect(st.alignOk).toBe(true);
    expect(Math.abs(st.altErr)).toBeLessThan(40);
  });

  it('finalApproachPoints：4 點、皆 final、末點近跑道頭', () => {
    const pts = finalApproachPoints(DIR_E, L);
    expect(pts.length).toBe(4);
    expect(pts.every((p) => p.leg === 'final')).toBe(true);
    expect(pts[0].alt).toBeGreaterThan(pts[pts.length - 1].alt);
    expect(pts[pts.length - 1].alt).toBeLessThan(30);
    expect(Math.abs(pts[0].z)).toBeLessThan(1);
  });

  it('ALIGN／LATERAL 常數合理（6 歲友善）', () => {
    expect(ALIGN_OK_RAD).toBeGreaterThan(0.05);
    expect(LATERAL_OK_M).toBeGreaterThan(15);
  });
});
