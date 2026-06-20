// @ts-check
// ATC phraseology（v5.1-1 機場感知 + grounded bank）：DRAFT 紀律 + grounding 不變式 + 機場代入。
import { describe, it, expect } from 'vitest';
import {
  ATC_DRAFT, ATC_BANK_DRAFT, atcLine,
  atcCleared, atcTaxiToHold, atcHoldShort, atcDocked, atcBoarding, atcPushback, atcExit, atcTaxiToGate, atcBoardComplete,
} from '../src/display/scene/atc-phraseology.js';

describe('ATC phraseology（v5.1-1，DRAFT 待 Sung 校稿/校審）', () => {
  it('ATC_DRAFT 與 ATC_BANK_DRAFT 皆 true（地板 + bank 變體都待 Sung 把關）', () => {
    expect(ATC_DRAFT).toBe(true);
    expect(ATC_BANK_DRAFT).toBe(true);
  });

  it('grounding 不變式：每階段（多次抽變體）都含 站名 + 呼號 + 該階段關鍵詞', () => {
    const cases = /** @type {Array<[Function, any[], string]>} */ ([
      [atcCleared, ['RWY 10'], '起飛'],
      [atcTaxiToHold, ['RWY 10'], '滑'],
      [atcHoldShort, ['RWY 10'], '等待'],
      [atcPushback, ['5 號門'], '後推'],
      [atcExit, ['脫離道 B', '5 號門'], '脫離'],
      [atcTaxiToGate, ['5 號門'], '靠橋'],
      [atcDocked, ['5 號門'], '靠橋'],
      [atcBoardComplete, ['5 號門'], '確認'],
    ]);
    for (const [fn, args, kw] of cases) {
      for (let n = 0; n < 15; n++) { // 多抽幾次涵蓋隨機變體 + 地板
        const t = fn(...args);
        expect(t, `${fn.name} 缺站名`).toContain('松山');
        expect(t, `${fn.name} 缺呼號`).toContain('小飛官');
        expect(t, `${fn.name} 缺關鍵詞 ${kw}`).toContain(kw);
        expect(t, `${fn.name} 有殘留 placeholder`).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it('機場感知：站名走 airport（不再 hardcode 松山）', () => {
    const t = atcCleared('RWY 09', '高雄小港');
    expect(t).toContain('高雄小港');
    expect(t).toContain('RWY 09');
    expect(t).not.toContain('松山');
  });

  it('atcLine：缺 ctx 欄位 → 退固定地板（仍 grounded），不留 placeholder', () => {
    // 用一個會缺 gate 的階段、強制 bank 取不到（rng 後仍可能填不全）→ 至少不含殘留 placeholder
    const t = atcLine('docked', { station: '金門', gate: '2 號門' }, () => 0);
    expect(t).toContain('金門');
    expect(t).not.toMatch(/\{\w+\}/);
  });

  it('起飛許可：含跑道 + 呼號 + 站台 + 起飛（任一變體/地板皆成立）', () => {
    const t = atcCleared('RWY 10');
    expect(t).toContain('RWY 10');
    expect(t).toContain('小飛官');
    expect(t).toContain('松山');
    expect(t).toContain('起飛');
  });

  it('登機計數器（floor-only，非 bank 階段）成形', () => {
    expect(atcBoarding('5 號門', 36)).toContain('36/72');
  });
});
