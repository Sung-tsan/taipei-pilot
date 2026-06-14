// @ts-check
// V2 空戰 —— 武器系統核心（純邏輯）。
// 與 Three.js / DOM 完全解耦，vitest 直測。零副作用、可注入依賴。
// 座標：1 unit = 1m。X=東、Z=南、Y=高。heading 0 = 北（-Z）、順時針增加。
// 方位角 bearing = Math.atan2(dx, -dz)（dx=target.x-self.x, dz=target.z-self.z），與 main.js / flight-model 一致。
// 安全網鐵律：未知/空輸入要 fallback、永不 throw 中斷。6 歲友善＝街機手感（飛近自動鎖定）。
//
// ⚠️ 本檔不 import 任何既有檔（硬性限制：不耦合 flight-model / consequence）。
//    需要的小工具（clamp / 角度）在本檔自帶迷你版。

// ─────────────────────────────────────────────────────────────
// 迷你工具（自帶，避免耦合其他模組）
// ─────────────────────────────────────────────────────────────

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 把角度收進 (-π, π] @param {number} a */
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** 最短帶號角差 to - from @param {number} from @param {number} to */
const angDiff = (from, to) => wrapAngle(to - from);

/** 數字防呆：非有限數 → 退回 fallback @param {*} v @param {number} fb */
const safeNum = (v, fb = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);

/** 取座標物件（缺值補 0），防 undefined.x 爆掉 @param {*} p @returns {{x:number,y:number,z:number}} */
function safeVec(p) {
  if (!p || typeof p !== 'object') return { x: 0, y: 0, z: 0 };
  return { x: safeNum(p.x), y: safeNum(p.y), z: safeNum(p.z) };
}

/**
 * self → target 的方位角（弧度，與 heading 同制：0=北、順時針增）。
 * bearing = atan2(dx, -dz)。
 * @param {{x:number,z:number}} from @param {{x:number,z:number}} to
 */
function bearingTo(from, to) {
  return Math.atan2(to.x - from.x, -(to.z - from.z));
}

// ─────────────────────────────────────────────────────────────
// 1. 武器諸元表
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {'air'|'ground'} WeaponKind
 * @typedef {'cartoon'|'boom'} WeaponSound
 * @typedef {{
 *   id: string,
 *   label: string,
 *   kind: WeaponKind,
 *   rangeM: number,        // 有效射程（m）
 *   speedMps: number,      // 彈速（m/s）
 *   homingRate: number,    // 追蹤轉向上限（rad/s）；0 = 直線不追
 *   lifetimeSec: number,   // 彈丸壽命（s）
 *   cooldownSec: number,   // 發射冷卻（s）
 *   magazine: number,      // 彈匣量（發）
 *   hitRadiusM: number,    // 命中判定半徑（m）
 *   sound: WeaponSound,    // 音效：cartoon=可愛、boom=擬真爆炸
 * }} WeaponSpec
 */

/**
 * 三種武器諸元（鍵：cartoon / aa / ag）。
 * 數值取向：arcade、6 歲友善 —— 射程大方、彈速快（飛行少等待）、命中半徑寬鬆（容易打中）。
 * 距離單位 m；場景為 10km 半徑空域（見 flight-model BOUNDARY_R），所以中射程 ≈ 1.2km。
 * @type {{ cartoon: WeaponSpec, aa: WeaponSpec, ag: WeaponSpec }}
 */
export const WEAPON_SPECS = {
  // 卡通飛彈：對空主力。短射程、追得緊、彈匣多（孩子可狂射）、可愛音。
  cartoon: {
    id: 'cartoon',
    label: '卡通飛彈',
    kind: 'air',
    rangeM: 700,        // 短射程 —— 鼓勵飛近敵機（近距離才鎖得到）
    speedMps: 220,      // 比飛機快（V_MAX=65）→ 追得上、不會被甩開
    homingRate: 2.6,    // rad/s，轉得很積極（≈149°/s）→ 6 歲射出去幾乎都會中
    lifetimeSec: 4,
    cooldownSec: 0.5,   // 連射快感
    magazine: 8,        // 彈匣大方
    hitRadiusM: 22,     // 寬鬆命中圈
    sound: 'cartoon',
  },
  // 空對空飛彈：中射程、追蹤、擬真爆炸音。彈匣較少 → 鼓勵瞄準後再射。
  aa: {
    id: 'aa',
    label: '空對空飛彈',
    kind: 'air',
    rangeM: 1200,       // 中射程
    speedMps: 320,      // 高速
    homingRate: 1.8,    // 追蹤但比卡通彈穩重（≈103°/s）
    lifetimeSec: 6,
    cooldownSec: 1.2,
    magazine: 4,
    hitRadiusM: 18,
    sound: 'boom',
  },
  // 空對地飛彈：中短射程、不追蹤（直射）、擬真爆炸音。對地攻擊（受紅線豁免約束）。
  ag: {
    id: 'ag',
    label: '空對地飛彈',
    kind: 'ground',
    rangeM: 900,        // 中短射程
    speedMps: 260,
    homingRate: 0,      // ⚠️ 不追蹤 —— 直射，靠機頭對準地面目標
    lifetimeSec: 5,
    cooldownSec: 1.0,
    magazine: 6,
    hitRadiusM: 30,     // 對地爆炸範圍較大
    sound: 'boom',
  },
};

