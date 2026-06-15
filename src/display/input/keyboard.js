// @ts-check
// 鍵盤 fallback（開發不必一直拿手機）：
// ←→ 滾轉、↑ 拉桿、↓ 壓桿、W/S 油門增減、Space 滿油門、X 收油門、G 起落架。
// 空戰：F 發射（按住）、Q 換武器（display 端偵測上升緣）、Z 翻滾閃避（display 端偵測上升緣）。
// 按過任意操控鍵即 active（沒有手機連線時駕駛紅機）。

export class KeyboardInput {
  constructor() {
    this.active = false;
    this.th = 0;
    this.gearUp = false;
    /** @type {Set<string>} */
    this._down = new Set();
    window.addEventListener('keydown', (e) => {
      if (KEYS.has(e.code)) {
        if (e.code === 'KeyG' && !e.repeat) this.gearUp = !this.gearUp;
        this._down.add(e.code);
        this.active = true;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this._down.delete(e.code));
  }

  /**
   * @param {number} dt
   * @returns {{ r:number, p:number, th:number, gearUp:boolean, fire:boolean, weaponSwitch:boolean, dodge:boolean }}
   */
  read(dt) {
    const d = this._down;
    const r = (d.has('ArrowRight') ? 1 : 0) - (d.has('ArrowLeft') ? 1 : 0);
    const p = (d.has('ArrowUp') ? 1 : 0) - (d.has('ArrowDown') ? 1 : 0); // ↑ = 拉桿爬升
    if (d.has('KeyW')) this.th = Math.min(1, this.th + 0.7 * dt);
    if (d.has('KeyS')) this.th = Math.max(0, this.th - 0.7 * dt);
    if (d.has('Space')) this.th = 1;
    if (d.has('KeyX')) this.th = 0;
    return { r, p, th: this.th, gearUp: this.gearUp, fire: d.has('KeyF'), weaponSwitch: d.has('KeyQ'), dodge: d.has('KeyZ') };
  }
}

const KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'Space', 'KeyX', 'KeyG', 'KeyF', 'KeyQ', 'KeyZ']);
