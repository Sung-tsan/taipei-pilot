// @ts-check
import { describe, it, expect } from 'vitest';
import {
  WEAPON_SPECS,
  LOCK_CONE_HALF_RAD,
  acquireAirLock,
  groundAimPoint,
  canHitGround,
  spawnProjectile,
  stepProjectile,
  makeMagazine,
  canFire,
  fire,
  reload,
} from '../src/display/combat/weapons.js';

const DT = 1 / 60;

/**
 * 在固定 env 下推進一枚彈丸到結束（或上限步數），回傳最後結果。
 * @param {any} proj @param {any} env @param {number} [maxSteps]
 */
function runProjectile(proj, env, maxSteps = 2000) {
  /** @type {{result:string, targetId?:any}} */
  let res = { result: 'flying' };
  for (let i = 0; i < maxSteps; i++) {
    res = stepProjectile(proj, DT, env);
    if (res.result !== 'flying') break;
  }
  return res;
}

describe('武器諸元表 WEAPON_SPECS', () => {
  it('三種武器齊全、kind / sound / homing 屬性符合規格', () => {
    const { cartoon, aa, ag } = WEAPON_SPECS;
    // cartoon：對空、追蹤、可愛音
    expect(cartoon.kind).toBe('air');
    expect(cartoon.homingRate).toBeGreaterThan(0);
    expect(cartoon.sound).toBe('cartoon');
    // aa：對空、追蹤、擬真爆炸音
    expect(aa.kind).toBe('air');
    expect(aa.homingRate).toBeGreaterThan(0);
    expect(aa.sound).toBe('boom');
    // ag：對地、不追蹤、擬真爆炸音
    expect(ag.kind).toBe('ground');
    expect(ag.homingRate).toBe(0);
    expect(ag.sound).toBe('boom');
  });

  it('每個 spec 欄位完整且數值合理（彈速 > 飛機極速、彈匣 > 0）', () => {
    for (const key of /** @type {const} */ (['cartoon', 'aa', 'ag'])) {
      const s = WEAPON_SPECS[key];
      expect(s.id).toBe(key);
      expect(typeof s.label).toBe('string');
      expect(s.rangeM).toBeGreaterThan(0);
      expect(s.speedMps).toBeGreaterThan(65); // 比 V_MAX 快才追得上
      expect(s.lifetimeSec).toBeGreaterThan(0);
      expect(s.cooldownSec).toBeGreaterThan(0);
      expect(s.magazine).toBeGreaterThan(0);
      expect(s.hitRadiusM).toBeGreaterThan(0);
    }
  });
});

