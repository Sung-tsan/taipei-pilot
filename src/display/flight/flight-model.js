// @ts-check
// 街機式飛行模型 —— 純函式，與 Three.js 完全解耦，vitest 直測。
// 座標：1 unit = 1m。X=東、Z=南、Y=高。heading 0 = 北（-Z）、順時針增加。
// 街機保護：速度區間鎖定（不失速）、放手回平、低空柔性拉起、邊界柔性轉回。
import { clamp, lerp, approach, approachAngle, wrapAngle, angDiff } from '../../lib/math.js';
import { MAX_FLAPS } from '../../../shared/constants.js';

/** 手感調參總表 —— 改手感只動這張表 */
export const P = {
  V_MIN: 28,            // m/s 巡航下限（柔彈/撞擊回復用的能量底線）
  V_GLIDE: 21,          // m/s 收油門的滑翔速度 —— 比 V_MIN 慢但仍不失速
  GLIDE_PITCH: -0.18,   // rad 收油門放手時自然下垂（≈ -10°，下沉 ~3.8 m/s，接近真機怠速下滑）
  IDLE_TH: 0.25,        // 油門低於此值漸進進入滑翔（變慢 + 自然下降）
  V_MAX: 65,            // m/s 最高空速（收起落架）
  V_MAX_GEAR: 52,       // m/s 放起落架的極速（教孩子「收輪飛比較快」）
  V_ROTATE: 33,         // m/s 滾行到這個速度自動離地
  ACCEL: 8,             // m/s² 空中加減速
  GROUND_ACCEL: 10,     // m/s² 地面加速
  GROUND_DRAG: 6,       // m/s² 地面無油門減速
  GROUND_TOP: 42,       // m/s 地面滾行極速（> V_ROTATE 才起得來）
  MAX_BANK: 0.8,        // rad（≈46°）
  BANK_RATE: 1.6,       // rad/s
  MAX_PITCH: 0.35,      // rad（≈20°，地平線永遠在畫面內 → 減暈）
  PITCH_RATE: 1.0,      // rad/s
  TURN_G: 9.8,          // 自動協調轉彎用
  FLOOR_AGL: 35,        // m 低空保護目標高度
  FLOOR_ZONE: 70,       // m 低於此高度開始混入拉起（機場區除外，否則無法降落）
  CLIMB_CEIL: 600,      // m 雲頂
  BOUNDARY_SOFT: 9000,  // m 開始柔性轉回
  BOUNDARY_R: 10000,    // m 空域半徑
  LAND_MAX_SINK: 6,     // m/s 接地最大下沉率（寬鬆）
  LAND_MAX_BANK: 0.22,  // rad 接地最大側傾
  ORBIT_BANK: 0.45,     // 斷線盤旋（≈52 秒一圈、半徑 ~320m）
  ORBIT_TH: 0.3,
  CLIMB_ASSIST_AGL: 30, // m 低於此高度且油門夠 → 自動帶爬升（孩子推滿油門就會上天）
  CLIMB_ASSIST_PITCH: 0.16,
  // —— 複雜版操控（v1.1-0 P4，純加法，neutral=0 時與 v1 完全一致）——
  RUDDER_YAW: 0.5,      // rad/s 滿方向舵的直接 yaw（接 V3 側風 crab；rudder=0 不影響）
  TRIM_AUTH: 0.5,       // 配平相對升降舵的權威（滿 trim = 半個升降舵；trim=0 不影響）
  FLAPS_GLIDE: 2,       // m/s 每段襟翼降低可飛下限（更慢仍不失速，利進場）
  FLAPS_DRAG: 6,        // m/s 每段襟翼降低極速（阻力）
};