/** 機頭前方錐角半角（對空鎖定用）：±50°＝寬鬆，飛近就鎖到，6 歲不用精準瞄。 */
export const LOCK_CONE_HALF_RAD = (50 * Math.PI) / 180;

// ─────────────────────────────────────────────────────────────
// 2. 對空鎖定
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {{ pos:{x:number,y:number,z:number}, heading:number }} Shooter
 * @typedef {{ id:*, pos:{x:number,y:number,z:number} }} Target
 */

/**
 * 對空鎖定：在射程內、且在機頭前方錐角內，選「最近」目標的 id。
 * 6 歲友善：飛近自動鎖定，不需精準瞄準。
 * @param {Shooter} shooter
 * @param {Target[]} targets
 * @param {WeaponSpec} spec  air 武器
 * @returns {*} 命中目標的 id；無則 null
 */
export function acquireAirLock(shooter, targets, spec) {
  // 安全網：缺輸入直接放棄鎖定（不爆）
  if (!shooter || !Array.isArray(targets) || targets.length === 0 || !spec) return null;
  const self = safeVec(shooter.pos);
  const heading = safeNum(shooter.heading);
  const range = safeNum(spec.rangeM, 0);
  const coneHalf = LOCK_CONE_HALF_RAD;

  let bestId = null;
  let bestDist = Infinity;

  for (const t of targets) {
    if (!t) continue;
    const tp = safeVec(t.pos);
    const dx = tp.x - self.x;
    const dz = tp.z - self.z;
    const dy = tp.y - self.y;
    const dist = Math.hypot(dx, dy, dz); // 3D 距離（含高度差）
    if (dist > range || dist < 1e-6) continue; // 超距 / 自身重疊跳過

    // 是否在機頭前方錐角內
    const brg = bearingTo(self, tp);
    if (Math.abs(angDiff(heading, brg)) > coneHalf) continue;

    if (dist < bestDist) {
      bestDist = dist;
      bestId = t.id;
    }
  }
  return bestId;
}

// ─────────────────────────────────────────────────────────────
// 3. 對地瞄準 + 紅線豁免
// ─────────────────────────────────────────────────────────────

/**
 * 對地瞄準點：機頭前方 distanceM 處的地面點（用 heading 水平投影；忽略高度）。
 * @param {Shooter} shooter
 * @param {number} distanceM
 * @returns {{x:number, z:number}}
 */
export function groundAimPoint(shooter, distanceM) {
  const self = shooter ? safeVec(shooter.pos) : { x: 0, y: 0, z: 0 };
  const heading = shooter ? safeNum(shooter.heading) : 0;
  const d = safeNum(distanceM, 0);
  // 機頭水平方向：x=sin(h)、z=-cos(h)（與 flight-model moveForward 一致）
  return {
    x: self.x + Math.sin(heading) * d,
    z: self.z - Math.cos(heading) * d,
  };
}

/**
 * @typedef {{ x:number, z:number, r:number }} Zone
 */

/**
 * 紅線豁免判定：空對地是否「可以打」這個地面點。
 * 規則：只有當 point 落在某個 redZone 半徑內、且不在任何 landmark 半徑內 → true。
 * （红線：空對地禁止對教育地標生效 —— 即使在紅區內，壓在地標上也無效。）
 * @param {{x:number,z:number}} point
 * @param {{ redZones?:Zone[], landmarks?:Zone[] }} cfg
 * @returns {boolean}
 */
