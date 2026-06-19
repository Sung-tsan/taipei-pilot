// @ts-check
// remote context 動作鍵：mode → config 對照（v2.0-1 佔位，v2.0-5 接線到 remote）。
// 只測純資料/查詢（mountContextKeys 需 DOM，由 e2e 覆蓋）。
import { describe, it, expect } from 'vitest';
import {
  FREE_FLIGHT_KEYS, DOGFIGHT_KEYS, RACE_KEYS, DEPART_KEYS, KEYS_BY_MODE, keysForMode,
} from '../src/remote/context-keys.js';
import { BTN } from '../shared/protocol.js';

describe('context-keys 模式對照', () => {
  it('自由飛/競速＝兩顆、空戰＝三顆（多一顆翻滾閃避）；每顆都有 id/label', () => {
    expect(FREE_FLIGHT_KEYS).toHaveLength(2);
    expect(RACE_KEYS).toHaveLength(2);
    expect(DOGFIGHT_KEYS).toHaveLength(3);
    for (const keys of [FREE_FLIGHT_KEYS, DOGFIGHT_KEYS, RACE_KEYS]) {
      for (const k of keys) {
        expect(typeof k.id).toBe('string');
        expect(typeof k.label).toBe('string');
      }
    }
  });

  it('keysForMode：自由飛/任務→FREE、空戰→DOGFIGHT、競速→RACE', () => {
    expect(keysForMode('free')).toBe(FREE_FLIGHT_KEYS);
    expect(keysForMode('mission')).toBe(FREE_FLIGHT_KEYS);
    expect(keysForMode('dogfight')).toBe(DOGFIGHT_KEYS);
    expect(keysForMode('race')).toBe(RACE_KEYS);
  });

  it('未知 mode → 退回自由飛鍵（不爆）', () => {
    expect(keysForMode('weird')).toBe(FREE_FLIGHT_KEYS);
  });

  it('空戰鍵＝發射(FIRE) + 換武器(WEAPON_SWITCH) + 翻滾閃避(DODGE)，皆走 btn bitmask（momentary）', () => {
    const ids = DOGFIGHT_KEYS.map((k) => k.id);
    expect(ids).toEqual(['fire', 'weapon', 'dodge']);
    const fire = DOGFIGHT_KEYS.find((k) => k.id === 'fire');
    const weapon = DOGFIGHT_KEYS.find((k) => k.id === 'weapon');
    const dodge = DOGFIGHT_KEYS.find((k) => k.id === 'dodge');
    expect(fire?.btn).toBe(BTN.FIRE);
    expect(weapon?.btn).toBe(BTN.WEAPON_SWITCH);
    expect(dodge?.btn).toBe(BTN.DODGE);
  });

  it('KEYS_BY_MODE 涵蓋四玩法 + 離場確認子模式', () => {
    expect(Object.keys(KEYS_BY_MODE).sort()).toEqual(['depart', 'dogfight', 'free', 'mission', 'race']);
  });

  it('離場子模式 depart：確認後推鍵走 BTN.CONFIRM（momentary）', () => {
    expect(keysForMode('depart')).toBe(DEPART_KEYS);
    const confirm = DEPART_KEYS.find((k) => k.id === 'confirm');
    expect(confirm?.btn).toBe(BTN.CONFIRM);
  });
});
