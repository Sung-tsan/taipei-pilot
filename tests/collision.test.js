// @ts-check
// 撞建築判定：飛行＝溫和彈開；地面滑行＝擋牆停住（不爬屋頂/不穿牆）。
// 回歸守 HITL 2026-06-21「桃園滑過頭卡在航廈頂」：地面撞建築要退回上一安全位置（沒修＝不退→卡死）。
import { describe, it, expect } from 'vitest';
import { makePlane } from '../src/display/flight/flight-model.js';
import { collidePlane } from '../src/display/flight/collision.js';

/** 建築 footprint：以原點為中心 ±20 的方塊，高 21。 */
const solidAt = (/** @type {number} */ x, /** @type {number} */ z) =>
  (Math.abs(x) < 20 && Math.abs(z) < 20 ? { h: 21, cx: 0, cz: 0 } : null);

describe('collidePlane', () => {
  it('地面滑行撞進建築 footprint → 退回上一安全位置、停住、不算 mishap（回歸：不卡屋頂）', () => {
    const s = makePlane({ x: 5, z: 0 }); // 已進到 footprint 內
    s.mode = 'rolling'; s.pos.y = 0; s.speed = 12;
    const prev = { x: -30, y: 0, z: 0 };  // 上一步在 footprint 外
    const hit = collidePlane(s, prev, solidAt);
    expect(hit).toBe(false);              // 地面擋牆不走 mishap/crash
    expect(s.pos.x).toBe(prev.x);         // 退回（沒修＝停在 5＝卡進/爬上建築）
    expect(s.pos.z).toBe(prev.z);
    expect(s.speed).toBe(0);              // 停住
  });

  it('地面在淨空區（無建築）→ 不擋、不動', () => {
    const s = makePlane({ x: 100, z: 100 });
    s.mode = 'rolling'; s.speed = 10;
    const prev = { x: 90, y: 0, z: 100 };
    expect(collidePlane(s, prev, solidAt)).toBe(false);
    expect(s.pos.x).toBe(100); // 沒被退回
    expect(s.speed).toBe(10);
  });

  it('飛行撞建築（低於屋頂）→ 溫和彈開（退回 + 推離中心 + 減速），回 true', () => {
    const s = makePlane({ x: 8, z: 0 });
    s.mode = 'flying'; s.pos.y = 10; s.speed = 60; // 低於 21 屋頂
    const prev = { x: 8, y: 10, z: 0 };
    expect(collidePlane(s, prev, solidAt)).toBe(true);
  });

  it('飛行高於屋頂 → 不撞（擦頂安全）', () => {
    const s = makePlane({ x: 0, z: 0 });
    s.mode = 'flying'; s.pos.y = 40; s.speed = 60; // 高於 21
    expect(collidePlane(s, { x: 0, y: 40, z: 0 }, solidAt)).toBe(false);
  });
});
