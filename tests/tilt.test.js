// @ts-check
// 傾斜映射的純數學（Android 實機 bug 的回歸測試）：
// 重力投影必須「跨歐拉翻轉點連續」且「深拉/深傾單調」—— 否則操控量會瞬間歸零（被拉平）。
import { describe, it, expect } from 'vitest';
import { gravityElevations, mapToStick } from '../src/remote/tilt.js';

/** 45° 面朝上橫拿的基準（beta=0, gamma=-45 → elevLong 0, elevShort 45） */
const BASE = gravityElevations(0, -45);

describe('gravityElevations', () => {
  it('基準握姿：長軸 0°、短軸 45°', () => {
    expect(BASE.elevLong).toBeCloseTo(0, 5);
    expect(BASE.elevShort).toBeCloseTo(45, 5);
  });

  it('跨 gamma ±90 翻轉點連續（翻轉前後投影值相同）', () => {
    // 拉桿過頭：gamma -88 →（翻轉）→ beta 180 / gamma +88，物理姿勢只差 4°
    const before = gravityElevations(0, -88);
    const after = gravityElevations(180, 88);
    expect(Math.abs(before.elevShort - after.elevShort)).toBeLessThan(5);
    expect(Math.abs(before.elevLong - after.elevLong)).toBeLessThan(1e-6);
  });

  it('深拉單調：往自己越傾、短軸仰角越大（不會中途反轉）', () => {
    let prev = -Infinity;
    for (let g = -20; g >= -89; g -= 5) {
      const { elevShort } = gravityElevations(0, g);
      expect(elevShort).toBeGreaterThan(prev);
      prev = elevShort;
    }
  });

  it('側傾不被 cos(45°) 打折：45° 面朝上時側傾 φ → 長軸仰角 ≈ φ', () => {
    // 物理側傾 20°（繞使用者前向軸）在歐拉角上近似 beta≈20 帶一點 gamma 耦合
    const { elevLong } = gravityElevations(20, -45);
    expect(elevLong).toBeCloseTo(20, 1);
  });
});

describe('mapToStick', () => {
  it('angle 90：右傾 = r 正、拉桿 = p 正', () => {
    const roll = mapToStick(gravityElevations(15, -45), BASE, 90);
    expect(roll.r).toBeGreaterThan(0.3);
    const pull = mapToStick(gravityElevations(0, -60), BASE, 90);
    expect(pull.p).toBeGreaterThan(0.3);
  });

  it('angle 270：同一物理動作符號相反（兩種橫拿方向）', () => {
    const a90 = mapToStick(gravityElevations(15, -45), BASE, 90);
    const a270 = mapToStick(gravityElevations(15, -45), BASE, 270);
    expect(a90.r).toBeCloseTo(-a270.r, 5);
  });

  it('死區內歸零、滿舵夾在 ±1', () => {
    expect(mapToStick(gravityElevations(1, -45.5), BASE, 90)).toEqual({ r: 0, p: 0 });
    const deep = mapToStick(gravityElevations(80, -45), BASE, 90);
    expect(deep.r).toBe(1);
  });

  it('回歸：拉桿過頭翻轉瞬間，p 不會跳水（Android 被拉平 bug）', () => {
    const before = mapToStick(gravityElevations(0, -88), BASE, 90);
    const after = mapToStick(gravityElevations(180, 88), BASE, 90);
    expect(before.p).toBe(1);
    expect(after.p).toBe(1); // 翻轉後仍是滿拉桿，不會歸零
  });
});
