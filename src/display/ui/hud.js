// @ts-check
// display HUD 控制器：每視口一層 `hud-layer`，內含 6 固定槽位。
// 顯隱規則：slot 顯示 ⟺ slotVisibility(mode)[slot] 且 該 slot 有內容。
// 分屏佈局靠 body.split CSS class（左右半屏），不在 JS 算 px。
// 北極星 DESIGN_WEB_UI.md §5。
import { SLOT_NAMES, slotVisibility } from './hud-slots.js';

export class Hud {
  /** @param {Document} [doc] */
  constructor(doc = document) {
    this._doc = doc;
    this.layers = [0, 1].map((i) => {
      const layer = /** @type {HTMLElement} */ (doc.getElementById(`hud-${i}`));
      /** @type {Record<string, HTMLElement>} */
      const slots = {};
      for (const name of SLOT_NAMES) {
        const el = layer?.querySelector(`[data-slot="${name}"]`);
        if (el) slots[name] = /** @type {HTMLElement} */ (el);
      }
      return { layer, slots, mode: 'free', toastTimer: /** @type {any} */ (0) };
    });
  }

  /** 分屏佈局：2 人 → body.split（左右半屏）；1 人 → 滿版 @param {number} count */
  layout(count) {
    this._doc.body.classList.toggle('split', count === 2);
  }

  /** 整層顯隱（這個 slot 有沒有人駕駛） @param {number} slot @param {boolean} on */
  setActive(slot, on) {
    this.layers[slot]?.layer?.classList.toggle('show', on);
  }

  /**
   * 切換該視口 mode（contextual 契約）；隱藏非 eligible 的槽位（內容由 setter 控顯）。
   * @param {number} slot @param {string} mode
   */
  applyMode(slot, mode) {
    const L = this.layers[slot];
    if (!L) return;
    L.mode = mode;
    const vis = slotVisibility(mode);
    for (const name of SLOT_NAMES) {
      if (!vis[name]) L.slots[name]?.classList.remove('show');
    }
  }

  /**
   * 通用槽位內容 setter。空字串＝隱藏並清空。受 mode eligible 節制。
   * @param {number} slot @param {string} name @param {string} html
   */
  set(slot, name, html) {
    const L = this.layers[slot];
    const el = L?.slots[name];
    if (!el) return;
    if (!slotVisibility(L.mode)[name] || !html) {
      el.classList.remove('show');
      el.innerHTML = '';
      return;
    }
    el.innerHTML = html;
    el.classList.add('show');
  }

  // —— 具名 setter（v1 元素歸位）——

  /** ModeSlot：機種 + 飛行狀態 @param {number} slot @param {string} html */
  setMode(slot, html) { this.set(slot, 'ModeSlot', html); }

  /** AltBand：高度 + 速度（parked 傳空字串即隱藏） @param {number} slot @param {string} html */
  setAlt(slot, html) { this.set(slot, 'AltBand', html); }

  /**
   * HomeSlot：回家箭頭 + 距離標籤。label=null → 隱藏（飛離機場才亮）。
   * @param {number} slot @param {number} angleRad @param {string|null} label
   */
  setHome(slot, angleRad, label) {
    const L = this.layers[slot];
    const el = L?.slots.HomeSlot;
    if (!el) return;
    if (!slotVisibility(L.mode).HomeSlot || label === null) {
      el.classList.remove('show');
      return;
    }
    const arrow = /** @type {HTMLElement|null} */ (el.querySelector('.arrow'));
    const lbl = /** @type {HTMLElement|null} */ (el.querySelector('.home-label'));
    if (arrow) arrow.style.transform = `rotate(${angleRad}rad)`;
    if (lbl) lbl.textContent = label;
    el.classList.add('show');
  }

  /**
   * CenterSlot 瞬時 toast（起飛/降落/碰…）。不受持久契約節制——任何 mode 都出。
   * @param {number} slot @param {string} text
   */
  toast(slot, text) {
    const L = this.layers[slot];
    const el = L?.slots.CenterSlot;
    if (!el) return;
    el.textContent = text;
    el.classList.add('show', 'toast-fx');
    clearTimeout(L.toastTimer);
    L.toastTimer = setTimeout(() => {
      el.classList.remove('show', 'toast-fx');
      el.textContent = '';
    }, 2200);
  }
}
