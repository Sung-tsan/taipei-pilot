// @ts-check
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Relay, INPUT_LIVENESS_MS } from '../server/relay.js';

/** 測試夾具：記錄每個 client 收到的訊息 */
function makeHarness() {
  /** @type {Record<string, any[]>} */
  const inbox = {};
  /** @type {string[]} */
  const closed = [];
  let tokenSeq = 0;
  const relay = new Relay({
    send: (id, data) => { (inbox[id] ??= []).push(JSON.parse(data)); },
    close: (id) => { closed.push(id); },
    makeToken: () => `tok${tokenSeq++}`,
    graceMs: 30000,
    now: () => Date.now(), // 配合 vi.useFakeTimers 的假時鐘
  });
  /**
   * @param {string} id @param {'display'|'remote'} role @param {string} [token]
   */
  const hello = (id, role, token) => {
    relay.onConnect(id);
    relay.onMessage(id, JSON.stringify({ t: 'hello', role, ...(token ? { token } : {}) }));
  };
  return { relay, inbox, closed, hello, last: (/** @type {string} */ id) => inbox[id]?.at(-1) };
}

describe('Relay slot 管理', () => {
  /** @type {ReturnType<typeof makeHarness>} */ let h;
  beforeEach(() => {
    vi.useFakeTimers();
    h = makeHarness();
  });

  it('先到先佔 slot 0、再來 slot 1、第三支 slots_full', () => {
    h.hello('a', 'remote');
    h.hello('b', 'remote');
    h.hello('c', 'remote');
    expect(h.inbox.a[0]).toMatchObject({ t: 'welcome', slot: 0, token: 'tok0' });
    expect(h.inbox.b[0]).toMatchObject({ t: 'welcome', slot: 1, token: 'tok1' });
    expect(h.last('c')).toMatchObject({ t: 'slots_full' });
  });

  it('display 連線收到 display_ok 與既有 slot 回放', () => {
    h.hello('a', 'remote');
    h.hello('d', 'display');
    expect(h.inbox.d[0]).toMatchObject({ t: 'display_ok' });
    expect(h.inbox.d[1]).toMatchObject({ t: 'remote_joined', slot: 0 });
  });

  it('in 訊息蓋上 slot 後轉發給 display', () => {
    h.hello('d', 'display');
    h.hello('a', 'remote');
    h.relay.onMessage('a', JSON.stringify({ t: 'in', s: 1, r: 0.5, p: 0, th: 1, b: 0 }));
    expect(h.last('d')).toMatchObject({ t: 'in', slot: 0, r: 0.5, th: 1 });
  });

  it('fx 由 display 轉發給對應 slot 的 remote', () => {
    h.hello('d', 'display');
    h.hello('a', 'remote');
    h.relay.onMessage('d', JSON.stringify({ t: 'fx', slot: 0, kind: 'bump' }));
    expect(h.last('a')).toMatchObject({ t: 'fx', slot: 0, kind: 'bump' });
  });

  it('ping → 回 pong（任何角色，半開連線偵測用）', () => {
    h.hello('a', 'remote');
    h.relay.onMessage('a', JSON.stringify({ t: 'ping' }));
    expect(h.last('a')).toMatchObject({ t: 'pong' });
    h.hello('d', 'display');
    h.relay.onMessage('d', JSON.stringify({ t: 'ping' }));
    expect(h.last('d')).toMatchObject({ t: 'pong' });
  });

  it('remote 斷線 → display 收 remote_left；grace 內 token 重連回原 slot → remote_back', () => {
    h.hello('d', 'display');
    h.hello('a', 'remote');
    h.relay.onDisconnect('a');
    expect(h.last('d')).toMatchObject({ t: 'remote_left', slot: 0 });

    vi.advanceTimersByTime(10000); // grace 內
    h.hello('a2', 'remote', 'tok0');
    expect(h.last('a2')).toMatchObject({ t: 'display_status', connected: true });
    expect(h.inbox.a2[0]).toMatchObject({ t: 'welcome', slot: 0, token: 'tok0' });
    expect(h.last('d')).toMatchObject({ t: 'remote_back', slot: 0 });
  });

  it('grace 逾時 → slot 釋放、display 收 remote_gone、舊 token 失效', () => {
    h.hello('d', 'display');
    h.hello('a', 'remote');
    h.relay.onDisconnect('a');
    vi.advanceTimersByTime(30001);
    expect(h.last('d')).toMatchObject({ t: 'remote_gone', slot: 0 });

    h.hello('a2', 'remote', 'tok0'); // 舊 token → 當新連線
    expect(h.inbox.a2[0]).toMatchObject({ t: 'welcome', slot: 0, token: 'tok1' });
  });

  it('grace 期間 slot 不會被新手機搶走（保留給原 token），但另一空 slot 可用', () => {
    h.hello('a', 'remote');
    h.relay.onDisconnect('a');
    h.hello('b', 'remote'); // slot 0 在 grace，b 應拿 slot 1
    expect(h.inbox.b[0]).toMatchObject({ t: 'welcome', slot: 1 });
    h.hello('c', 'remote'); // 0 grace + 1 occupied → 滿
    expect(h.last('c')).toMatchObject({ t: 'slots_full' });
  });

  it('同 token 重複 hello（手機重整、舊 socket 還掛著）→ 新連線接管、舊的被踢', () => {
    h.hello('d', 'display');
    h.hello('a', 'remote');
    h.hello('a2', 'remote', 'tok0');
    expect(h.inbox.a2[0]).toMatchObject({ t: 'welcome', slot: 0, token: 'tok0' });
    expect(h.closed).toContain('a');
    // 舊 socket 的斷線事件遲到 → 不該把 slot 打成 grace
    h.relay.onDisconnect('a');
    expect(h.relay.slots[0].state).toBe('occupied');
  });

  it('display 斷線 → remotes 收 display_status false；新 display 接管舊的', () => {
    h.hello('d', 'display');
    h.hello('a', 'remote');
    h.relay.onDisconnect('d');
    expect(h.last('a')).toMatchObject({ t: 'display_status', connected: false });
    h.hello('d2', 'display');
    expect(h.last('a')).toMatchObject({ t: 'display_status', connected: true });
    expect(h.inbox.d2[1]).toMatchObject({ t: 'remote_joined', slot: 0 });
  });

  it('第二個 display 接管 → 舊的先收 display_replaced（停止重連，不互踢）', () => {
    h.hello('d', 'display');
    h.hello('d2', 'display');
    expect(h.last('d')).toMatchObject({ t: 'display_replaced' });
    expect(h.closed).toContain('d');
    expect(h.relay.displayId).toBe('d2');
  });

  it('display 重連時回放 grace 中的 slot（remote_left）→ 不會漏掉「斷線等重連」狀態', () => {
    h.hello('d', 'display');
    h.hello('a', 'remote');
    h.relay.onDisconnect('a'); // slot 0 → grace
    h.hello('d2', 'display');  // display 重連/接管
    const replay = h.inbox.d2.filter((m) => m.t === 'remote_left');
    expect(replay).toEqual([{ t: 'remote_left', slot: 0 }]);
  });

  it('reset（僅 display 可發）→ 清空所有 slot，含 grace 中的', () => {
    h.hello('d', 'display');
    h.hello('a', 'remote');
    h.hello('b', 'remote');
    h.relay.onDisconnect('a'); // slot 0 → grace
    h.relay.onMessage('b', JSON.stringify({ t: 'reset' })); // remote 發 → 忽略
    expect(h.relay.slots[1].state).toBe('occupied');
    h.relay.onMessage('d', JSON.stringify({ t: 'reset' }));
    expect(h.relay.slots.every((s) => s.state === 'empty')).toBe(true);
    vi.advanceTimersByTime(60000); // grace timer 已清，不爆
    h.hello('c', 'remote');
    expect(h.inbox.c[0]).toMatchObject({ t: 'welcome', slot: 0 });
  });

  it('活性掃描：殭屍 remote（連線在、輸入停）→ 斷線流程；有輸入則保活', () => {
    h.hello('d', 'display');
    h.hello('a', 'remote');
    // 持續輸入 → sweep 不動它
    vi.advanceTimersByTime(INPUT_LIVENESS_MS - 500);
    h.relay.onMessage('a', JSON.stringify({ t: 'in', s: 1, r: 0, p: 0, th: 0, b: 0 }));
    h.relay.sweepStale();
    expect(h.relay.slots[0].state).toBe('occupied');
    // 輸入停 > 上限 → 視同斷線（close + grace + remote_left）
    vi.advanceTimersByTime(INPUT_LIVENESS_MS + 100);
    h.relay.sweepStale();
    expect(h.closed).toContain('a');
    expect(h.relay.slots[0].state).toBe('grace');
    expect(h.last('d')).toMatchObject({ t: 'remote_left', slot: 0 });
  });

  it('壞訊息與越權訊息一律忽略', () => {
    h.hello('d', 'display');
    h.hello('a', 'remote');
    const before = (h.inbox.d ?? []).length;
    h.relay.onMessage('a', 'garbage');
    h.relay.onMessage('a', JSON.stringify({ t: 'fx', slot: 0, kind: 'bump' })); // remote 不可發 fx
    h.relay.onMessage('d', JSON.stringify({ t: 'in', s: 1, r: 0, p: 0, th: 0, b: 0 })); // display 不可發 in
    expect((h.inbox.d ?? []).length).toBe(before);
    expect((h.inbox.a ?? []).filter((m) => m.t === 'fx')).toHaveLength(0);
  });
});
