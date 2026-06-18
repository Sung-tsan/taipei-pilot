// @ts-check
// 後果軸設定的持久化（純函式，可注入 storage → vitest 用 Map mock 直測）。
// 狀態存電腦端（換手機掃碼不掉，沿用 spec §7）。北極星 handoff v1.1-1 P4。

const MODE_KEY = 'tp_consequence_mode';
const LIMIT_KEY = 'tp_mishap_limit';
const SHAKE_KEY = 'tp_cam_shake';
const WEATHER_KEY = 'tp_weather_pref';

/** 天氣偏好選項：auto＝照後果模式 roll；其餘＝家長手動鎖定（可關掉雨/霧）。 */
export const WEATHER_PREFS = /** @type {const} */ (['auto', 'clear', 'cloudy', 'rain', 'fog']);

/** 預設：新玩家走安全；❤️ 上限 3（僅 gentle 用）；亂流鏡頭晃預設開（可關，減暈）；天氣自動 */
export const DEFAULTS = { mode: /** @type {'safe'} */ ('safe'), heartsMax: 3, camShake: true, weather: /** @type {'auto'} */ ('auto') };

/** @typedef {import('../flight/consequence.js').ConsequenceMode} ConsequenceMode */
/** @typedef {typeof WEATHER_PREFS[number]} WeatherPref */
/** @typedef {{ getItem:(k:string)=>string|null, setItem:(k:string,v:string)=>void }} StorageLike */

/** @param {StorageLike} [storage] @returns {{ mode:ConsequenceMode, heartsMax:number, camShake:boolean, weather:WeatherPref }} */
export function loadSettings(storage = localStorage) {
  const mode = storage.getItem(MODE_KEY);
  const validMode = mode === 'safe' || mode === 'gentle' || mode === 'real'
    ? /** @type {ConsequenceMode} */ (mode) : DEFAULTS.mode;

  const limitRaw = storage.getItem(LIMIT_KEY);
  let heartsMax = DEFAULTS.heartsMax;
  if (limitRaw === 'inf') heartsMax = Infinity;
  else if (limitRaw !== null) {
    const n = Number(limitRaw);
    if (Number.isInteger(n) && n >= 1 && n <= 5) heartsMax = n;
  }

  const shakeRaw = storage.getItem(SHAKE_KEY);
  const camShake = shakeRaw === null ? DEFAULTS.camShake : shakeRaw === '1';

  const wRaw = storage.getItem(WEATHER_KEY);
  const weather = WEATHER_PREFS.includes(/** @type {WeatherPref} */ (wRaw)) ? /** @type {WeatherPref} */ (wRaw) : DEFAULTS.weather;
  return { mode: validMode, heartsMax, camShake, weather };
}

/** @param {StorageLike} storage @param {{ mode:ConsequenceMode, heartsMax:number, camShake:boolean, weather:WeatherPref }} s */
export function saveSettings(storage, { mode, heartsMax, camShake, weather }) {
  storage.setItem(MODE_KEY, mode);
  storage.setItem(LIMIT_KEY, heartsMax === Infinity ? 'inf' : String(heartsMax));
  storage.setItem(SHAKE_KEY, camShake ? '1' : '0');
  storage.setItem(WEATHER_KEY, weather ?? 'auto');
}
