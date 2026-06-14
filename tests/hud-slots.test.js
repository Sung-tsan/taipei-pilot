// @ts-check
import { describe, it, expect } from 'vitest';
import { SLOT_NAMES, slotVisibility, HUD_MODES } from '../src/display/ui/hud-slots.js';

describe('slotVisibility（HUD 6 槽位 contextual 契約）', () => {
  it('free 模式：機種/高度/回家/狀態 eligible；任務卡與中央導引隱藏', () => {
    const v = slotVisibility('free');
    expect(v.ModeSlot).toBe(true);
    expect(v.AltBand).toBe(true);
    expect(v.HomeSlot).toBe(true);
    expect(v.StatusSlot).toBe(true);  // 為 v1.1-1 ❤️ 預留（本輪無內容→實際隱藏）
    expect(v.TaskSlot).toBe(false);   // v1.1-4 切 mission 才亮
    expect(v.CenterSlot).toBe(false); // toast 走瞬時 overlay，不靠此契約
  });

  it('mission 模式：六槽全 eligible', () => {
    const v = slotVisibility('mission');
    for (const n of SLOT_NAMES) expect(v[n]).toBe(true);
  });

  it('未知 mode → 退回 free 契約（不爆）', () => {
    expect(slotVisibility('weird')).toEqual(slotVisibility('free'));
  });

  it('HUD_MODES 含 V2 兩模式 dogfight + race', () => {
    expect(HUD_MODES).toContain('dogfight');
    expect(HUD_MODES).toContain('race');
  });

  it('dogfight 模式：鎖定框(CenterSlot) + 彈藥(StatusSlot) + 計分(TaskSlot) + 子模式(ModeSlot) eligible', () => {
    const v = slotVisibility('dogfight');
    expect(v.CenterSlot).toBe(true); // 鎖定框（v2.0-5 填）
    expect(v.StatusSlot).toBe(true); // 彈藥/冷卻
    expect(v.TaskSlot).toBe(true);   // 擊落數/命中率計分
    expect(v.ModeSlot).toBe(true);   // 子模式標示
  });

  it('race 模式：名次/計時(TaskSlot) + banner(CenterSlot) eligible', () => {
    const v = slotVisibility('race');
    expect(v.TaskSlot).toBe(true);   // 名次/計時（v2.1-1 填）
    expect(v.CenterSlot).toBe(true); // 名次 banner
  });

  it('每個已知 mode 的鍵集合都剛好涵蓋全部槽位名', () => {
    for (const m of HUD_MODES) {
      expect(Object.keys(slotVisibility(m)).sort()).toEqual([...SLOT_NAMES].sort());
    }
  });
});