export function canHitGround(point, { redZones = [], landmarks = [] } = {}) {
  if (!point) return false;
  const px = safeNum(point.x);
  const pz = safeNum(point.z);
  const zones = Array.isArray(redZones) ? redZones : [];
  const marks = Array.isArray(landmarks) ? landmarks : [];

  // 必須先落在某個紅區內
  const inRed = zones.some((z) => inZone(px, pz, z));
  if (!inRed) return false;

  // 红線豁免：壓在任一地標上 → 無效（保護教育地標）
  const onLandmark = marks.some((z) => inZone(px, pz, z));
  return !onLandmark;
}

/**
 * 點是否落在圓區內（含邊界）。
 * @param {number} px
 * @param {number} pz
 * @param {*} z
 */
function inZone(px, pz, z) {
  if (!z) return false;
  const zx = safeNum(z.x);
  const zz = safeNum(z.z);
  const r = safeNum(z.r, 0);
  if (r <= 0) return false;
  return Math.hypot(px - zx, pz - zz) <= r;
}

// ─────────────────────────────────────────────────────────────
// 4. 彈丸 Projectile
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   pos:{x:number,y:number,z:number},
 *   vel:{x:number,y:number,z:number},
 *   heading:number,
 *   spec:WeaponSpec,
 *   targetId:*,
 *   age:number,
 * }} Projectile
 * @typedef {{
 *   targetPosOf:(id:*)=>({x:number,y:number,z:number}|null),
 *   groundY:(x:number,z:number)=>number,
 * }} ProjEnv
 */

/**
 * 由 heading × speedMps 算初速，生出一枚彈丸（age=0）。
 * @param {Shooter} shooter
 * @param {WeaponSpec} spec
 * @param {*} [targetId]  對空＝鎖定 id；對地＝可省略（直射）
 * @returns {Projectile}
 */
export function spawnProjectile(shooter, spec, targetId = null) {
  const self = shooter ? safeVec(shooter.pos) : { x: 0, y: 0, z: 0 };
  const heading = shooter ? safeNum(shooter.heading) : 0;
  const speed = safeNum(spec && spec.speedMps, 0);
  // 速度向量：水平沿 heading（x=sin、z=-cos），初始無垂直分量（水平射出）
  const vel = {
    x: Math.sin(heading) * speed,
    y: 0,
    z: -Math.cos(heading) * speed,
  };
  return {
    pos: { x: self.x, y: self.y, z: self.z },
    vel,
    heading,
    spec,
    targetId,
    age: 0,
  };
}

/**
 * 原地推進一枚彈丸一步。
 * - 對空（homing>0）：把速度方向朝鎖定目標轉，轉速上限 homingRate；距目標 < hitRadiusM → 命中。
 * - 對地（homing=0）：直線飛；到達地面或飛超過 rangeM → 結束。
 * - 超過 lifetimeSec 或飛行距離超過 rangeM → 'expired'。
 * @param {Projectile} proj
 * @param {number} dt
 * @param {ProjEnv} env
 * @returns {{ result:'flying'|'hit'|'expired', targetId?:* }}
 */
