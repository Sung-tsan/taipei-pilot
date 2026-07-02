// @ts-check
// v5.2 調參中心：載入/儲存/還原/套用（含 AI 表同步），注入 storage 直測。
import { describe, it, expect, afterEach } from 'vitest';
import { TUNING, KNOBS, applyKnob, loadTuning, saveTuning, resetTuning, exportTuning } from '../src/display/tuning.js';
import { AI } from '../src/display/combat/enemy-ai.js';
import { RANGE_K, canReach } from '../src/display/missions/fuel.js';

function memStorage() {
  /** @type {Record<string,string>} */ const m = {};
  return {
    getItem: (/** @type {string} */ k) => m[k] ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => { m[k] = v; },
    removeItem: (/** @type {string} */ k) => { delete m[k]; },
    _m: m,
  };
}

afterEach(() => resetTuning(memStorage())); // 模組單例：每題後還原預設，不污染他測

describe('tuning — 手感調參中心', () => {
  it('預設值＝源頭常數（rangeK=RANGE_K、enemyCap=AI 出廠 CAP、倍率=1）', () => {
    expect(TUNING.rangeK).toBe(RANGE_K);
    expect(TUNING.windMul).toBe(1);
    expect(TUNING.enemyCap).toBe(AI.CURVE_CAP);
  });

  it('applyKnob(enemyCap) 同步寫回 AI.CURVE_CAP；非法值/未知鍵忽略', () => {
    applyKnob('enemyCap', 0.6);
    expect(AI.CURVE_CAP).toBe(0.6);
    applyKnob('enemyCap', NaN);
    expect(AI.CURVE_CAP).toBe(0.6); // NaN 不覆寫
    applyKnob('nonsense', 5);
    expect(/** @type {any} */ (TUNING).nonsense).toBeUndefined();
  });

  it('save 只存差異、load 套回、reset 清乾淨', () => {
    const st = memStorage();
    applyKnob('windMul', 2.5);
    applyKnob('rangeK', 0.25);
    saveTuning(st);
    const stored = JSON.parse(/** @type {string} */ (st.getItem('tp_tuning')));
    expect(Object.keys(stored).sort()).toEqual(['rangeK', 'windMul']); // 只有動過的
    resetTuning(st);
    expect(TUNING.windMul).toBe(1);
    expect(st.getItem('tp_tuning')).toBeNull();
    st.setItem('tp_tuning', JSON.stringify({ turbMul: 1.8 }));
    loadTuning(st);
    expect(TUNING.turbMul).toBe(1.8);
  });

  it('rangeK 覆寫實際改變航程 gate（canReach 吃可選 K）', () => {
    // fuelSec=1000、距離 200km：K=0.18 → 180km 不可達；K=0.25 → 250km 可達
    expect(canReach(1000, 200)).toBe(false);
    expect(canReach(1000, 200, 0.25)).toBe(true);
  });

  it('KNOBS 每顆都對到 TUNING 既有鍵；exportTuning 是合法 JSON', () => {
    for (const k of KNOBS) expect(k.key in TUNING).toBe(true);
    expect(() => JSON.parse(exportTuning())).not.toThrow();
  });
});
