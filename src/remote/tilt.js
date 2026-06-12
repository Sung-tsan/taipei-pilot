// @ts-check
// 傾斜 = 操縱桿。**橫拿手機**（像端遙控器，雙手握兩端、面朝上約 45°）。
//
// ⚠️ 不直接用 beta/gamma 當操縱量 —— 那是 Z-X-Y 歐拉角，在「橫拿 + 45° 面朝上」姿勢下：
//   ① 兩軸耦合，側傾讀值被 cos(45°) 打折    ② gamma 在 ±90°（螢幕立直）會跳變翻轉
//   ③ 拉桿過頭時 beta/gamma 同時翻 180°，操縱量瞬間亂跳 → 飛機被拉平（Android 實機回報的 bug）
//
// 改用**重力投影**：從 beta/gamma 還原重力向量在機身座標的方向，取
//   長軸仰角 elevLong（= 方向盤左右傾）、短軸仰角 elevShort（= 前後拉壓）
// 兩者對實體動作連續、單調、跨歐拉翻轉點不跳變（翻轉前後投影值相同）。
//
// 映射方向由「校準當下」的螢幕旋轉角決定並**凍結**（angle0）——
// 之後就算 OS 自動旋轉（Android 橫拿傾斜很容易觸發 90°↔270° 翻轉），操控不受影響。
// iOS 13+：requestPermission 必須在 user gesture 內同步呼叫，拒絕一次永遠 denied。

/** 滿舵所需傾角（度）—— 調手感的旋鈕 */
const FULL_ROLL_DEG = 26;
const FULL_PITCH_DEG = 22;
const DEAD_ZONE = 0.08;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/**
 * 重力投影：歐拉角 → 機身長軸/短軸的仰角（度）。
 * 推導：g_device = (sinγ·cosβ, -sinβ, -cosβ·cosγ)
 *   elevLong  = asin(sinβ)        …… 長軸（直拿的上下軸）抬起角
 *   elevShort = asin(-sinγ·cosβ) …… 短軸（直拿的左右軸）抬起角
 * 兩式跨 gamma ±90 / beta 翻轉點皆連續。
 * @param {number} betaDeg @param {number} gammaDeg
 * @returns {{ elevLong:number, elevShort:number }}
 */
export function gravityElevations(betaDeg, gammaDeg) {
  const b = betaDeg * RAD, g = gammaDeg * RAD;
  const clamp1 = (/** @type {number} */ v) => Math.min(1, Math.max(-1, v));
  return {
    elevLong: Math.asin(clamp1(Math.sin(b))) * DEG,
    elevShort: Math.asin(clamp1(-Math.sin(g) * Math.cos(b))) * DEG,
  };
}

/**
 * 仰角差 → 操縱量。橫拿時長軸 = 左右傾（roll）、短軸 = 前後傾（pitch）；
 * 旋轉角決定正負（90 = home 鍵在右、270 = 在左）。
 * @param {{elevLong:number, elevShort:number}} now
 * @param {{elevLong:number, elevShort:number}} base 校準基準
 * @param {number} angle 校準當下的螢幕旋轉角（凍結）
 * @returns {{ r:number, p:number }}
 */
export function mapToStick(now, base, angle) {
  const dLong = now.elevLong - base.elevLong;
  const dShort = now.elevShort - base.elevShort;
  let rollDeg, pitchDeg;
  if (angle === 270 || angle === 180) {
    rollDeg = -dLong;  // P_y 指向使用者右側 → 右傾 = 長軸下沉
    pitchDeg = -dShort;
  } else if (angle === 90) {
    rollDeg = dLong;
    pitchDeg = dShort;
  } else {
    // 直拿 fallback（被 rotateGuard 擋住，但讀值不爆）
    rollDeg = -dShort;
    pitchDeg = dLong;
  }
  const clampN = (/** @type {number} */ v) => Math.min(1, Math.max(-1, v));
  let r = clampN(rollDeg / FULL_ROLL_DEG);
  let p = clampN(pitchDeg / FULL_PITCH_DEG);
  if (Math.abs(r) < DEAD_ZONE) r = 0;
  if (Math.abs(p) < DEAD_ZONE) p = 0;
  return { r, p };
}

export class TiltReader {
  constructor() {
    /** @type {number|null} */ this.beta = null;
    /** @type {number|null} */ this.gamma = null;
    /** @type {{elevLong:number, elevShort:number}} */
    this.base = { elevLong: 0, elevShort: 45 }; // 預設 45° 面朝上握姿
    this.angle0 = 90;
    this.started = false;
    this.lastEventAt = 0; // 最近一次 sensor event 的時間戳（看門狗用）
    this._baselined = false; // 第一筆數據自動當預設基準（正式基準由校準頁設）
    this._onReading = () => {};
    /** @type {(e:DeviceOrientationEvent)=>void} */
    this._handler = (e) => {
      if (e.beta === null || e.gamma === null) return;
      this.beta = e.beta;
      this.gamma = e.gamma;
      this.lastEventAt = performance.now();
      if (!this._baselined) {
        this._baselined = true;
        this.calibrate();
      }
      this._onReading();
    };
  }

  /**
   * 必須在 user gesture（tap handler）內呼叫。
   * @returns {Promise<'granted'|'denied'|'unsupported'>}
   */
  async start() {
    const DOE = /** @type {any} */ (globalThis.DeviceOrientationEvent);
    if (!DOE) return 'unsupported';
    if (typeof DOE.requestPermission === 'function') {
      let state;
      try {
        state = await DOE.requestPermission(); // ⚠️ 不能先 await 別的
      } catch {
        return 'denied';
      }
      if (state !== 'granted') return 'denied';
    }
    window.addEventListener('deviceorientation', this._handler);
    this.started = true;
    return 'granted';
  }

  /**
   * 重新掛 listener —— 遊戲中自動修復用。
   * Android Chrome 在退出全螢幕/滑通知列/短暫背景化後，偶爾會停止派發
   * deviceorientation event（傾斜讀值凍結 → 俯仰「失靈」只會打平）。
   * 權限先前已給過，重掛不需要 user gesture；校準基準（base/angle0）保留不動。
   */
  restart() {
    if (!this.started) return;
    window.removeEventListener('deviceorientation', this._handler);
    window.addEventListener('deviceorientation', this._handler);
  }

  /** 把「現在的握姿」設為中立位，並凍結當下的螢幕旋轉角 */
  calibrate() {
    if (this.beta !== null && this.gamma !== null) {
      this.base = gravityElevations(this.beta, this.gamma);
    }
    this.angle0 = currentAngle();
  }

  hasReading() {
    return this.beta !== null;
  }

  /** @param {()=>void} fn */
  onReading(fn) { this._onReading = fn; }

  /**
   * @returns {{ r:number, p:number }} 正規化操縱量。
   *   r: -1..1 左負右正；p: -1..1 正 = 拉桿（手機往自己傾 = 機頭上）
   */
  read() {
    if (this.beta === null || this.gamma === null) return { r: 0, p: 0 };
    return mapToStick(gravityElevations(this.beta, this.gamma), this.base, this.angle0);
  }
}

/** 目前螢幕旋轉角（90 = home 鍵在右、270 = 在左、0/180 = 直拿） */
function currentAngle() {
  const a = screen.orientation?.angle;
  if (typeof a === 'number') return a;
  const legacy = /** @type {any} */ (window).orientation; // iOS Safari 舊 API
  if (typeof legacy === 'number') return (legacy + 360) % 360;
  return 90;
}