describe('對空鎖定 acquireAirLock', () => {
  const spec = WEAPON_SPECS.cartoon; // rangeM 700

  it('多目標 → 選機頭前方錐內「最近」的那個', () => {
    const shooter = { pos: { x: 0, y: 100, z: 0 }, heading: 0 }; // 朝北（-Z）
    const targets = [
      { id: 'far', pos: { x: 0, y: 100, z: -600 } },   // 正前方 600m
      { id: 'near', pos: { x: 0, y: 100, z: -200 } },   // 正前方 200m（最近）
      { id: 'behind', pos: { x: 0, y: 100, z: 300 } },  // 正後方（錐外）
    ];
    expect(acquireAirLock(shooter, targets, spec)).toBe('near');
  });

  it('錐外目標不鎖（在正側方、超出 ±50°）', () => {
    const shooter = { pos: { x: 0, y: 100, z: 0 }, heading: 0 }; // 朝北
    const targets = [
      { id: 'side', pos: { x: 300, y: 100, z: 0 } }, // 正東＝機頭右側 90°，超出 50°
    ];
    expect(acquireAirLock(shooter, targets, spec)).toBeNull();
  });

  it('超距目標不鎖（在錐內但超過 rangeM）', () => {
    const shooter = { pos: { x: 0, y: 100, z: 0 }, heading: 0 };
    const targets = [
      { id: 'toofar', pos: { x: 0, y: 100, z: -(spec.rangeM + 50) } }, // 正前方但超距
    ];
    expect(acquireAirLock(shooter, targets, spec)).toBeNull();
  });

  it('錐邊界內側鎖得到、外側鎖不到', () => {
    const shooter = { pos: { x: 0, y: 0, z: 0 }, heading: 0 };
    const d = 300;
    // 角度略小於錐半角 → 在錐內
    const aIn = LOCK_CONE_HALF_RAD - 0.02;
    const inTarget = { id: 'in', pos: { x: Math.sin(aIn) * d, y: 0, z: -Math.cos(aIn) * d } };
    expect(acquireAirLock(shooter, [inTarget], spec)).toBe('in');
    // 角度略大於錐半角 → 在錐外
    const aOut = LOCK_CONE_HALF_RAD + 0.02;
    const outTarget = { id: 'out', pos: { x: Math.sin(aOut) * d, y: 0, z: -Math.cos(aOut) * d } };
    expect(acquireAirLock(shooter, [outTarget], spec)).toBeNull();
  });

  it('空目標列表 / 缺輸入 → null，不爆', () => {
    const shooter = { pos: { x: 0, y: 0, z: 0 }, heading: 0 };
    expect(acquireAirLock(shooter, [], spec)).toBeNull();
    // @ts-expect-error 故意傳壞輸入測安全網
    expect(acquireAirLock(null, null, null)).toBeNull();
    // @ts-expect-error 目標物件缺 pos
    expect(acquireAirLock(shooter, [{ id: 'x' }, null], spec)).toBeNull();
  });
});

