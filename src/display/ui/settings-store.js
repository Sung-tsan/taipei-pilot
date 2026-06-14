// @ts-check
// 後果軸設定的持久化（純函式，可注入 storage → vitest 用 Map mock 直測）。
// 狀態存電腦端（換手機掃碼不掉，沿用 spec §7）。北極星 handoff v1.1-1 P4。

const MODE_KEY = 'tp_consequence_mode';
const LIMIT_KEY = 'tp_mishap_limit';
const SHAKE_KEY = 'tp_cam_shake';

/** 預設：新玩家走安全；❤️ 上限 3（僅 gentle 用）；亂流鏡頭晃預設開（可關，減暈） */
export const DEFAULTS = { mode: /** @type {'safe'} */ ('safe'), heartsMax: 3, camShake: true };

/** @typedef {import('../flight/consequence.js').ConsequenceMode} ConsequenceMode */
/** @typedef {{ getItem:(k:string)=>string|null, setItem:(k:string,v:string)=>void }} StorageLike */

/** @param {StorageLike} [storage] @returns {{ mode:ConsequenceMode, heartsMax:number, camShake:boolean }} */
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
  return { mode: validMode, heartsMax, camShake };
}

/** @param {StorageLike} storage @param {{ mode:ConsequenceMode, heartsMax:number, camShake:boolean }} s */
export function saveSettings(storage, { mode, heartsMax, camShake }) {
  storage.setItem(MODE_KEY, mode);
  storage.setItem(LIMIT_KEY, heartsMax === Infinity ? 'inf' : String(heartsMax));
  storage.setItem(SHAKE_KEY, camShake ? '1' : '0');
}
