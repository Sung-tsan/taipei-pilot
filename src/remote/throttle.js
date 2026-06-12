// @ts-check
// 油門豎滑桿：pointer events，往上推 = 加油門。放開「不回彈」（飛機油門桿，不是油門踏板）。

export class ThrottleSlider {
  /**
   * @param {HTMLElement} track 滑軌元素
   * @param {HTMLElement} fill 填色元素（高度 = 油門量）
   */
  constructor(track, fill) {
    this.value = 0;
    this._track = track;
    this._fill = fill;
    track.addEventListener('pointerdown', (e) => this._onPointer(e), { passive: false });
    track.addEventListener('pointermove', (e) => {
      if (e.buttons > 0 || e.pointerType === 'touch') this._onPointer(e);
    }, { passive: false });
  }

  /** @param {PointerEvent} e */
  _onPointer(e) {
    e.preventDefault();
    const rect = this._track.getBoundingClientRect();
    const frac = 1 - (e.clientY - rect.top) / rect.height;
    this.value = Math.min(1, Math.max(0, frac));
    this._render();
  }

  /** @param {number} v */
  set(v) {
    this.value = Math.min(1, Math.max(0, v));
    this._render();
  }

  _render() {
    this._fill.style.height = `${Math.round(this.value * 100)}%`;
  }
}
