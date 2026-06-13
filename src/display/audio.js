// @ts-check
// 全合成音效（零 asset）：引擎 loop（轉速跟油門）、風聲（跟速度）、撞擊悶響、落地小鈴。
// 瀏覽器 autoplay 限制：第一次點擊/按鍵後才會出聲（ensure() 掛在 gesture 上）。

export class GameAudio {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    /** @type {{ osc: OscillatorNode, gain: GainNode, pan: StereoPannerNode }[]} */
    this.engines = [];
    /** @type {GainNode|null} */
    this.windGain = null;
    this.enabled = false;
  }

  /** 在任何 user gesture 內呼叫（重複呼叫無害） */
  ensure() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext ?? /** @type {any} */ (window).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    // 引擎 ×2（方波 + 低通 → 像活塞引擎的咕嚕聲）
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 50;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      osc.connect(lp).connect(gain).connect(pan).connect(ctx.destination);
      osc.start();
      this.engines.push({ osc, gain, pan });
    }

    // 風聲（白噪音 + 帶通）
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 800;
    bp.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(bp).connect(this.windGain).connect(ctx.destination);
    noise.start();

    this.enabled = true;
  }

  /**
   * 每 frame 餵：各 slot 的（是否在飛、油門、速度）與分屏狀態。
   * @param {{ driven:boolean, throttle:number, speed:number, flying:boolean }[]} planes
   * @param {boolean} split
   */
  update(planes, split) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    let maxSpeed = 0;
    planes.forEach((p, i) => {
      const e = this.engines[i];
      if (!e) return;
      const on = p.driven;
      const target = on ? 0.05 + p.throttle * 0.09 : 0;
      e.gain.gain.setTargetAtTime(target, t, 0.15);
      e.osc.frequency.setTargetAtTime(45 + p.throttle * 75 + p.speed * 0.4, t, 0.1);
      e.pan.pan.setTargetAtTime(split ? (i === 0 ? -0.55 : 0.55) : 0, t, 0.2);
      if (on && p.flying) maxSpeed = Math.max(maxSpeed, p.speed);
    });
    this.windGain?.gain.setTargetAtTime((maxSpeed / 65) * 0.06, t, 0.3);
  }

  /** 撞擊悶響 */
  bump() {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.25);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  }

  /** 喇叭：卡通「叭—叭」兩短聲（context 鍵 BTN.HORN）。tone ladder 卡通端＝可愛、不擬真。 */
  horn() {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    [0, 0.17].forEach((dt) => {
      const t0 = ctx.currentTime + dt;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, t0);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.26, t0 + 0.02);
      gain.gain.setValueAtTime(0.26, t0 + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.18);
    });
  }

  /** 落地成功小鈴（上行三音） */
  landingChime() {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    [523, 659, 784].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const gain = ctx.createGain();
      const t0 = ctx.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.55);
    });
  }
}
