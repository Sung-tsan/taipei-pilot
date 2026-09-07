// @ts-check
// V5 航線巡航引擎：時間壓縮 + climb→cruise→arrived 狀態機 + 半自動到達精準度。
import { describe, it, expect } from 'vitest';
import {
  makeCruise, stepCruise, cruiseDuration, arrivalAccuracy, cruiseEtaSec, cruisePhaseLabel,
  CRUISE_MIN_SEC, CRUISE_MAX_SEC, CRUISE_MIN_SEC_REALISTIC, CRUISE_MAX_SEC_REALISTIC, CRUISE_ENTER_ALT,
  makeCruiseBeats, placeCruiseGates, stepCruiseBeats, nextCruiseBeat,
  cruiseGateScore, cruiseNextLabel, CRUISE_GATE_RADIUS, CRUISE_GATE_MISS_SLACK,
} from '../src/display/missions/route-engine.js';

/** @type {any} */ const ROUTE = { id: 'tsa-khh', from: 'tsa', to: 'khh', name: '松山→高雄', fact: { text: '', draft: true } };

describe('時間壓縮', () => {
  it('巡航秒數夾在 [MIN,MAX]：近線被夾到 MIN、超遠夾到 MAX', () => {
    expect(cruiseDuration(50)).toBe(CRUISE_MIN_SEC);   // 50/6≈8 → 夾到 22
    expect(cruiseDuration(400)).toBe(CRUISE_MAX_SEC);  // 400/6≈67 → 夾到 48
    const mid = cruiseDuration(180);                   // 180/6=30 → 介於
    expect(mid).toBeGreaterThan(CRUISE_MIN_SEC);
    expect(mid).toBeLessThan(CRUISE_MAX_SEC);
  });
});

describe('巡航狀態機', () => {
  it('makeCruise：起始 phase=climb、progress=0', () => {
    const c = makeCruise(ROUTE, 280);
    expect(c.phase).toBe('climb');
    expect(c.progress).toBe(0);
    expect(c.durationSec).toBe(cruiseDuration(280));
  });

  it('低於進雲高度 → 維持 climb；達 CRUISE_ENTER_ALT → 進 cruise（一次性 justEnteredCruise）', () => {
    const c = makeCruise(ROUTE, 280);
    let r = stepCruise(c, { dt: 1 / 60, alt: CRUISE_ENTER_ALT - 100 });
    expect(r.phase).toBe('climb');
    expect(r.justEnteredCruise).toBe(false);
    r = stepCruise(c, { dt: 1 / 60, alt: CRUISE_ENTER_ALT + 50 });
    expect(r.phase).toBe('cruise');
    expect(r.justEnteredCruise).toBe(true);
    // 再一步不會再觸發 justEnteredCruise
    r = stepCruise(c, { dt: 1 / 60, alt: CRUISE_ENTER_ALT + 50 });
    expect(r.justEnteredCruise).toBe(false);
  });

  it('cruise 段 progress 隨時間推進、到 1 → descent（一次性 justArrived）', () => {
    const c = makeCruise(ROUTE, 120); // durationSec=22（夾 MIN）
    stepCruise(c, { dt: 1 / 60, alt: 700 }); // 進 cruise
    let arrived = false;
    for (let t = 0; t < 60 && !arrived; t += 0.5) {
      const r = stepCruise(c, { dt: 0.5, alt: 700 });
      if (r.justArrived) { arrived = true; expect(r.phase).toBe('descent'); }
      expect(r.progress).toBeGreaterThanOrEqual(0);
      expect(r.progress).toBeLessThanOrEqual(1);
    }
    expect(arrived).toBe(true);
    expect(c.progress).toBe(1);
    // 抵達後再 step 不再推進（descent 不動）
    const after = stepCruise(c, { dt: 1, alt: 700 });
    expect(after.justArrived).toBe(false);
    expect(after.phase).toBe('descent');
  });

  it('ETA：cruise 段隨進度遞減、抵達為 0', () => {
    const c = makeCruise(ROUTE, 180);
    stepCruise(c, { dt: 1 / 60, alt: 700 });
    const eta0 = cruiseEtaSec(c);
    expect(eta0).toBeGreaterThan(0);
    for (let t = 0; t < 5; t += 0.5) stepCruise(c, { dt: 0.5, alt: 700 });
    expect(cruiseEtaSec(c)).toBeLessThan(eta0);
  });
});

