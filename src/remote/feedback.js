// @ts-check
// 撞擊回饋與防睡眠。
// 🚨 iOS Safari 不支援 navigator.vibrate → fallback：全螢幕閃紅框 + 短 beep。

export class Feedback {
  /** @param {HTMLElement} flashEl 全螢幕閃紅用的 overlay 元素 */
  constructor(flashEl) {
    this._flashEl = flashEl;
    /** @type {AudioContext|null} */
    this._audio = null;
    /** @type {WakeLockSentinel|null} */
    this._wakeLock = null;
  }

  /** 在 user gesture 內呼叫一次，解鎖 AudioContext */
  unlockAudio() {
    if (!this._audio) {
      const AC = window.AudioContext ?? /** @type {any} */ (window).webkitAudioContext;
      if (AC) this._audio = new AC();
    }
    this._audio?.resume();
  }

  bump() {
    if (navigator.vibrate) {
      navigator.vibrate(120); // Android
    } else {
      this._flash(); // iOS：閃紅框
    }
    this._beep(110, 0.12);
  }

  _flash() {
    this._flashEl.classList.remove('flash');
    // 強制 reflow 讓動畫可重觸發
    void this._flashEl.offsetWidth;
    this._flashEl.classList.add('flash');
  }

  /**
   * @param {number} freq @param {number} dur 秒
   */
  _beep(freq, dur) {
    const ctx = this._audio;
    if (!ctx || ctx.state !== 'running') return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  /** 防睡眠：拿 wakeLock，回前景時自動重拿（iOS 16.4+；拿不到就算了） */
  async keepAwake() {
    const request = async () => {
      try {
        this._wakeLock = await navigator.wakeLock?.request('screen') ?? null;
      } catch { this._wakeLock = null; }
    };
    await request();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') request();
    });
  }
}
