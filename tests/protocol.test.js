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
});
