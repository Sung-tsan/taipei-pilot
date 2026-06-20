// @ts-check
// V5 航線巡航引擎：時間壓縮 + climb→cruise→arrived 狀態機 + 半自動到達精準度。
import { describe, it, expect } from 'vitest';
import {
  makeCruise, stepCruise, cruiseDuration, arrivalAccuracy, cruiseEtaSec, cruisePhaseLabel,
  CRUISE_MIN_SEC, CRUISE_MAX_SEC, CRUISE_ENTER_ALT,
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
