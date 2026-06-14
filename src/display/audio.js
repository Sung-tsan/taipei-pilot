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

    // 雨聲 loop（白噪音 + 高帶通＝細密雨絲；天氣＝雨時開）
    const rnoise = ctx.createBufferSource();
    rnoise.buffer = buf; rnoise.loop = true;
    const rbp = ctx.createBiquadFilter();
    rbp.type = 'bandpass'; rbp.frequency.value = 4200; rbp.Q.value = 0.5;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rnoise.connect(rbp).connect(this.rainGain).connect(ctx.destination);
    rnoise.start();

    // 夜間環境底噪（極低頻嗡＋蟲鳴感；夜/黃昏淡淡墊著）
    const namb = ctx.createBufferSource();
    namb.buffer = buf; namb.loop = true;
    const nbp = ctx.createBiquadFilter();
    nbp.type = 'bandpass'; nbp.frequency.value = 2600; nbp.Q.value = 1.2;
    this.nightGain = ctx.createGain();
    this.nightGain.gain.value = 0;
    namb.connect(nbp).connect(this.nightGain).connect(ctx.destination);
    namb.start();

    this.enabled = true;
    if (this._pendingWeather) this.setWeather(this._pendingWeather.type, this._pendingWeather.night); // 補套用
  }

  /**
   * 天氣/日夜環境音（hybrid 合成）：雨聲、側風加強、霧悶（雨聲變鈍）、夜底噪。
   * @param {string} type 天氣型別 @param {boolean} [night] 夜/黃昏
   */
  setWeather(type, night = false) {
    if (!this.ctx || !this.enabled) { this._pendingWeather = { type, night }; return; }
    const t = this.ctx.currentTime;
    this.rainGain?.gain.setTargetAtTime(type === 'rain' ? 0.12 : 0, t, 0.4);
    this.nightGain?.gain.setTargetAtTime(night ? 0.018 : 0, t, 0.8);
    // 側風強度→額外風聲底（雨>霧/雲>晴）；霧＝悶（風聲底拉低一點）
    this._weatherWind = type === 'rain' ? 0.05 : type === 'fog' ? 0.02 : type === 'cloudy' ? 0.03 : 0;
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
    this.windGain?.gain.setTargetAtTime((maxSpeed / 65) * 0.06 + (this._weatherWind ?? 0), t, 0.3); // +天氣側風底
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

  _on() { return this.ctx && this.enabled; }

  /**
   * 合成單音（含掃頻包絡） @param {OscillatorType} type @param {number} f0 @param {number} f1
   * @param {number} dur @param {number} vol @param {number} [delay]
   */
  _tone(type, f0, f1, dur, vol, delay = 0) {
    const ctx = this.ctx; if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator(); osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(ctx.destination); osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  /**
   * 衰減噪音爆（爆炸/濺水/刮地）。 @param {number} dur @param {number} vol
   * @param {number} fStart @param {number} fEnd @param {number} [delay]
   */
  _noise(dur, vol, fStart, fEnd, delay = 0) {
    const ctx = this.ctx; if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(fStart, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, fEnd), t0 + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(ctx.destination); src.start(t0); src.stop(t0 + dur);
  }

  /** 爆炸（被擊落/撞毀）：分層合成——尖銳起爆 + 低頻爆體 + 衝壓 + 碎屑殘響（擬真端近似；
   *  v2.0-5 註：真·取樣 clip 待 CC0 音效資產 drop，合成已盡量逼近質感）。 */
  explode() {
    if (!this._on()) return;
    this._noise(0.07, 0.6, 5200, 1400);          // 尖銳起爆 transient
    this._noise(0.55, 0.5, 1300, 80);            // 爆體低頻
    this._tone('square', 200, 42, 0.45, 0.24);   // 衝壓
    this._noise(0.4, 0.18, 700, 180, 0.08);      // 碎屑殘響
  }

  /** 鎖定提示音（剛鎖到目標）：上行雙嗶，短而清楚不吵。 */
  lockTone() {
    if (!this._on()) return;
    this._tone('square', 880, 880, 0.05, 0.11);
    this._tone('square', 1320, 1320, 0.07, 0.11, 0.06);
  }

  /** 迫降地形音：水花(水) / 刮地(草園) / 輪胎(馬路)，依 v1.1-2 terrain。 @param {string} terrain */
  forcedLandingSound(terrain) {
    if (!this._on()) return;
    if (terrain === 'water') this._noise(0.5, 0.35, 2600, 400);          // 濺水：高頻噪
    else if (terrain === 'road') { this._tone('square', 95, 70, 0.35, 0.2); this._noise(0.3, 0.15, 500, 200); } // 輪胎
    else this._noise(0.5, 0.3, 700, 200);                                // 刮地（草/園）：低頻噪
  }

  /** 任務達成 success（上揚三音） */
  missionSuccess() { if (!this._on()) return; [523, 659, 880].forEach((f, i) => this._tone('triangle', f, f, 0.25, 0.22, i * 0.1)); }

  /** ❤️−1（下行嗚） */
  heartLoss() { if (!this._on()) return; this._tone('sine', 440, 220, 0.3, 0.25); }

  /** 大慶祝煙火（連發噪爆 + 高音點綴） */
  fireworks() {
    if (!this._on()) return;
    for (let k = 0; k < 5; k++) { this._noise(0.3, 0.3, 1800, 200, k * 0.25); this._tone('triangle', 800 + k * 120, 1600, 0.2, 0.15, k * 0.25 + 0.02); }
  }

  /** 武器發射（tone ladder）：卡通＝可愛「咻噗」、擬真＝低頻衝壓。 @param {'cartoon'|'boom'} sound */
  weaponFire(sound) {
    if (!this._on()) return;
    if (sound === 'cartoon') { this._tone('square', 900, 1500, 0.12, 0.18); this._noise(0.08, 0.08, 2000, 600); }
    else { this._noise(0.18, 0.16, 1200, 200); this._tone('sawtooth', 200, 90, 0.18, 0.12); }
  }

  /** 氣球啵（去暴力命中音：短亮「啵」） */
  balloonPop() { if (!this._on()) return; this._tone('triangle', 1200, 500, 0.12, 0.25); this._noise(0.06, 0.12, 2600, 800); }

  /** 對地命中爆炸（擬真端，比 explode 更重） */
  groundBoom() { if (!this._on()) return; this._noise(0.55, 0.55, 1100, 90); this._tone('square', 140, 45, 0.5, 0.28); }

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
