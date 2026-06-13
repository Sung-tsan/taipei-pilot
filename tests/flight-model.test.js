// @ts-check
import { describe, it, expect } from 'vitest';
import { P, makePlane, makeFlatEnv, stepPlane } from '../src/display/flight/flight-model.js';

const DT = 1 / 60;
const env = makeFlatEnv();

/**
 * @param {import('../src/display/flight/flight-model.js').PlaneState} s
 * @param {{r?:number,p?:number,th?:number,gearUp?:boolean}} input
 * @param {number} seconds
 * @param {(s:any)=>void} [each]
 */
function fly(s, { r = 0, p = 0, th = 0.5, gearUp = false }, seconds, each) {
  for (let t = 0; t < seconds; t += DT) {
    stepPlane(s, { r, p, th, gearUp }, DT, env);
    each?.(s);
  }
}

/** 直接給一個空中巡航狀態 */
function airborne({ x = 0, z = -4000, y = 300, heading = 0, speed = 45 } = {}) {
  const s = makePlane({ x, z, heading });
  s.pos.y = y;
  s.speed = speed;
  s.mode = 'flying';
  return s;
}

describe('起飛', () => {
  it('parked → 推油門 → rolling → 過 V_ROTATE 自動離地', () => {
    const s = makePlane({ heading: Math.PI / 2 });
    expect(s.mode).toBe('parked');
    let tookOff = false;
    fly(s, { th: 1 }, 15, (st) => { tookOff ||= st.justTookOff; });
    expect(tookOff).toBe(true);
    expect(s.mode).toBe('flying');
    expect(s.pos.y).toBeGreaterThan(5);
  });

  it('油門不足 V_ROTATE 對應值 → 一直滾不離地', () => {
    const s = makePlane();
    fly(s, { th: 0.5 }, 20); // 0.5*GROUND_TOP=21 < V_ROTATE
    expect(s.mode).toBe('rolling');
    expect(s.pos.y).toBe(0);
  });
});

describe('街機保護', () => {
  it('空中速度永遠在 [V_GLIDE, V_MAX]，油門 0 也不失速', () => {
    const s = airborne();
    fly(s, { th: 0 }, 20, (st) => {
      expect(st.speed).toBeGreaterThanOrEqual(P.V_GLIDE - 1e-9);
      expect(st.speed).toBeLessThanOrEqual(P.V_MAX + 1e-9);
    });
    expect(s.speed).toBeCloseTo(P.V_GLIDE, 5);
  });

  it('收油門 → 速度持續下降到滑翔速度，不會卡在巡航下限 V_MIN', () => {
    const s = airborne({ speed: P.V_MAX });
    fly(s, { th: 0 }, 20);
    expect(s.speed).toBeLessThan(P.V_MIN); // 101 km/h 卡點不復存在
    expect(s.speed).toBeCloseTo(P.V_GLIDE, 5);
  });

  it('收油門放手 → 自然下滑（高度漸降），不會原地平飛', () => {
    const s = airborne({ y: 300 });
    fly(s, { r: 0, p: 0, th: 0 }, 20);
    expect(s.pos.y).toBeLessThan(250); // 滑翔下沉 ≈ 3.8 m/s
    expect(s.mode).toBe('flying');
  });

  it('收油門但玩家拉桿 → 玩家優先，仍能維持高度/爬升', () => {
    const s = airborne({ y: 300 });
    fly(s, { r: 0, p: 0.6, th: 0 }, 5);
    expect(s.pos.y).toBeGreaterThan(295);
  });

  it('油門過半 → 不進入滑翔下沉，平飛維持高度', () => {
    const s = airborne({ y: 300 });
    fly(s, { r: 0, p: 0, th: 0.6 }, 10);
    expect(Math.abs(s.pos.y - 300)).toBeLessThan(5);
  });

  it('放手（死區內）→ bank 與 pitch 自動回平', () => {
    const s = airborne();
    fly(s, { r: 1, p: 0.8, th: 0.5 }, 2);
    expect(Math.abs(s.bank)).toBeGreaterThan(0.5);
    fly(s, { r: 0, p: 0, th: 0.5 }, 2);
    expect(Math.abs(s.bank)).toBeLessThan(0.01);
    expect(Math.abs(s.pitch)).toBeLessThan(0.01);
  });

  it('機場區外高空壓桿 → 機頭向下正常俯衝（迴歸：低空保護不可在高空清掉壓桿）', () => {
    const s = airborne({ z: -5000, y: 500 });
    fly(s, { r: 0, p: -1, th: 0.5 }, 3);
    expect(s.pitch).toBeLessThan(-0.2); // 壓桿有效，機頭確實朝下
    expect(s.pos.y).toBeLessThan(480); // 高度確實在掉
  });

  it('機場區外全程壓桿 → 低空柔性拉起，不會撞地', () => {
    const s = airborne({ z: -5000, y: 150 });
    fly(s, { p: -1, th: 1 }, 30, (st) => {
      expect(st.pos.y).toBeGreaterThan(8);
      expect(st.mode).toBe('flying');
    });
    // 收斂後穩在保護高度附近
    expect(s.pos.y).toBeGreaterThan(P.FLOOR_AGL * 0.5);
  });

  it('全程拉桿 → 雲頂柔性壓回，不會飛出天花板太多', () => {
    const s = airborne({ y: 500 });
    fly(s, { p: 1, th: 1 }, 60, (st) => {
      expect(st.pos.y).toBeLessThan(P.CLIMB_CEIL + 30);
    });
  });

  it('朝外直飛 → 邊界柔性轉回，永遠出不了 10km', () => {
    const s = airborne({ x: 0, z: -8500, y: 300, heading: 0 }); // 朝北直衝邊界
    let maxR = 0;
    fly(s, { r: 0, p: 0, th: 1 }, 120, (st) => {
      maxR = Math.max(maxR, Math.hypot(st.pos.x, st.pos.z));
    });
    expect(maxR).toBeLessThan(P.BOUNDARY_R + 100);
    // 兩分鐘後已被帶回內側
    expect(Math.hypot(s.pos.x, s.pos.z)).toBeLessThan(P.BOUNDARY_SOFT);
  });
});

