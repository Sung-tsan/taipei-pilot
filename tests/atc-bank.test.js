// @ts-check
// V5.1-1 ATC bank（runtime 挑變體 + 結構/grounding 驗證 + 固定地板 fallback）。
import { describe, it, expect } from 'vitest';
import {
  ATC_BANK, ATC_STAGES, ATC_BANK_DRAFT, validateVariant, fillTemplate, pickVariant,
} from '../src/display/scene/atc-bank.js';

const CTX = { cs: '小飛官', station: '台北松山', rwy: 'RWY 10', gate: '5 號門', exit: '脫離道 B' };

describe('ATC bank 完整性', () => {
  it('DRAFT 旗標 true（待 Sung 校審）', () => { expect(ATC_BANK_DRAFT).toBe(true); });

  it('每個階段都有 ≥1 個合格變體（否則 runtime 永遠退地板）', () => {
    for (const stage of ATC_STAGES) {
      const valid = (ATC_BANK[stage] || []).filter((t) => validateVariant(t, stage));
      expect(valid.length, `${stage} 無合格變體`).toBeGreaterThan(0);
    }
  });

  it('bank 內每個變體都通過自身結構/grounding 驗證（不夾帶不合格）', () => {
    for (const stage of ATC_STAGES) {
      for (const t of ATC_BANK[stage] || []) {
        expect(validateVariant(t, stage), `${stage}: ${t}`).toBe(true);
      }
    }
  });
});

describe('validateVariant（三件套之結構驗證）', () => {
  it('拒空 / 缺關鍵詞 / 缺 {station} / 未知 placeholder', () => {
    expect(validateVariant('', 'cleared')).toBe(false);
    expect(validateVariant('🗼 {station}塔台，{cs}，{rwy} 你好', 'cleared')).toBe(false); // 缺「起飛」
    expect(validateVariant('🗼 {cs}，{rwy} 可以起飛', 'cleared')).toBe(false);            // 缺 {station}
    expect(validateVariant('🗼 {station} {cs} {rwy} 可以起飛 {bogus}', 'cleared')).toBe(false); // 未知 placeholder
  });
  it('接受合格變體', () => {
    expect(validateVariant('🗼 {cs}，{station}塔台，{rwy} 可以起飛！', 'cleared')).toBe(true);
  });
});

describe('fillTemplate / pickVariant', () => {
  it('fillTemplate 代入真實 data；未知 key 留原樣', () => {
    expect(fillTemplate('{station}塔台 {rwy}', CTX)).toBe('台北松山塔台 RWY 10');
    expect(fillTemplate('{nope}', CTX)).toBe('{nope}');
  });

  it('pickVariant 回填好的句子（無殘留 placeholder），deterministic with rng', () => {
    const t = pickVariant('cleared', CTX, () => 0);
    expect(t).toBeTruthy();
    expect(t).not.toMatch(/\{\w+\}/);
    expect(t).toContain('台北松山');
    expect(t).toContain('起飛');
    expect(pickVariant('cleared', CTX, () => 0)).toBe(t); // 同 rng → 同變體
  });

  it('未知階段 → null（呼叫端退地板）', () => {
    expect(pickVariant('nope', CTX, () => 0)).toBeNull();
  });

  it('ctx 缺欄位導致填不全 → null（安全網退地板，不吐 placeholder）', () => {
    expect(pickVariant('cleared', { cs: '小飛官', station: '松山' }, () => 0)).toBeNull(); // 缺 rwy
  });
});
