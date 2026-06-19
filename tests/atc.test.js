// @ts-check
import { describe, it, expect } from 'vitest';
import {
  ATC_DRAFT, atcCleared, atcTaxiToHold, atcHoldShort, atcDocked, atcBoarding, atcPushback, atcExit, atcTaxiToGate,
} from '../src/display/scene/atc-phraseology.js';

describe('ATC phraseology（v4.1-2，DRAFT 待 Sung 校稿）', () => {
  it('ATC_DRAFT===true（紀律：用語為擬稿，未校稿不可當定稿）', () => {
    expect(ATC_DRAFT).toBe(true);
  });

  it('起飛許可：含跑道 + callsign 小飛官 + 松山塔台 + 可以起飛', () => {
    const t = atcCleared('RWY 10');
    expect(t).toContain('RWY 10');
    expect(t).toContain('小飛官');
    expect(t).toContain('松山塔台');
    expect(t).toContain('可以起飛');
  });

  it('每則用語都點名「松山」站台（真實感）', () => {
    const all = [atcPushback('5 號門'), atcTaxiToHold('RWY 10'), atcHoldShort('RWY 10'),
      atcCleared('RWY 10'), atcExit('脫離道 B', '5 號門'), atcTaxiToGate('5 號門'), atcDocked('5 號門')];
    for (const t of all) expect(t).toContain('松山');
  });

  it('地面/到場用語成形：等待點 / 靠橋 / 登機計數', () => {
    expect(atcTaxiToHold('RWY 10')).toContain('等待點');
    expect(atcDocked('5 號門')).toContain('靠橋');
    expect(atcBoarding('5 號門', 36)).toContain('36/72');
  });
});