describe('降落', () => {
  it('對正跑道、輕下沉 → 接地轉 rolling → 滑行停住 → parked', () => {
    // 跑道區內、低高度、淺下滑
    const s = airborne({ x: -800, z: 0, y: 12, heading: Math.PI / 2, speed: P.V_MIN });
    s.pitch = -0.05;
    let landed = false;
    for (let t = 0; t < 30 && !landed; t += DT) {
      stepPlane(s, { r: 0, p: -0.15, th: 0 }, DT, env);
      landed = s.justLanded;
    }
    expect(landed).toBe(true);
    expect(s.mode).toBe('rolling');
    fly(s, { th: 0 }, 15);
    expect(s.mode).toBe('parked');
    expect(s.speed).toBe(0);
  });

  it('跑道區外觸地 → 柔彈不墜毀，仍在飛', () => {
    // 起始就壓在貼地俯衝姿態 → 保護來不及完全救回 → 必觸地一次
    const s = airborne({ x: 0, z: -6000, y: 3, speed: 50 });
    s.pitch = -0.3;
    // 直接放在保護區外低空 → 會觸地一次
    let bounced = false;
    fly(s, { p: -1, th: 1 }, 5, (st) => {
      if (st.pos.y <= 2 && st.mode === 'flying') bounced = true;
      expect(st.mode).not.toBe('rolling'); // 區外不會「成功降落」
    });
    expect(s.mode).toBe('flying');
    expect(bounced).toBe(true);
  });
});

describe('起落架', () => {
  it('放輪極速較低、收輪飛更快', () => {
    const s = airborne();
    fly(s, { th: 1, gearUp: false }, 20);
    expect(s.gearDown).toBe(true);
    expect(s.speed).toBeCloseTo(P.V_MAX_GEAR, 1);
    fly(s, { th: 1, gearUp: true }, 20);
    expect(s.gearDown).toBe(false);
    expect(s.speed).toBeCloseTo(P.V_MAX, 1);
  });

  it('地面上不可收輪（rolling/parked 強制放下）', () => {
    const s = makePlane();
    fly(s, { th: 0.5, gearUp: true }, 5); // 滾行中硬按收輪
    expect(s.mode).toBe('rolling');
    expect(s.gearDown).toBe(true);
  });

  it('起飛前就按收輪 → 離地後自動收', () => {
    const s = makePlane({ heading: Math.PI / 2 });
    fly(s, { th: 1, gearUp: true }, 15);
    expect(s.mode).toBe('flying');
    expect(s.gearDown).toBe(false);
  });

  it('沒放輪不能落地 → 柔彈 + justNoGear 提醒，不會 justLanded', () => {
    const s = airborne({ x: -800, z: 0, y: 12, heading: Math.PI / 2, speed: P.V_MIN });
    s.pitch = -0.05;
    let noGear = false, landed = false;
    fly(s, { p: -0.15, th: 0, gearUp: true }, 20, (st) => {
      noGear ||= st.justNoGear;
      landed ||= st.justLanded;
    });
    expect(noGear).toBe(true);
    expect(landed).toBe(false);
    expect(s.mode).toBe('flying');
  });
});