/**
 * @typedef {{ x:number, y:number, z:number }} Vec3
 * @typedef {{ r:number, p:number, th:number, gearUp?:boolean,
 *             rudder?:number, flaps?:number, trim?:number, landAnywhere?:boolean }} Input
 *   rudder/flaps/trim＝複雜版選送（缺值＝中立 0，行為與簡單版/v1 完全一致）。
 *   landAnywhere＝真實模式：關閉機場外低空拉起、機場外觸地＝迫降（缺省 false＝與 v1 一致）。
 * @typedef {'parked'|'rolling'|'flying'} PlaneMode
 * @typedef {{
 *   pos: Vec3, heading: number, pitch: number, bank: number,
 *   speed: number, mode: PlaneMode, autopilot: null|'orbit', gearDown: boolean,
 *   justTookOff: boolean, justLanded: boolean, justBounced: boolean, justNoGear: boolean,
 *   justForcedTouch: boolean, lastSink: number,
 * }} PlaneState
 * @typedef {{
 *   groundY: (x:number, z:number) => number,
 *   canLandHere: (x:number, z:number) => boolean,
 *   inLowFlyZone: (x:number, z:number) => boolean,
 * }} Env
 */

/**
 * @param {{ x?:number, z?:number, heading?:number }} [opts]
 * @returns {PlaneState}
 */
export function makePlane({ x = 0, z = 0, heading = 0 } = {}) {
  return {
    pos: { x, y: 0, z },
    heading, pitch: 0, bank: 0, speed: 0,
    mode: 'parked', autopilot: null, gearDown: true,
    justTookOff: false, justLanded: false, justBounced: false, justNoGear: false,
    justForcedTouch: false, lastSink: 0,
  };
}

/** 跑道 AABB 的平坦測試環境（vitest 與 Stage 2 用） */
export function makeFlatEnv({ runwayHalfLength = 1400, runwayHalfWidth = 60, airportRadius = 2000 } = {}) {
  return /** @type {Env} */ ({
    groundY: () => 0,
    // 跑道區概略 AABB（沿 heading 100° 的跑道，用旋轉前的粗框就夠寬鬆了）
    canLandHere: (x, z) => Math.abs(x) < runwayHalfLength && Math.abs(z) < runwayHalfWidth + 250,
    inLowFlyZone: (x, z) => Math.hypot(x, z) < airportRadius,
  });
}

/**
 * 前進一步（固定步長 60Hz 由呼叫端保證）。會原地修改 state。
 * @param {PlaneState} s
 * @param {Input} rawInput
 * @param {number} dt
 * @param {Env} env
 */
export function stepPlane(s, rawInput, dt, env) {
  s.justTookOff = false;
  s.justLanded = false;
  s.justBounced = false;
  s.justNoGear = false;
  s.justForcedTouch = false;
  const input = s.autopilot === 'orbit'
    ? { r: 0, p: 0, th: P.ORBIT_TH, gearUp: !s.gearDown } // bank 直接鎖定，gear 維持原狀
    : rawInput;

  if (s.mode === 'parked') {
    s.gearDown = true; // 地面上不可收輪
    if (input.th > 0.05) s.mode = 'rolling';
    return;
  }

  if (s.mode === 'rolling') {
    s.gearDown = true;
    stepRolling(s, input, dt, env);
    return;
  }

  s.gearDown = !input.gearUp; // 空中聽遙控器的（離地後「先前就按了收輪」自動生效）
  stepFlying(s, input, dt, env);
}

/**
 * @param {PlaneState} s @param {Input} input @param {number} dt @param {Env} env
 */
function stepRolling(s, input, dt, env) {
  const target = input.th * P.GROUND_TOP;
  const rate = target > s.speed ? P.GROUND_ACCEL : P.GROUND_DRAG;
  s.speed = approach(s.speed, target, rate, dt);

  // 地面轉向：低速才轉得動方向（不會原地打轉）
  const steer = input.r * 0.4 * clamp(s.speed / P.V_ROTATE, 0, 1);
  s.heading = wrapAngle(s.heading + steer * dt);
  s.bank = approach(s.bank, 0, P.BANK_RATE, dt);
  s.pitch = approach(s.pitch, 0, P.PITCH_RATE, dt);

  // 位移（貼地）
  moveForward(s, dt);
  s.pos.y = env.groundY(s.pos.x, s.pos.z);

  if (s.speed >= P.V_ROTATE) {
    s.mode = 'flying';
    s.pitch = 0.12; // 自動離地，不需拉桿
    s.justTookOff = true;
  } else if (s.speed < 0.5 && input.th < 0.05) {
    s.speed = 0;
    s.mode = 'parked';
  }
}

