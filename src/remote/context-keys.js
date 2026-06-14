// @ts-check
// remote context 動作鍵 slot：2 顆可替換大鍵。每模式換 config 不改框架（UI 層的 B1）。
// v1.1-0 預設「喇叭 / 降落輔助」；V2 換「開火 / 換武器」、任務模式換任務動作。
// 北極星 DESIGN_WEB_UI.md §6。
import { BTN } from '../../shared/protocol.js';

/**
 * @typedef {{
 *   id: string,            // 識別
 *   label: string,         // 鍵面文字（含 emoji）
 *   hint?: string,         // 小字提示
 *   btn?: number,          // 按住時疊進 in.b 的 bitmask（momentary）
 *   action?: string,       // 點擊動作 id（main 端對應 handler）
 * }} ContextKey
 */

/** 自由飛/任務模式預設兩顆。換玩法＝換這份 config。 */
export const FREE_FLIGHT_KEYS = /** @type {ContextKey[]} */ ([
  { id: 'horn', label: '🔊 喇叭', hint: '叭叭！', action: 'horn' }, // 聲音從自己手機播（兩機同玩不互相干擾）
  { id: 'land', label: '🛬 降落輔助', hint: '收油門＋放輪', action: 'landAssist' },
]);

// —— V2 佔位 config（v2.0-1 先定資料；發射 btn 位元由 v2.0-2 加進 protocol，
//    remote 端依模式換上這份鍵由 v2.0-5 接）——

/** 空戰模式兩顆替換鍵：發射（按住連發、display 依冷卻節流）+ 換武器（上升緣循環）。 */
export const DOGFIGHT_KEYS = /** @type {ContextKey[]} */ ([
  { id: 'fire', label: '🔥 發射', hint: '飛近自動鎖定', btn: BTN.FIRE },
  { id: 'weapon', label: '🎯 換武器', hint: '卡通/飛彈', btn: BTN.WEAPON_SWITCH },
]);

/** 競速模式兩顆替換鍵：衝刺 + 降落輔助。 */
export const RACE_KEYS = /** @type {ContextKey[]} */ ([
  { id: 'boost', label: '💨 衝刺', hint: '競速加速', action: 'boost' },
  { id: 'land', label: '🛬 降落輔助', hint: '收油門＋放輪', action: 'landAssist' },
]);

/** mode → context 鍵 config（remote 換玩法時查此表，v2.0-5 接線）。 */
export const KEYS_BY_MODE = {
  free: FREE_FLIGHT_KEYS,
  mission: FREE_FLIGHT_KEYS,
  dogfight: DOGFIGHT_KEYS,
  race: RACE_KEYS,
};

/** @param {string} mode @returns {ContextKey[]} 未知 mode → 退回自由飛鍵（不爆） */
export function keysForMode(mode) {
  return KEYS_BY_MODE[/** @type {keyof typeof KEYS_BY_MODE} */ (mode)] ?? FREE_FLIGHT_KEYS;
}

/**
 * 把 context 鍵掛進容器並接事件。
 * - 有 btn 的鍵＝momentary：按住期間其 bit 進輸入（放開/離開/取消即清）。
 * - 有 action 的鍵＝click 觸發 handler。
 * @param {HTMLElement} container
 * @param {ContextKey[]} keys
 * @param {{ onAction?: (action:string)=>void }} [handlers]
 * @returns {{ heldMask: () => number }} heldMask()＝目前按住鍵的 bitmask 聯集
 */
export function mountContextKeys(container, keys, handlers = {}) {
  container.innerHTML = '';
  /** @type {Set<number>} */
  const held = new Set();
  for (const key of keys) {
    const btn = document.createElement('button');
    btn.className = 'tactile ctx-key';
    btn.dataset.keyId = key.id;
    btn.innerHTML = key.hint
      ? `${key.label}<br/><span class="ctx-hint">${key.hint}</span>`
      : key.label;

    if (key.btn !== undefined) {
      const bit = key.btn;
      const press = (/** @type {Event} */ e) => { e.preventDefault(); held.add(bit); btn.classList.add('held'); };
      const release = () => { held.delete(bit); btn.classList.remove('held'); };
      btn.addEventListener('pointerdown', press, { passive: false });
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
    }
    if (key.action) {
      const action = key.action;
      btn.addEventListener('click', () => handlers.onAction?.(action));
    }
    container.appendChild(btn);
  }
  return { heldMask: () => [...held].reduce((m, b) => m | b, 0) };
}