describe('斷線盤旋', () => {
  it('autopilot=orbit → 固定繞圈、高度大致保持', () => {
    const s = airborne({ z: -4000, y: 250 });
    s.autopilot = 'orbit';
    const y0 = s.pos.y;
    const headings = /** @type {number[]} */ ([]);
    fly(s, { r: 0, p: 0, th: 0 }, 30, (st) => { headings.push(st.heading); });
    // 高度不暴衝不墜落
    expect(Math.abs(s.pos.y - y0)).toBeLessThan(60);
    // 確實在轉圈（heading 走過超過一整圈的弧度量）
    let total = 0;
    for (let i = 1; i < headings.length; i++) {
      let d = headings[i] - headings[i - 1];
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      total += Math.abs(d);
    }
    expect(total).toBeGreaterThan(Math.PI); // 30 秒至少轉過半圈

  });
});

describe('轉彎', () => {
  it('右壓桿 → heading 順時針增加（自動協調轉彎）', () => {
    const s = airborne({ heading: 0 });
    fly(s, { r: 1, th: 0.5 }, 3);
    expect(s.bank).toBeGreaterThan(0.5);
    // heading 從 0 增加（wrap 後仍在正向一側）
    expect(s.heading).toBeGreaterThan(0.3);
  });
});

describe('複雜版操控（rudder / flaps / trim，v1.1-0 P4 加法接線）', () => {
  /** 帶擴充欄位的飛行步進 @param {any} s @param {any} input @param {number} seconds */
  function flyEx(s, input, seconds) {
    for (let t = 0; t < seconds; t += DT) stepPlane(s, input, DT, env);
  }

  it('中立安全：不帶 rudder/flaps/trim 與帶全 0 → 狀態位元級一致', () => {
    const a = airborne({ z: -4000 });
    const b = airborne({ z: -4000 });
    for (let t = 0; t < 5; t += DT) {
      stepPlane(a, { r: 0.3, p: 0.2, th: 0.6 }, DT, env);
      stepPlane(b, { r: 0.3, p: 0.2, th: 0.6, rudder: 0, flaps: 0, trim: 0 }, DT, env);
    }
    expect(b.pos).toEqual(a.pos);
    expect(b.heading).toBe(a.heading);
    expect(b.pitch).toBe(a.pitch);
    expect(b.bank).toBe(a.bank);
    expect(b.speed).toBe(a.speed);
  });

  it('方向舵 → 直接 yaw（rudder>0 順時針增、rudder<0 逆時針減）', () => {
    const straight = airborne({ heading: 0 }); flyEx(straight, { r: 0, p: 0, th: 0.5 }, 2);
    const right = airborne({ heading: 0 }); flyEx(right, { r: 0, p: 0, th: 0.5, rudder: 1 }, 2);
    const left = airborne({ heading: 0 }); flyEx(left, { r: 0, p: 0, th: 0.5, rudder: -1 }, 2);
    expect(Math.abs(straight.heading)).toBeLessThan(0.05);     // 中立直飛 heading 幾乎不動
    expect(right.heading).toBeGreaterThan(0.3);                // 右舵把機頭偏右
    expect(left.heading).toBeLessThan(-0.3);                   // 左舵偏左
  });

  it('配平 → hands-off 持續偏置（trim>0 爬升、trim<0 下降、trim=0 平飛）', () => {
    const up = airborne({ y: 300 }); flyEx(up, { r: 0, p: 0, th: 0.5, trim: 1 }, 6);
    const lvl = airborne({ y: 300 }); flyEx(lvl, { r: 0, p: 0, th: 0.5, trim: 0 }, 6);
    const dn = airborne({ y: 300 }); flyEx(dn, { r: 0, p: 0, th: 0.5, trim: -1 }, 6);
    expect(up.pos.y).toBeGreaterThan(lvl.pos.y + 20);
    expect(dn.pos.y).toBeLessThan(lvl.pos.y - 20);
  });

  it('襟翼 → 降低可飛下限（更慢仍不失速）', () => {
    const clean = airborne({ speed: 45 }); flyEx(clean, { r: 0, p: 0, th: 0 }, 20);
    const flapped = airborne({ speed: 45 }); flyEx(flapped, { r: 0, p: 0, th: 0, flaps: 2 }, 20);
    expect(clean.speed).toBeCloseTo(P.V_GLIDE, 1);
    expect(flapped.speed).toBeCloseTo(P.V_GLIDE - 2 * P.FLAPS_GLIDE, 1);
    expect(flapped.speed).toBeLessThan(clean.speed); // 襟翼可飛更慢，利進場
  });

  it('襟翼 → 阻力大、極速降低', () => {
    const clean = airborne(); flyEx(clean, { r: 0, p: 0, th: 1, gearUp: true }, 25);
    const flapped = airborne(); flyEx(flapped, { r: 0, p: 0, th: 1, gearUp: true, flaps: 2 }, 25);
    expect(clean.speed).toBeCloseTo(P.V_MAX, 1);
    expect(flapped.speed).toBeCloseTo(P.V_MAX - 2 * P.FLAPS_DRAG, 1);
  });
});
