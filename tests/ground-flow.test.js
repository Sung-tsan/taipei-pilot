// @ts-check
// 雙人地面/航班流程狀態 per-slot 隔離（P1 bug 回歸）：第二位玩家加入不得動到第一位的離場/到場狀態。
import { describe, it, expect } from 'vitest';
import {
  makeDepartState, makeArrivalState, makeCorridorState,
  resetDepart, resetArrival, resetCorridor, beginDepart,
} from '../src/display/scene/ground-flow.js';

/** 模擬 main.js 的 per-slot 陣列（MAX_SLOTS=2）。 */
const slots = (/** @type {() => any} */ make) => [make(), make()];

describe('ground-flow：per-slot 初始狀態', () => {
  it('離場/到場/走廊預設都是 none/未啟用', () => {
    const d = makeDepartState();
    expect(d.phase).toBe('none');
    expect(d.gate).toBe(null);
    expect(d.boardReady).toBe(false);
    expect(d.pendingConfirm).toBe(false);
    expect(makeArrivalState()).toEqual({ phase: 'none', exit: null, gate: null, parkedAt: 0 });
    expect(makeCorridorState()).toEqual({ active: false, idx: 0, pts: [], pending: false });
  });

  it('每個 slot 拿到獨立物件（不是共用參照）', () => {
    const ds = slots(makeDepartState);
    expect(ds[0]).not.toBe(ds[1]);
    ds[0].phase = 'taxiOut';
    expect(ds[1].phase).toBe('none');
  });
});

describe('ground-flow：beginDepart 只動自己那一格（雙人互搶回歸）', () => {
  it('slot 0 滑行中、slot 1 加入開新一班 → slot 0 的階段/門/計時全都不動', () => {
    const ds = slots(makeDepartState);
    // slot 0 已經走到 taxiOut（跟著綠線滑向跑道頭）
    beginDepart(ds[0], 'g3');
    ds[0].phase = 'taxiOut';
    ds[0].boardT = 4; ds[0].pushT = 1; ds[0].prepHoldSaid = true;
    const before = { ...ds[0] };

    // slot 1 上線 → 開自己的離場流程
    beginDepart(ds[1], 'g4');

    expect(ds[0]).toEqual(before);      // 舊 bug：departPhase/departGate/departSlot 被覆寫成 boarding/g4/1
    expect(ds[0].phase).toBe('taxiOut');
    expect(ds[0].gate).toBe('g3');
    expect(ds[1].phase).toBe('boarding');
    expect(ds[1].gate).toBe('g4');
  });

  it('beginDepart 會清掉同一格上一班的殘留（過站轉離場）', () => {
    const d = makeDepartState();
    d.phase = 'cleared'; d.boardT = 9; d.pushT = 1; d.holdT = 5;
    d.pushDoneT = 2; d.prepHoldSaid = true; d.boardReady = true; d.pendingConfirm = true;
    d.pushPath = { from: { x: 0, z: 0 }, to: { x: 1, z: 1 }, h0: 0, h1: 1 };
    beginDepart(d, 'g7');
    expect(d).toEqual({ ...makeDepartState(), phase: 'boarding', gate: 'g7' });
  });
});

describe('ground-flow：reset 就地清除、不換物件身分', () => {
  it('resetDepart/resetArrival/resetCorridor 保留參照並回到初值', () => {
    const d = makeDepartState(); const a = makeArrivalState(); const c = makeCorridorState();
    d.phase = 'holdShort'; a.phase = 'parked'; a.gate = 'g5'; a.parkedAt = 123;
    c.active = true; c.idx = 3; c.pending = true;
    expect(resetDepart(d)).toBe(d);
    expect(resetArrival(a)).toBe(a);
    expect(resetCorridor(c)).toBe(c);
    expect(d).toEqual(makeDepartState());
    expect(a).toEqual(makeArrivalState());
    expect(c).toEqual(makeCorridorState());
  });

  it('重置一格不影響另一格（一人離開/墜機重生）', () => {
    const as = slots(makeArrivalState);
    as[0].phase = 'taxi'; as[0].gate = 'g3';
    as[1].phase = 'parked'; as[1].gate = 'g4'; as[1].parkedAt = 999;
    resetArrival(as[1]);
    expect(as[0]).toEqual({ phase: 'taxi', exit: null, gate: 'g3', parkedAt: 0 });
    expect(as[1].phase).toBe('none');
  });
});
