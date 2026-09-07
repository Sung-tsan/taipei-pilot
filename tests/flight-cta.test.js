// @ts-check
// P1-5：落地 CTA 純函式（再飛／換對場／成績文案）。
import { describe, it, expect } from 'vitest';
import {
  FLAGSHIP_ROUTE_IDS,
  CTA_AUTO_DISMISS_MS,
  shouldShowFlightCta,
  replayPlan,
  pairSwapPlan,
  nextFlagshipPlan,
  resolveSwapPlan,
  formatScoreLines,
  ctaButtonLabels,
} from '../src/display/ui/flight-cta.js';

/** @type {import('../src/display/ui/flight-cta.js').FlightResult} */
const SAMPLE = {
  routeId: 'tsa-khh',
  pax: 250,
  fromId: 'tsa',
  toId: 'khh',
  gateScore: 1,
  punctual: true,
  gateLabel: '1 號門',
};

const name = (/** @type {string} */ id) => ({ tsa: '台北松山', khh: '高雄小港', hun: '花蓮' }[id] ?? id);

describe('flight-cta P1-5', () => {
  it('CTA_AUTO_DISMISS_MS ≤ 15s', () => {
    expect(CTA_AUTO_DISMISS_MS).toBeLessThanOrEqual(15_000);
  });

  it('shouldShowFlightCta：有航線脈絡才顯示；非民航可關', () => {
    expect(shouldShowFlightCta(SAMPLE)).toBe(true);
    expect(shouldShowFlightCta(null)).toBe(false);
    expect(shouldShowFlightCta({ ...SAMPLE, routeId: '' })).toBe(false);
    expect(shouldShowFlightCta(SAMPLE, { isCivil: false })).toBe(false);
    expect(shouldShowFlightCta(SAMPLE, { isCivil: true })).toBe(true);
  });

  it('replayPlan：回松山再飛高雄', () => {
    expect(replayPlan(SAMPLE)).toEqual({
      kind: 'replay', routeId: 'tsa-khh', originId: 'tsa', destId: 'khh',
    });
  });

  it('pairSwapPlan：RCKH↔RCSS 對飛', () => {
    expect(pairSwapPlan(SAMPLE)).toEqual({
      kind: 'pair', routeId: 'tsa-khh', originId: 'khh', destId: 'tsa',
    });
  });

  it('nextFlagshipPlan：松山→高雄 之後換松山→花蓮', () => {
    expect(nextFlagshipPlan(SAMPLE, FLAGSHIP_ROUTE_IDS)).toEqual({
      kind: 'flagship', routeId: 'tsa-hun', originId: 'tsa', destId: 'hun',
    });
    const hun = { ...SAMPLE, routeId: 'tsa-hun', toId: 'hun' };
    expect(nextFlagshipPlan(hun)?.routeId).toBe('tsa-khh');
  });

  it('resolveSwapPlan 預設對飛；preferFlagship 用旗艦', () => {
    expect(resolveSwapPlan(SAMPLE).kind).toBe('pair');
    expect(resolveSwapPlan(SAMPLE, { preferFlagship: true }).routeId).toBe('tsa-hun');
  });

  it('formatScoreLines：含 P1-3 落地品質星', () => {
    const lines = formatScoreLines({ ...SAMPLE, landingGrade: 'soft', landingStars: 3 }, name);
    expect(lines.some((l) => l.includes('漂亮落地'))).toBe(true);
    expect(lines.some((l) => l.includes('⭐'))).toBe(true);
  });

  it('formatScoreLines：準點／載客／航點／門', () => {
    const lines = formatScoreLines(SAMPLE, name);
    expect(lines[0]).toContain('台北松山');
    expect(lines[0]).toContain('高雄小港');
    expect(lines.some((l) => l.includes('準點'))).toBe(true);
    expect(lines.some((l) => l.includes('250'))).toBe(true);
    expect(lines.some((l) => l.includes('航點全過'))).toBe(true);
    expect(lines.some((l) => l.includes('1 號門'))).toBe(true);
  });

  it('ctaButtonLabels：三選一文案', () => {
    const labels = ctaButtonLabels(SAMPLE, pairSwapPlan(SAMPLE), name);
    expect(labels.replay.title).toContain('同一航線');
    expect(labels.swap.title).toContain('換對場');
    expect(labels.swap.sub).toContain('高雄小港');
    expect(labels.score.title).toContain('成績');
  });
});