describe('半自動到達精準度', () => {
  it('不亂動方向＝高精準度（1）；一直微調 → 精準度下降', () => {
    const c1 = makeCruise(ROUTE, 180);
    stepCruise(c1, { dt: 1 / 60, alt: 700 });
    for (let t = 0; t < 10; t += 0.5) stepCruise(c1, { dt: 0.5, alt: 700, headingAdjust: 0 });
    expect(arrivalAccuracy(c1)).toBe(1);

    const c2 = makeCruise(ROUTE, 180);
    stepCruise(c2, { dt: 1 / 60, alt: 700 });
    for (let t = 0; t < 30; t += 0.5) stepCruise(c2, { dt: 0.5, alt: 700, headingAdjust: 1 });
    expect(arrivalAccuracy(c2)).toBeLessThan(1);
  });
});

describe('HUD 標籤', () => {
  it('各 phase 都有非空中文標籤', () => {
    for (const p of /** @type {const} */ (['climb', 'cruise', 'descent', 'arrived'])) {
      expect(cruisePhaseLabel(p).length).toBeGreaterThan(0);
    }
  });
});


describe('P1-2 巡航節拍（世界航點＋互動）', () => {
  it('makeCruiseBeats：2 閘門 + 1 天氣，progress 遞增', () => {
    const beats = makeCruiseBeats('高雄小港');
    expect(beats.filter((b) => b.kind === 'gate')).toHaveLength(2);
    expect(beats.filter((b) => b.kind === 'weather')).toHaveLength(1);
    const progresses = beats.map((b) => b.atProgress);
    expect(progresses).toEqual([...progresses].sort((a, b) => a - b));
    expect(beats[2].label).toContain('高雄小港');
  });

  it('placeCruiseGates：兩座閘門在航向前方、帶側向偏置', () => {
    const beats = makeCruiseBeats('高雄');
    const gates = placeCruiseGates({ x: 0, z: 0 }, 0, 700, beats); // heading 0 → −Z
    expect(gates).toHaveLength(2);
    expect(gates[0].z).toBeLessThan(0); // 前方 −Z
    expect(gates[1].z).toBeLessThan(gates[0].z); // 更遠
    expect(gates[0].y).toBe(700);
    expect(gates[0].r).toBe(CRUISE_GATE_RADIUS);
    // 之字：兩座 lateral 符號不同（x 一負一正，heading 0 時 nx=1）
    expect(Math.sign(gates[0].x)).not.toBe(Math.sign(gates[1].x));
  });

  it('stepCruiseBeats：飛進閘門 → hit；逾時未穿 → miss；天氣依 progress', () => {
    const beats = makeCruiseBeats('高雄');
    const gates = placeCruiseGates({ x: 0, z: 0 }, 0, 700, beats);
    // 飛到第一閘門中心
    let ev = stepCruiseBeats(beats, gates, 0.2, { x: gates[0].x, z: gates[0].z });
    expect(ev.justHit?.id).toBe('gate1');
    expect(beats[0].hit).toBe(true);
    expect(beats[0].resolved).toBe(true);
    // 天氣拍
    ev = stepCruiseBeats(beats, gates, 0.51, { x: 0, z: 0 });
    expect(ev.justWeather?.id).toBe('wx1');
    // 第二閘門：故意飛遠、progress 超過 miss slack
    const missAt = beats[2].atProgress + CRUISE_GATE_MISS_SLACK + 0.01;
    ev = stepCruiseBeats(beats, gates, missAt, { x: 9999, z: 9999 });
    expect(ev.justMissed?.id).toBe('gate2');
    expect(beats[2].hit).toBe(false);
    expect(cruiseGateScore(beats)).toBe(0.5);
  });

  it('nextCruiseBeat / cruiseNextLabel：未解決者優先，中文非空', () => {
    const beats = makeCruiseBeats('花蓮');
    expect(nextCruiseBeat(beats)?.id).toBe('gate1');
    expect(cruiseNextLabel(nextCruiseBeat(beats))).toContain('西岸航點');
    beats[0].resolved = true; beats[0].hit = true;
    expect(nextCruiseBeat(beats)?.kind).toBe('weather');
    expect(cruiseNextLabel(nextCruiseBeat(beats))).toContain('雲層');
    for (const b of beats) b.resolved = true;
    expect(nextCruiseBeat(beats)).toBeNull();
    expect(cruiseNextLabel(null)).toContain('進場');
  });
});

describe('P1-6 真實模式巡航時長（輕閘）', () => {
  it('realistic 夾值明顯長於 shortHaul 預設', () => {
    expect(cruiseDuration(50, 'realistic')).toBe(CRUISE_MIN_SEC_REALISTIC);
    expect(cruiseDuration(50)).toBe(CRUISE_MIN_SEC); // 預設 shortHaul 不變
    expect(cruiseDuration(900, 'realistic')).toBe(CRUISE_MAX_SEC_REALISTIC);
    expect(cruiseDuration(900)).toBe(CRUISE_MAX_SEC);
    expect(makeCruise(ROUTE, 180, 'realistic').durationSec).toBeGreaterThan(makeCruise(ROUTE, 180).durationSec);
  });
});
