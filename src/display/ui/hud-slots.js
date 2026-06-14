// @ts-check
// HUD 槽位契約（純資料/純函式，vitest 直測，零 DOM）。
// 這是 UI 層的 B1：槽位名與「哪個 mode 亮哪些槽位」一次定義，V1–V5 填內容不重畫。
// 北極星 DESIGN_WEB_UI.md §5。

/** 6 個固定槽位（順序＝ DOM 與測試枚舉用） */
export const SLOT_NAMES = /** @type {const} */ ([
  'TaskSlot', 'StatusSlot', 'ModeSlot', 'CenterSlot', 'AltBand', 'HomeSlot',
]);

/**
 * 每個玩法 mode 的「持久槽位契約」＝該模式下哪些槽位 eligible（可顯示）。
 * eligible 只是「允許」；實際顯示還要該槽位有內容（見 Hud.set）。
 * CenterSlot 的瞬時 toast 不受此表節制（任何模式撞機都要 toast，見 Hud.toast）。
 */
const MODE_SLOTS = {
  // 自由飛（v1.1-0 唯一模式）：機種/高度/回家亮；任務卡與中央導引留空契約。
  // StatusSlot 列入 eligible 是為 v1.1-1 的 ❤️ 在自由飛也能亮——本輪無內容故隱藏。
  free: ['StatusSlot', 'ModeSlot', 'AltBand', 'HomeSlot'],
  // 任務模式（v1.1-4 接）：六槽全 eligible。
  mission: ['TaskSlot', 'StatusSlot', 'ModeSlot', 'CenterSlot', 'AltBand', 'HomeSlot'],
  // 空戰模式（v2.0-1 佔位，內容由 v2.0-5 填）：鎖定框→CenterSlot、彈藥/冷卻→StatusSlot、
  // 擊落數/命中率→TaskSlot（計分）、子模式標示→ModeSlot。六槽全 eligible。
  dogfight: ['TaskSlot', 'StatusSlot', 'ModeSlot', 'CenterSlot', 'AltBand', 'HomeSlot'],
  // 競速模式（v2.0-1 佔位，內容由 v2.1-1 填）：名次/計時→TaskSlot、名次 banner→CenterSlot。
  race: ['TaskSlot', 'StatusSlot', 'ModeSlot', 'CenterSlot', 'AltBand', 'HomeSlot'],
};

/**
 * @param {string} mode
 * @returns {Record<string, boolean>} 每個槽位名 → 是否 eligible（可顯示）
 */
export function slotVisibility(mode) {
  const active = MODE_SLOTS[/** @type {keyof typeof MODE_SLOTS} */ (mode)] ?? MODE_SLOTS.free;
  return Object.fromEntries(SLOT_NAMES.map((n) => [n, active.includes(n)]));
}

/** 已知 mode 清單（給 UI/測試列舉） */
export const HUD_MODES = /** @type {const} */ (['free', 'mission', 'dogfight', 'race']);