describe('對地瞄準 groundAimPoint', () => {
  it('朝北 → 瞄準點在正前方（-Z）distanceM 處', () => {
    const shooter = { pos: { x: 10, y: 200, z: 20 }, heading: 0 };
    const p = groundAimPoint(shooter, 500);
    expect(p.x).toBeCloseTo(10, 6);
    expect(p.z).toBeCloseTo(20 - 500, 6);
  });

  it('朝東（heading=π/2）→ 瞄準點在 +X 方向', () => {
    const shooter = { pos: { x: 0, y: 200, z: 0 }, heading: Math.PI / 2 };
    const p = groundAimPoint(shooter, 400);
    expect(p.x).toBeCloseTo(400, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });

  it('缺輸入 → 回原點附近，不爆', () => {
    // @ts-expect-error 故意傳 undefined
    const p = groundAimPoint(undefined, undefined);
    expect(p).toEqual({ x: 0, z: 0 });
  });
});

describe('紅線豁免 canHitGround', () => {
  const redZones = [{ x: 0, z: 0, r: 500 }];
  const landmarks = [{ x: 100, z: 0, r: 80 }]; // 紅區內的教育地標

  it('紅區內、非地標 → true（可打）', () => {
    expect(canHitGround({ x: -200, z: 0 }, { redZones, landmarks })).toBe(true);
  });

  it('紅區外 → false（不可打）', () => {
    expect(canHitGround({ x: 1000, z: 0 }, { redZones, landmarks })).toBe(false);
  });

  // ⭐ 明確命名的紅線回歸測試 —— 沒有地標豁免邏輯就會紅
  it('紅線回歸：對地命中落在「教育地標」上 → canHitGround=false（命中無效，保護地標）', () => {
    // 點落在紅區內 AND 正壓在地標上 → 必須被豁免擋下
    const onLandmark = { x: 100, z: 0 }; // 地標圓心
    expect(canHitGround(onLandmark, { redZones, landmarks })).toBe(false);
    // 對照：同樣在紅區、但離開地標 1m 之外 → 又可打了（證明擋的就是地標本身）
    const justOff = { x: 100 + 81, z: 0 };
    expect(canHitGround(justOff, { redZones, landmarks })).toBe(true);
  });

  it('地標但不在任何紅區 → 仍 false（沒紅區就一律不可打）', () => {
    expect(canHitGround({ x: 100, z: 0 }, { redZones: [], landmarks })).toBe(false);
  });

  it('缺 cfg / 缺 point → false，不爆', () => {
    expect(canHitGround({ x: 0, z: 0 })).toBe(false); // cfg 可省（預設空）
    // @ts-expect-error 故意不傳 point
    expect(canHitGround(null, { redZones, landmarks })).toBe(false);
  });
});

describe('彈丸 spawnProjectile / stepProjectile', () => {
  /** @param {any} [targetPos] */
  const flatEnv = (targetPos) => ({
    targetPosOf: () => (targetPos ? { ...targetPos } : null),
    groundY: () => 0,
  });

  it('spawnProjectile：vel 由 heading × speedMps 算（朝北＝-Z 方向）', () => {
    const shooter = { pos: { x: 0, y: 100, z: 0 }, heading: 0 };
    const p = spawnProjectile(shooter, WEAPON_SPECS.aa, 'enemy');
    expect(p.age).toBe(0);
    expect(p.targetId).toBe('enemy');
    expect(p.vel.x).toBeCloseTo(0, 6);
    expect(p.vel.z).toBeCloseTo(-WEAPON_SPECS.aa.speedMps, 6);
    expect(Math.hypot(p.vel.x, p.vel.y, p.vel.z)).toBeCloseTo(WEAPON_SPECS.aa.speedMps, 6);
  });

  it('對空 homing 收斂命中：射向偏一點的目標，追蹤後 hit', () => {
    // 目標在前方但偏右 → 直射會錯過，靠 homing 轉過去命中
    const shooter = { pos: { x: 0, y: 100, z: 0 }, heading: 0 }; // 朝北
    const target = { x: 120, y: 130, z: -400 };
    const proj = spawnProjectile(shooter, WEAPON_SPECS.cartoon, 'e1');
    const res = runProjectile(proj, flatEnv(target));
    expect(res.result).toBe('hit');
    expect(res.targetId).toBe('e1');
  });

  it('對空 homing：目標在合理射程內，最終命中而非過期', () => {
    const shooter = { pos: { x: 0, y: 100, z: 0 }, heading: 0 };
    const target = { x: -60, y: 90, z: -300 };
    const proj = spawnProjectile(shooter, WEAPON_SPECS.aa, 't');
    const res = runProjectile(proj, flatEnv(target));
    expect(res.result).toBe('hit');
  });

  it('對地直射命中地面（ag，不追蹤）→ hit', () => {
    // 從高處朝北水平射出，會一路飛直線；ag 在落地時判命中地面
    // 給彈丸一個向下的初速以模擬俯射？規格是水平射出 → 靠 lifetime 內飛行。
    // 這裡讓地面抬高到彈道高度，確保「到達地面」分支被觸發。
    const shooter = { pos: { x: 0, y: 5, z: 0 }, heading: 0 };
    const proj = spawnProjectile(shooter, WEAPON_SPECS.ag, null);
    const env = {
      targetPosOf: () => null,
      groundY: () => 5, // 地面就在彈道高度 → 立刻判到地面
    };
    const res = stepProjectile(proj, DT, env);
    expect(res.result).toBe('hit');
  });

  it('對地直射：飛超過 rangeM → expired（沒打到任何東西）', () => {
    const shooter = { pos: { x: 0, y: 100, z: 0 }, heading: 0 };
    const proj = spawnProjectile(shooter, WEAPON_SPECS.ag, null);
    const env = {
      targetPosOf: () => null,
      groundY: () => -9999, // 地面在很深處 → 永遠到不了地面
    };
    const res = runProjectile(proj, env);
    expect(res.result).toBe('expired');
    // 飛行距離應 ≈ rangeM
    const flown = proj.age * WEAPON_SPECS.ag.speedMps;
    expect(flown).toBeGreaterThanOrEqual(WEAPON_SPECS.ag.rangeM - WEAPON_SPECS.ag.speedMps * DT);
  });

  it('壽命到 → expired（目標一直追不到，homing 但目標超遠）', () => {
    const shooter = { pos: { x: 0, y: 100, z: 0 }, heading: 0 };
    // 目標超出射程很遠 → 追不到、最終因 range/life 過期
    const target = { x: 0, y: 100, z: -99999 };
    const proj = spawnProjectile(shooter, WEAPON_SPECS.cartoon, 'gone');
    const env = { targetPosOf: () => target, groundY: () => -9999 };
    const res = runProjectile(proj, env);
    expect(res.result).toBe('expired');
  });

  it('壞輸入 / 缺 env → expired，不爆', () => {
    // @ts-expect-error 故意傳 null
    expect(stepProjectile(null, DT, {})).toEqual({ result: 'expired' });
    const shooter = { pos: { x: 0, y: 0, z: 0 }, heading: 0 };
    const proj = spawnProjectile(shooter, WEAPON_SPECS.ag, null);
    // 缺 env 的方法 → 走 fallback，不丟例外
    // @ts-expect-error 故意傳空 env
    expect(() => stepProjectile(proj, DT, {})).not.toThrow();
  });
});

describe('彈藥 / 冷卻 / 補彈', () => {
  it('makeMagazine：滿彈、就緒（readyAt=0）', () => {
    const mag = makeMagazine(WEAPON_SPECS.cartoon);
    expect(mag.ammo).toBe(WEAPON_SPECS.cartoon.magazine);
    expect(mag.max).toBe(WEAPON_SPECS.cartoon.magazine);
    expect(mag.readyAt).toBe(0);
    expect(canFire(mag, 0)).toBe(true);
  });

  it('fire：扣彈 1 發 + 設冷卻；冷卻內擋連發', () => {
    const spec = WEAPON_SPECS.aa; // cooldown 1.2s
    const mag = makeMagazine(spec);
    const t0 = 1000;
    fire(mag, t0);
    expect(mag.ammo).toBe(spec.magazine - 1);
    expect(mag.readyAt).toBe(t0 + spec.cooldownSec * 1000);
    // 冷卻中 → 不可發射
    expect(canFire(mag, t0 + 100)).toBe(false);
    // 冷卻中硬按 fire → 不扣彈
    fire(mag, t0 + 100);
    expect(mag.ammo).toBe(spec.magazine - 1);
    // 冷卻過後 → 可再射
    expect(canFire(mag, t0 + spec.cooldownSec * 1000)).toBe(true);
  });

  it('彈量歸零 → canFire=false（即使冷卻已過）', () => {
    const spec = WEAPON_SPECS.cartoon;
    const mag = makeMagazine(spec);
    let now = 0;
    for (let i = 0; i < spec.magazine; i++) {
      expect(canFire(mag, now)).toBe(true);
      fire(mag, now);
      now += spec.cooldownSec * 1000 + 1; // 跳過冷卻
    }
    expect(mag.ammo).toBe(0);
    expect(canFire(mag, now)).toBe(false);
    // 空匣硬按 → 仍 0
    fire(mag, now);
    expect(mag.ammo).toBe(0);
  });

  it('reload：補滿到 max、清冷卻', () => {
    const spec = WEAPON_SPECS.ag;
    const mag = makeMagazine(spec);
    fire(mag, 5000);
    fire(mag, 5000 + spec.cooldownSec * 1000 + 1);
    expect(mag.ammo).toBeLessThan(spec.magazine);
    reload(mag);
    expect(mag.ammo).toBe(spec.magazine);
    expect(mag.readyAt).toBe(0);
    expect(canFire(mag, 0)).toBe(true);
  });

  it('壞輸入：canFire(null) / fire(null) / reload(null) → 不爆', () => {
    // @ts-expect-error
    expect(canFire(null, 0)).toBe(false);
    // @ts-expect-error
    expect(() => fire(null, 0)).not.toThrow();
    // @ts-expect-error
    expect(() => reload(null)).not.toThrow();
  });
});
