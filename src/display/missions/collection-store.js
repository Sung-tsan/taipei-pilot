// @ts-check
// 收集進度（點亮地標 / 完成任務 / 台北飛透透一次性慶祝）—— 純狀態 + 持久化，可注入 storage 測。
// 地標點亮＝全家共享（雙人誰點亮都算）；慶祝＝一次性 gate，之後收集簿可重看。
// 北極星 handoff v1.1-4 P3-P4（沿用小司機 J「一次性 gate + 收集簿重看」哲學）。spec §7。

const LIT_KEY = 'tp_landmarks_lit';
const DONE_KEY = 'tp_missions_done';
const CELEB_KEY = 'tp_celebrated';

/** @typedef {{ getItem:(k:string)=>string|null, setItem:(k:string,v:string)=>void }} StorageLike */
/** @typedef {{ lit:Set<string>, missionsDone:Set<string>, celebrated:boolean }} Collection */

/** @param {string|null} csv @returns {Set<string>} */
function parseSet(csv) {
  return new Set((csv ?? '').split(',').map((s) => s.trim()).filter(Boolean));
}

/** @param {StorageLike} [storage] @returns {Collection} */
export function loadCollection(storage = localStorage) {
  return {
    lit: parseSet(storage.getItem(LIT_KEY)),
    missionsDone: parseSet(storage.getItem(DONE_KEY)),
    celebrated: storage.getItem(CELEB_KEY) === '1',
  };
}

/** @param {StorageLike} storage @param {Collection} c */
export function saveCollection(storage, c) {
  storage.setItem(LIT_KEY, [...c.lit].join(','));
  storage.setItem(DONE_KEY, [...c.missionsDone].join(','));
  storage.setItem(CELEB_KEY, c.celebrated ? '1' : '0');
}

/** 點亮地標（全家共享）。回傳是否為新點亮。 @param {Collection} c @param {string} id */
export function lightLandmark(c, id) {
  if (c.lit.has(id)) return false;
  c.lit.add(id);
  return true;
}

/** 記錄完成任務。回傳是否為新完成。 @param {Collection} c @param {string} missionId */
export function recordMission(c, missionId) {
  if (c.missionsDone.has(missionId)) return false;
  c.missionsDone.add(missionId);
  return true;
}

/** 是否全地標點亮 @param {Collection} c @param {string[]} allLandmarkIds */
export function allLit(c, allLandmarkIds) {
  return allLandmarkIds.length > 0 && allLandmarkIds.every((id) => c.lit.has(id));
}

/** 是否該觸發「台北飛透透」大慶祝（全點亮 且 尚未慶祝過＝一次性） @param {Collection} c @param {string[]} allLandmarkIds */
export function shouldCelebrate(c, allLandmarkIds) {
  return allLit(c, allLandmarkIds) && !c.celebrated;
}