/**
 * @param {PlaneState} s @param {Input} input @param {number} dt @param {Env} env
 */
function stepFlying(s, input, dt, env) {
  // 1. 速度：區間鎖定，永不失速；放起落架 = 阻力大，極速較低。
  // 收油門 → 一路減速到 vGlide（不再卡在巡航下限），但永遠不會更慢 → 不失速。
  // 襟翼（複雜版）：每段降低可飛下限 + 降低極速（升力/阻力）；flaps=0 → 與 v1 完全一致。
  const flaps = clamp(input.flaps ?? 0, 0, MAX_FLAPS);
  const vGlide = P.V_GLIDE - flaps * P.FLAPS_GLIDE;
  const vMax = (s.gearDown ? P.V_MAX_GEAR : P.V_MAX) - flaps * P.FLAPS_DRAG;
  const vTarget = lerp(vGlide, vMax, clamp(input.th, 0, 1));
  s.speed = approach(s.speed, vTarget, P.ACCEL, dt);
  s.speed = clamp(s.speed, vGlide, P.V_MAX);

  // 2. 滾轉：死區內 = 放手自動回平
  let bankTarget = clamp(input.r, -1, 1) * P.MAX_BANK;
  if (s.autopilot === 'orbit') bankTarget = P.ORBIT_BANK;

  // 3. 俯仰目標（複雜版配平：trim 疊進升降舵當持續偏置；trim=0 → 與 v1 完全一致）
  const pIn = clamp(clamp(input.p, -1, 1) + (input.trim ?? 0) * P.TRIM_AUTH, -1, 1);
  let pitchTarget = pIn * P.MAX_PITCH;

  // 收油門 → 自然下滑（能量耦合的街機版）：油門低於 IDLE_TH 時，
  // 「放手回平」的目標俯仰漸變為輕微下垂 → 飛機像滑翔一樣慢慢降。
  // 玩家推/拉桿（|p| 大）時讓位給玩家；低空保護在後面仍會蓋過。
  const idleW = clamp((P.IDLE_TH - input.th) / P.IDLE_TH, 0, 1);
  if (idleW > 0) {
    const handsOff = 1 - Math.abs(clamp(input.p, -1, 1));
    pitchTarget += idleW * handsOff * P.GLIDE_PITCH;
  }

  const agl = s.pos.y - env.groundY(s.pos.x, s.pos.z);

  // 爬升輔助：低空 + 油門夠 → 自動帶機頭上（起飛「推油門就上天」；
  // 降落進場油門收小 → 不觸發，照常下滑）
  if (input.th > 0.4 && agl < P.CLIMB_ASSIST_AGL) {
    const assist = clamp((P.CLIMB_ASSIST_AGL - agl) / P.CLIMB_ASSIST_AGL, 0, 1);
    pitchTarget = Math.max(pitchTarget, assist * P.CLIMB_ASSIST_PITCH);
  }

  // 低空柔性拉起（機場區除外 —— 不然永遠降不了落）。
  // ⚠️ 只在 urgency > 0（真的低空）才介入：urgency = 0 時 Math.max(p, 0)
  // 會把整個機場區外的「機頭向下」全部清掉（2026-06-12 修：俯衝失靈主因）。
  // landAnywhere（真實模式）：關閉這道拉起，讓玩家能降到機場外地面迫降。
  if (!env.inLowFlyZone(s.pos.x, s.pos.z) && !input.landAnywhere) {
    const urgency = clamp((P.FLOOR_ZONE - agl) / (P.FLOOR_ZONE - P.FLOOR_AGL), 0, 1);
    if (urgency > 0) pitchTarget = Math.max(pitchTarget, urgency * P.MAX_PITCH);
  }
  // 雲頂：柔性壓回
  const ceilUrgency = clamp((s.pos.y - (P.CLIMB_CEIL - 60)) / 60, 0, 1);
  pitchTarget = Math.min(pitchTarget, lerp(P.MAX_PITCH, -0.1, ceilUrgency));

  // 邊界柔性轉回：超出 SOFT 後把 bank 漸進覆寫成「轉向圓心」
  const r = Math.hypot(s.pos.x, s.pos.z);
  if (r > P.BOUNDARY_SOFT) {
    const w = clamp((r - P.BOUNDARY_SOFT) / (P.BOUNDARY_R - P.BOUNDARY_SOFT), 0, 1);
    const headingToCenter = Math.atan2(-s.pos.x, s.pos.z);
    const turnDir = Math.sign(angDiff(s.heading, headingToCenter) || 1);
    bankTarget = lerp(bankTarget, turnDir * P.MAX_BANK, w);
  }

  s.bank = approach(s.bank, bankTarget, P.BANK_RATE, dt);
  s.pitch = approach(s.pitch, pitchTarget, P.PITCH_RATE, dt);

  // 4. 自動協調轉彎
  const headingRate = Math.tan(s.bank) * P.TURN_G / Math.max(s.speed, 30);
  s.heading = wrapAngle(s.heading + headingRate * dt);

  // 方向舵（複雜版）：直接 yaw，疊在協調轉彎上（接 V3 側風 crab）。rudder=0 → 不影響。
  const rudder = clamp(input.rudder ?? 0, -1, 1);
  if (rudder) s.heading = wrapAngle(s.heading + rudder * P.RUDDER_YAW * dt);

  // 5. 位移
  const prevY = s.pos.y;
  moveForward(s, dt);

  // 6. 接地判定 —— 只在「下降中」檢查（剛離地爬升時貼地不算觸地）
  const groundY = env.groundY(s.pos.x, s.pos.z);
  if (s.pos.y <= groundY + 1.5 && s.pos.y <= prevY) {
    const sinkRate = (prevY - s.pos.y) / dt;
    s.lastSink = sinkRate; // 迫降品質判定用
    const gentle = sinkRate < P.LAND_MAX_SINK && Math.abs(s.bank) < P.LAND_MAX_BANK;
    const onRunway = env.canLandHere(s.pos.x, s.pos.z);
    if (gentle && onRunway && !s.gearDown) {
      // 輪子沒放 → 不准落地，柔彈 + 提醒
      s.justNoGear = true;
      s.pos.y = groundY + 1.5;
      s.pitch = Math.max(s.pitch, 0.18);
      s.justBounced = true;
    } else if (gentle && onRunway) {
      s.mode = 'rolling';
      s.pos.y = groundY;
      s.pitch = 0;
      s.bank = 0;
      s.justLanded = true;
    } else if (input.landAnywhere && !onRunway) {
      // 真實模式：機場外觸地 → 迫降。地形/品質（成功/受損/墜毀）由上層判定。
      s.mode = 'rolling';
      s.pos.y = groundY;
      s.pitch = 0;
      s.bank = 0;
      s.justForcedTouch = true;
    } else {
      // 柔彈：不墜毀、不懲罰，往上托
      s.pos.y = groundY + 1.5;
      s.pitch = Math.max(s.pitch, 0.18);
      s.speed = Math.max(s.speed * 0.85, P.V_MIN);
      s.justBounced = true;
    }
  }
}

/** @param {PlaneState} s @param {number} dt */
function moveForward(s, dt) {
  const horiz = s.speed * Math.cos(s.pitch);
  s.pos.x += Math.sin(s.heading) * horiz * dt;
  s.pos.z += -Math.cos(s.heading) * horiz * dt;
  s.pos.y += s.speed * Math.sin(s.pitch) * dt;
}