export function stepProjectile(proj, dt, env) {
  // 安全網：壞輸入直接判過期（不爆、不卡）
  if (!proj || !proj.spec) return { result: 'expired' };
  const spec = proj.spec;
  const step = safeNum(dt, 0);
  const speed = safeNum(spec.speedMps, 0);
  const homing = safeNum(spec.homingRate, 0);
  const hitR = safeNum(spec.hitRadiusM, 0);
  const range = safeNum(spec.rangeM, 0);
  const life = safeNum(spec.lifetimeSec, 0);
  const targetPosOf = (env && typeof env.targetPosOf === 'function') ? env.targetPosOf : () => null;
  const groundY = (env && typeof env.groundY === 'function') ? env.groundY : () => 0;

  proj.age = safeNum(proj.age) + step;

  // 追蹤（對空）：把水平速度方向朝目標轉，轉速上限 homingRate。
  if (homing > 0 && proj.targetId != null) {
    const tp = targetPosOf(proj.targetId);
    if (tp) {
      const target = safeVec(tp);
      // 用 heading（水平方位）做轉向，再以高度差補垂直分量 → 立體追蹤但轉速受限。
      const desired = bearingTo(proj.pos, target);
      const turn = clamp(angDiff(proj.heading, desired), -homing * step, homing * step);
      proj.heading = wrapAngle(proj.heading + turn);

      // 垂直追蹤：朝目標高度收斂（同樣受 homing 比例限制，避免瞬移到頂）
      const dy = target.y - proj.pos.y;
      const horizDist = Math.hypot(target.x - proj.pos.x, target.z - proj.pos.z) || 1e-6;
      // 期望爬升角（限制在 ±60° 內，arcade）
      const desiredPitch = clamp(Math.atan2(dy, horizDist), -Math.PI / 3, Math.PI / 3);
      const horiz = Math.cos(desiredPitch) * speed;
      proj.vel = {
        x: Math.sin(proj.heading) * horiz,
        y: Math.sin(desiredPitch) * speed,
        z: -Math.cos(proj.heading) * horiz,
      };
    }
  }

  // 推進
  proj.pos.x += proj.vel.x * step;
  proj.pos.y += proj.vel.y * step;
  proj.pos.z += proj.vel.z * step;

  // 命中判定（對空）：距鎖定目標 < hitRadiusM
  if (proj.targetId != null) {
    const tp = targetPosOf(proj.targetId);
    if (tp) {
      const target = safeVec(tp);
      const dist = Math.hypot(target.x - proj.pos.x, target.y - proj.pos.y, target.z - proj.pos.z);
      if (dist <= hitR) return { result: 'hit', targetId: proj.targetId };
    }
  }

  // 對地（或追丟）：到地面 → 命中地面（result:'hit'，targetId 維持原值/null 交上層判 redzone）
  const gy = safeNum(groundY(proj.pos.x, proj.pos.z), 0);
  if (proj.pos.y <= gy + hitR * 0.5) {
    // 直射彈（ag）落地 = 命中地面點；對空彈落地 = 視為命中地面（上層通常不在意）
    if (homing === 0) return { result: 'hit', targetId: proj.targetId };
    // 追蹤彈撞地（追丟）→ 過期，避免假命中
    return { result: 'expired' };
  }

  // 過期：壽命到 / 飛超過射程
  if (life > 0 && proj.age >= life) return { result: 'expired' };
  if (range > 0) {
    const flown = safeNum(proj.age) * speed; // 近似飛行距離（速度恆定）
    if (flown >= range) return { result: 'expired' };
  }

  return { result: 'flying' };
}

// ─────────────────────────────────────────────────────────────
// 5. 彈藥 / 冷卻 / 補彈
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {{ ammo:number, max:number, readyAt:number, cooldownMs:number }} Magazine
 *   readyAt＝可再次發射的時間戳（ms）。now < readyAt → 冷卻中。
 *   cooldownMs＝由 spec.cooldownSec 換算存進來，讓 fire(mag, now) 維持 2 參數簽名。
 */

/**
 * 開一個滿彈匣（把 spec 的冷卻時間記進來，之後 fire 只需 (mag, now)）。
 * @param {WeaponSpec} spec
 * @returns {Magazine}
 */
export function makeMagazine(spec) {
  const max = Math.max(0, Math.floor(safeNum(spec && spec.magazine, 0)));
  const cooldownMs = safeNum(spec && spec.cooldownSec, 0) * 1000;
  return { ammo: max, max, readyAt: 0, cooldownMs };
}

/**
 * 是否可發射：彈量 > 0 且 now >= readyAt（冷卻已過）。
 * @param {Magazine} mag @param {number} now  時間戳（ms）
 * @returns {boolean}
 */
export function canFire(mag, now) {
  if (!mag) return false;
  return safeNum(mag.ammo) > 0 && safeNum(now) >= safeNum(mag.readyAt);
}

/**
 * 發射：彈量 −1、設冷卻 readyAt = now + cooldownMs（cooldownMs 已在 makeMagazine 記入）。
 * 原地改 mag、回傳 mag。若不可發射（無彈/冷卻中）→ 原樣回傳，不扣彈（安全網）。
 * @param {Magazine} mag @param {number} now  時間戳（ms）
 * @returns {Magazine}
 */
export function fire(mag, now) {
  if (!mag || !canFire(mag, now)) return mag;
  mag.ammo = safeNum(mag.ammo) - 1;
  mag.readyAt = safeNum(now) + safeNum(mag.cooldownMs, 0);
  return mag;
}

/**
 * 補滿彈匣（回機場用）：ammo 回 max、清冷卻。cooldownMs 保留。原地改 mag、回傳 mag。
 * @param {Magazine} mag
 * @returns {Magazine}
 */
export function reload(mag) {
  if (!mag) return mag;
  mag.ammo = safeNum(mag.max, 0);
  mag.readyAt = 0;
  return mag;
}
