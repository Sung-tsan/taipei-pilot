// @ts-check
// 複雜版操控（大人「增操控感」）：方向舵 rudder（水平、放開回中）、襟翼 flaps（0..n 段）、
// 配平 trim（設定保持）。簡單版完全不掛這些；複雜版把三值疊進 in（向後相容，缺值＝中立）。
// 不動 tilt.js 重力投影（v0.2.x 真機調過的手感資產）。北極星 DESIGN_WEB_UI.md §6。
import { MAX_FLAPS } from '../../shared/constants.js';

export class ComplexControls {
  /**
   * @param {{ rudderTrack:HTMLElement, rudderKnob:HTMLElement,
   *           flapsEl:HTMLElement, trimEl:HTMLInputElement }} els
   */
  constructor({ rudderTrack, rudderKnob, flapsEl, trimEl }) {
    this.rudder = 0; // -1..1，放開回中（像彈簧腳舵）
    this.flaps = 0;  // 0..MAX_FLAPS
    this.trim = 0;   // -1..1，設定保持
    this._wireRudder(rudderTrack, rudderKnob);
    this._wireFlaps(flapsEl);
    this._wireTrim(trimEl);
  }

  /** @returns {{ rudder:number, flaps:number, trim:number }} */
  values() {
    return { rudder: this.rudder, flaps: this.flaps, trim: this.trim };
  }

  /** @param {HTMLElement} track @param {HTMLElement} knob */
  _wireRudder(track, knob) {
    const setFromX = (/** @type {number} */ clientX) => {
      const rect = track.getBoundingClientRect();
      const frac = (clientX - rect.left) / rect.width; // 0..1
      this.rudder = Math.min(1, Math.max(-1, frac * 2 - 1));
      this._renderRudder(knob);
    };
    let active = false;
    const release = () => { active = false; this.rudder = 0; this._renderRudder(knob); };
    track.addEventListener('pointerdown', (e) => { e.preventDefault(); active = true; setFromX(e.clientX); }, { passive: false });
    track.addEventListener('pointermove', (e) => {
      if (active || (e.pointerType === 'touch' && e.buttons > 0)) { e.preventDefault(); setFromX(e.clientX); }
    }, { passive: false });
    track.addEventListener('pointerup', release);
    track.addEventListener('pointercancel', release);
    track.addEventListener('pointerleave', () => { if (active) release(); });
    this._renderRudder(knob);
  }

  /** @param {HTMLElement} knob */
  _renderRudder(knob) {
    knob.style.left = `${((this.rudder + 1) / 2) * 100}%`;
  }

  /** @param {HTMLElement} el */
  _wireFlaps(el) {
    const segs = /** @type {HTMLElement[]} */ ([...el.querySelectorAll('.flap-seg')]);
    for (const seg of segs) {
      seg.addEventListener('click', () => {
        this.flaps = Math.min(MAX_FLAPS, Math.max(0, Number(seg.dataset.flap)));
        for (const s of segs) s.classList.toggle('active', s === seg);
      });
    }
  }

  /** @param {HTMLInputElement} el */
  _wireTrim(el) {
    el.addEventListener('input', () => {
      this.trim = Math.min(1, Math.max(-1, Number(el.value)));
    });
  }
}
