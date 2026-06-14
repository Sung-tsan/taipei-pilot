// @ts-check
// remote context 動作鍵：mode → config 對照（v2.0-1 佔位，v2.0-5 接線到 remote）。
// 只測純資料/查詢（mountContextKeys 需 DOM，由 e2e 覆蓋）。
import { describe, it, expect } from 'vitest';
import {
  FREE_FLIGHT_KEYS, DOGFIGHT_KEYS, RACE_KEYS, KEYS_BY_MODE, keysForMode,
} from '../src/remote/context-keys.js';
import { BTN } from '../shared/protocol.js';

describe('context-keys 模式對照', () => {
  it('每份 config 都是「正好兩顆」可替換鍵（槽位數固定）', () => {
    for (const keys of [FREE_FLIGHT_KEYS, DOGFIGHT_KEYS, RACE_KEYS]) {
      expect(keys).toHaveLength(2);
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

  it('空戰鍵＝發射(FIRE 位元) + 換武器(WEAPON_SWITCH 位元)，走 btn bitmask（momentary）', () => {
    const ids = DOGFIGHT_KEYS.map((k) => k.id);
    expect(ids).toEqual(['fire', 'weapon']);
    const fire = DOGFIGHT_KEYS.find((k) => k.id === 'fire');
    const weapon = DOGFIGHT_KEYS.find((k) => k.id === 'weapon');
    expect(fire?.btn).toBe(BTN.FIRE);
    expect(weapon?.btn).toBe(BTN.WEAPON_SWITCH);
  });

  it('KEYS_BY_MODE 涵蓋四個玩法模式', () => {
    expect(Object.keys(KEYS_BY_MODE).sort()).toEqual(['dogfight', 'free', 'mission', 'race']);
  });
});
