// @ts-check
// V3 天氣系統核心 —— 純邏輯（型別/機率表/roll/後果閘），零 DOM/Three，vitest 直測。
// 北極星 ROADMAP §3 天氣表 / §4 V3 / §5 weatherProfile。render 在 weather-render.js（modulate world.js）。
//
// 設計：天氣＝參數化系統（B1）——`WEATHER_PROFILES` 每機場一份機率表，換空域＝換表、引擎零改動。
// 「一個旋鈕管兩件事」：後果軸（安全/溫和/真實）同時當天氣嚴重度閘。
// 本輪範圍＝台北（松山）：tsa 數值已定；其餘 8 機場 schema ready、值 DRAFT（V5 航網活化）。

/** 天氣型別（側風/亂流在 v3.0-2 疊在 rain/fog 上；日夜在 v3.0-3） */
export const WEATHER_TYPES = /** @type {const} */ ({
  CLEAR: 'clear', CLOUDY: 'cloudy', RAIN: 'rain', FOG: 'fog',
});

/** 溫和天氣（溫和模式只開這些）；rain/fog＝惡劣天氣（只真實模式全開）。 */
const MILD = new Set([WEATHER_TYPES.CLEAR, WEATHER_TYPES.CLOUDY]);

/** @param {string} type @returns {boolean} 是否惡劣天氣（雨/霧） */
export function isRough(type) { return type === WEATHER_TYPES.RAIN || type === WEATHER_TYPES.FOG; }

/**
 * 天氣 → 操控外力強度（v3.0-2；只真實模式由 main 套用）。
 * windSpeed＝側風 m/s（需 crab 抵銷）；turb＝亂流強度 0..1（姿態擾動 + 鏡頭微晃）。
 * 台北（松山）數值，寧可先弱（減暈）；島嶼強側風/亂流 V5。
 * @param {string} type @returns {{ windSpeed:number, turb:number }}
 */
export function weatherForces(type) {
  switch (type) {
    case WEATHER_TYPES.RAIN: return { windSpeed: 6, turb: 0.30 };
    case WEATHER_TYPES.FOG: return { windSpeed: 4, turb: 0.15 };
    case WEATHER_TYPES.CLOUDY: return { windSpeed: 3, turb: 0.12 };
    default: return { windSpeed: 0, turb: 0 }; // 晴＝無風無亂流
  }
}

/**
 * @typedef {{ clear:number, cloudy:number, rain:number, fog:number }} WeatherProbs
 * @typedef {{ name:string, draft:boolean, probs:WeatherProbs }} WeatherProfile
 */

/**
 * 每機場天氣機率表（schema 支援 9 機場航網）。
 * **tsa（松山）數值已定；其餘 draft:true、值為 DRAFT 佔位**（教訓 B5：未校稿標 DRAFT）。
 * 島嶼招牌天氣（金門霧/澎湖側風/花東亂流）V5 活化、本輪只 ready schema。
 * @type {Record<string, WeatherProfile>}
 */
export const WEATHER_PROFILES = {
  tsa: { name: '松山', draft: false, probs: { clear: 0.50, cloudy: 0.28, rain: 0.14, fog: 0.08 } },
  // —— 以下 V5 航網啟用、數值 DRAFT（schema 完整、待實地調校）——
  rmq: { name: '台中', draft: true, probs: { clear: 0.55, cloudy: 0.25, rain: 0.15, fog: 0.05 } },
  khh: { name: '高雄', draft: true, probs: { clear: 0.60, cloudy: 0.22, rain: 0.15, fog: 0.03 } },
  hun: { name: '花蓮', draft: true, probs: { clear: 0.45, cloudy: 0.30, rain: 0.20, fog: 0.05 } },
  ttt: { name: '台東', draft: true, probs: { clear: 0.48, cloudy: 0.30, rain: 0.18, fog: 0.04 } },
  knh: { name: '金門', draft: true, probs: { clear: 0.40, cloudy: 0.28, rain: 0.12, fog: 0.20 } }, // 招牌：霧
  lzn: { name: '馬祖南竿', draft: true, probs: { clear: 0.35, cloudy: 0.28, rain: 0.15, fog: 0.22 } }, // 招牌：霧
  mzg: { name: '澎湖', draft: true, probs: { clear: 0.55, cloudy: 0.25, rain: 0.15, fog: 0.05 } }, // 招牌：側風（v3.0-2）
  gni: { name: '綠島', draft: true, probs: { clear: 0.50, cloudy: 0.28, rain: 0.18, fog: 0.04 } },
};

export const DEFAULT_AIRPORT = 'tsa';

/** @param {string} id @returns {WeatherProfile} 未知 → 退回松山（不爆） */
export function weatherProfile(id) { return WEATHER_PROFILES[id] ?? WEATHER_PROFILES[DEFAULT_AIRPORT]; }

/** @returns {{ type:string }} 初始天氣狀態（晴） */
export function makeWeather() { return { type: WEATHER_TYPES.CLEAR }; }

/**
 * 依後果模式對機率表開閘：
 * - safe：永遠晴（恆好天氣，6 歲/第一次）。
 * - gentle：只溫和天氣（晴/多雲，rain/fog 機率歸 0 後重新正規化）。
 * - real：整張 profile 全開。
 * @param {WeatherProbs} probs @param {'safe'|'gentle'|'real'} mode @returns {WeatherProbs}
 */
export function gateProbs(probs, mode) {
  if (mode === 'safe') return { clear: 1, cloudy: 0, rain: 0, fog: 0 };
  const p = { clear: probs.clear || 0, cloudy: probs.cloudy || 0, rain: probs.rain || 0, fog: probs.fog || 0 };
  if (mode === 'gentle') { p.rain = 0; p.fog = 0; } // 溫和：拿掉惡劣天氣
  const sum = p.clear + p.cloudy + p.rain + p.fog;
  if (sum <= 0) return { clear: 1, cloudy: 0, rain: 0, fog: 0 }; // 全 0 → 退回晴（安全網）
  return { clear: p.clear / sum, cloudy: p.cloudy / sum, rain: p.rain / sum, fog: p.fog / sum }; // 正規化
}

/**
 * 依機率表抽一個天氣（後果閘後）。rng()∈[0,1)（測試注入固定值；app 用 Math.random）。
 * @param {WeatherProfile} profile @param {'safe'|'gentle'|'real'} mode @param {()=>number} [rng]
 * @returns {string} 天氣型別
 */
export function rollWeather(profile, mode, rng = Math.random) {
  const probs = gateProbs((profile && profile.probs) || { clear: 1, cloudy: 0, rain: 0, fog: 0 }, mode);
  const order = [WEATHER_TYPES.CLEAR, WEATHER_TYPES.CLOUDY, WEATHER_TYPES.RAIN, WEATHER_TYPES.FOG];
  let r = rng();
  if (!(r >= 0 && r < 1)) r = 0; // 壞 rng → 安全側（晴）
  for (const t of order) {
    const pr = /** @type {any} */ (probs)[t] || 0;
    if (r < pr) return t;
    r -= pr;
  }
  return WEATHER_TYPES.CLEAR; // 浮點殘差 → 晴
}
