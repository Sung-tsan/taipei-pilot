// @ts-check
import { describe, it, expect } from 'vitest';
import { parseMsg, encodeMsg } from '../shared/protocol.js';

describe('parseMsg', () => {
  it('接受合法 hello（remote 含/不含 token）', () => {
    expect(parseMsg(JSON.stringify({ t: 'hello', role: 'display' })))
      .toEqual({ t: 'hello', role: 'display' });
    expect(parseMsg(JSON.stringify({ t: 'hello', role: 'remote' })))
      .toEqual({ t: 'hello', role: 'remote', token: undefined });
    expect(parseMsg(JSON.stringify({ t: 'hello', role: 'remote', token: 'abc' })))
      .toEqual({ t: 'hello', role: 'remote', token: 'abc' });
  });

  it('接受合法 in 並保留欄位', () => {
    const m = parseMsg(JSON.stringify({ t: 'in', s: 7, r: -0.5, p: 1, th: 0.3, b: 0 }));
    expect(m).toEqual({ t: 'in', s: 7, r: -0.5, p: 1, th: 0.3, b: 0 });
  });

  it('拒絕超界與缺欄位的 in', () => {
    expect(parseMsg(JSON.stringify({ t: 'in', s: 1, r: -1.5, p: 0, th: 0, b: 0 }))).toBeNull();
    expect(parseMsg(JSON.stringify({ t: 'in', s: 1, r: 0, p: 0, th: 2, b: 0 }))).toBeNull();
    expect(parseMsg(JSON.stringify({ t: 'in', r: 0, p: 0, th: 0, b: 0 }))).toBeNull();
    expect(parseMsg(JSON.stringify({ t: 'in', s: 1, r: NaN, p: 0, th: 0, b: 0 }))).toBeNull();
  });

  it('拒絕垃圾輸入而不丟例外', () => {
    expect(parseMsg('not json')).toBeNull();
    expect(parseMsg('')).toBeNull();
    expect(parseMsg(JSON.stringify({ t: 'nope' }))).toBeNull();
    expect(parseMsg(JSON.stringify({ t: 'hello', role: 'hacker' }))).toBeNull();
    expect(parseMsg(JSON.stringify(null))).toBeNull();
    expect(parseMsg(JSON.stringify(42))).toBeNull();
  });

  it('fx 只接受已知 kind', () => {
    expect(parseMsg(JSON.stringify({ t: 'fx', slot: 0, kind: 'bump' })))
      .toEqual({ t: 'fx', slot: 0, kind: 'bump' });
    expect(parseMsg(JSON.stringify({ t: 'fx', slot: 0, kind: 'explode' }))).toBeNull();
  });

  it('接受 ping / pong 心跳', () => {
    expect(parseMsg(JSON.stringify({ t: 'ping' }))).toEqual({ t: 'ping' });
    expect(parseMsg(JSON.stringify({ t: 'pong' }))).toEqual({ t: 'pong' });
  });

  it('encode → parse 往返一致', () => {
    const msg = /** @type {const} */ ({ t: 'welcome', slot: 1, token: 'tok' });
    expect(parseMsg(encodeMsg(msg))).toEqual(msg);
  });

  // —— v1.1-0 P4：複雜版欄位（向後相容）——
  it('接受複雜版 in 的 rudder/flaps/trim 並保留', () => {
    const m = parseMsg(JSON.stringify({ t: 'in', s: 1, r: 0, p: 0, th: 0.5, b: 0, rudder: -0.5, flaps: 2, trim: 0.3 }));
    expect(m).toEqual({ t: 'in', s: 1, r: 0, p: 0, th: 0.5, b: 0, rudder: -0.5, flaps: 2, trim: 0.3 });
  });

  it('in 缺新欄位＝向後相容（舊 remote：不附加 rudder/flaps/trim）', () => {
    const m = parseMsg(JSON.stringify({ t: 'in', s: 1, r: 0, p: 0, th: 0, b: 0 }));
    expect(m).toEqual({ t: 'in', s: 1, r: 0, p: 0, th: 0, b: 0 });
    expect(m).not.toHaveProperty('rudder');
    expect(m).not.toHaveProperty('flaps');
    expect(m).not.toHaveProperty('trim');
  });

  it('拒絕超界 rudder/trim 與非整數/超界 flaps（壞值整則丟棄）', () => {
    const base = { t: 'in', s: 1, r: 0, p: 0, th: 0, b: 0 };
    expect(parseMsg(JSON.stringify({ ...base, rudder: 1.5 }))).toBeNull();
    expect(parseMsg(JSON.stringify({ ...base, trim: -2 }))).toBeNull();
    expect(parseMsg(JSON.stringify({ ...base, flaps: 1.5 }))).toBeNull();
    expect(parseMsg(JSON.stringify({ ...base, flaps: -1 }))).toBeNull();
    expect(parseMsg(JSON.stringify({ ...base, flaps: 99 }))).toBeNull();
  });

  it('pstate 帶/不帶儀表都合法（向後相容）', () => {
    expect(parseMsg(JSON.stringify({ t: 'pstate', slot: 0, gear: true, mode: 'flying' })))
      .toEqual({ t: 'pstate', slot: 0, gear: true, mode: 'flying' });
    expect(parseMsg(JSON.stringify({ t: 'pstate', slot: 1, gear: false, mode: 'flying', spd: 120, alt: 300, hdg: 90 })))
      .toEqual({ t: 'pstate', slot: 1, gear: false, mode: 'flying', spd: 120, alt: 300, hdg: 90 });
  });
});
