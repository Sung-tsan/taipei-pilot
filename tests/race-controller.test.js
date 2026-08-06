// @ts-check
// race-controller.js 迴歸測試（修復：參賽名單改用當下實際 wasDriven 的 slot，不再寫死 [0,1]）。
// 單人玩競速時，若參賽名單仍含未上場的 slot1，allFinished 永遠 false、
// 「全員完賽」煙火/toast 永遠不觸發——本檔驗證單人可觸發、雙人仍需全員完賽才觸發（不回歸）。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { RaceController } from '../src/display/missions/race-controller.js';

const MAX_SLOTS = 2;
const TAIPEI101 = { x: 1000, z: 0 };

/** 建 RaceController deps（audio/toast 用 vi.fn 假件，型別故意鬆為 any——測的是 glue 行為非型別）。
 * @param {boolean[]} wasDriven 各 slot 是否實際在駕駛（引用型別，setActive 當下讀取）
 * @returns {any}
 */
function makeDeps(wasDriven) {
  const states = Array.from({ length: MAX_SLOTS }, () => ({
    pos: { x: 0, z: 0 }, heading: 0, mode: 'flying',
  }));
  return {
    lmById: new Map([['taipei101', TAIPEI101]]),
    riverByName: new Map(),
    rivers: [],
    audio: { lockTone: vi.fn(), missionSuccess: vi.fn(), landingChime: vi.fn(), fireworks: vi.fn() },
    toast: vi.fn(),
    states,
    wasDriven,
    maxSlots: MAX_SLOTS,
    getAir: () => ({ landmarks: [TAIPEI101] }),
    getCurAirportId: () => 'sungshan',
    getRaceType: () => 'landmark',
  };
}

/** 讓某 slot 起飛穿過終點光圈完賽。 @param {RaceController} ctl @param {any} d @param {number} slot @param {number} now */
function finishSlot(ctl, d, slot, now) {
  d.states[slot].pos = { x: 0, z: 0 };
  ctl.update(now); // 觸發 started（mode 已是 flying）
  d.states[slot].pos = { x: TAIPEI101.x, z: TAIPEI101.z }; // 飛進終點光圈（r=140）
  ctl.update(now + 1000);
}

describe('RaceController：參賽名單改用當下實際駕駛（wasDriven）的 slot', () => {
  /** @type {THREE.Scene} */ let scene;
  beforeEach(() => { scene = new THREE.Scene(); });

  it('setActive 當下讀 wasDriven：只有實際駕駛的 slot 進入參賽名單', () => {
    const d = makeDeps([true, false]); // 單人：只有 slot0 在駕駛
    const ctl = new RaceController(scene, d);
    ctl.setActive(true);
    expect(/** @type {any} */ (ctl.race).slots).toEqual([0]);
  });

  it('單人競速：唯一 slot 完賽 → allFinished 觸發、放煙火＋全員完賽 toast', () => {
    const d = makeDeps([true, false]);
    const ctl = new RaceController(scene, d);
    ctl.setActive(true);
    expect(/** @type {any} */ (ctl.race).slots).toEqual([0]); // 名單只有 slot0，不會卡在永不存在的 slot1

    finishSlot(ctl, d, 0, 1000);

    expect(ctl.celebrated).toBe(true);
    expect(d.audio.fireworks).toHaveBeenCalledTimes(1);
    expect(d.toast).toHaveBeenCalledWith(0, '🎉 大家都完賽了！');
    // 未駕駛的 slot1 不該收到任何 toast（不存在的玩家不該被通知）
    expect(d.toast.mock.calls.some((/** @type {any} */ c) => c[0] === 1)).toBe(false);
  });

  it('雙人不回歸：只有一人完賽時尚未全員完賽，兩人都完賽才觸發煙火', () => {
    const d = makeDeps([true, true]); // 雙人都在駕駛
    const ctl = new RaceController(scene, d);
    ctl.setActive(true);
    expect(/** @type {any} */ (ctl.race).slots).toEqual([0, 1]);

    finishSlot(ctl, d, 0, 1000); // 只有 slot0 完賽
    expect(ctl.celebrated).toBe(false);
    expect(d.audio.fireworks).not.toHaveBeenCalled();

    finishSlot(ctl, d, 1, 3000); // slot1 也完賽 → 全員完賽
    expect(ctl.celebrated).toBe(true);
    expect(d.audio.fireworks).toHaveBeenCalledTimes(1);
    expect(d.toast).toHaveBeenCalledWith(0, '🎉 大家都完賽了！');
    expect(d.toast).toHaveBeenCalledWith(1, '🎉 大家都完賽了！');
  });

  it('setActive(false) 清空賽道；重進時依當下 wasDriven 重新鎖定名單', () => {
    const d = makeDeps([true, false]);
    const ctl = new RaceController(scene, d);
    ctl.setActive(true);
    expect(/** @type {any} */ (ctl.race).slots).toEqual([0]);
    ctl.setActive(false);
    expect(ctl.race).toBeNull();
    d.wasDriven[1] = true; // 第二人這時才上場
    ctl.setActive(true); // 下一場才算：重進時重新讀 wasDriven
    expect(/** @type {any} */ (ctl.race).slots).toEqual([0, 1]);
  });
});
