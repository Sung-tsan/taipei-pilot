// @ts-check
// V2 空戰敵機 AI 核心 —— 純邏輯模組，零副作用。
//
// 設計北極星：6 歲贏得了又有挑戰。所以本模組「只產生 Input」，由呼叫端餵給
// flight-model 的 stepPlane。難度紀律照搬玩具櫃既有做法：
//   1) 難度曲線（依局數）：前幾局放鬆、漸升、有上限。
//   2) adaptive 控制器（依近期勝率）：玩家輸太多 → 提高 handicap（AI 放水），
//      贏太多 → 降低，把難度回拉到目標勝率附近（預設偏放水）。
//   3) heuristic 不可拔地板：任何 NaN/缺值/異常 → 退保守追擊 Input，絕不 throw。
//
// 座標系（與 flight-model 一致）：1 unit = 1m；X=東、Z=南、Y=高。
// heading 0 = 北（-Z）、順時針增加。方位角：
//   bearing = Math.atan2(dx, -dz)，dx = target.x - self.x，dz = target.z - self.z。
// 轉向號誌：angDiff(self.heading, bearing) > 0 → 需順時針轉 → 右滾 r>0；反之 r<0。
//
// 重要：本模組不 import three、不 import 也不呼叫 stepPlane、不 import weapons.js。
import { clamp, wrapAngle, angDiff } from '../../lib/math.js';

/**
 * @typedef {import('../flight/flight-model.js').PlaneState} PlaneState
 * @typedef {import('../flight/flight-model.js').Input} Input
 */

/** AI 手感調參總表 —— 改 AI 行為只動這張表。 */
export const AI = {
  // —— 追擊 ——
  CHASE_TH_BASE: 0.55,   // 追擊基礎油門（difficulty=0、handicap=0 時）
  CHASE_TH_GAIN: 0.4,    // difficulty 對追擊油門的加成（滿難度多踩 0.4）
  ROLL_GAIN_BASE: 1.4,   // 方位誤差 → roll 的比例增益基礎值（rad 誤差 ×增益 → r）
  ROLL_GAIN_DIFF: 1.6,   // difficulty 對 roll 增益的加成（高難度轉更兇）
  // —— 俯仰追高（把機頭帶向目標的相對高度差）——
  PITCH_GAIN: 0.012,     // 高度差(m) → pitch 的比例增益（正=目標較高→拉桿爬升）
  PITCH_DIFF: 0.4,       // difficulty 對 pitch 權威的加成
  // —— 閃避（目標咬在自己尾後近距）——
  EVADE_DIST: 600,       // m 閃避觸發距離（目標在後方且近於此）
  EVADE_REAR_DOT: -0.3,  // 目標相對我機頭的「在後方」門檻（cos(夾角) < 此值＝偏後）
  EVADE_TH: 0.95,        // 閃避時油門（甩尾要能量）
  EVADE_PITCH: 0.5,      // 閃避時拉桿量（破壞性爬升轉彎）
  // —— 低空拉起（地板，純加法不可被蓋掉）——
  FLOOR_AGL: 80,         // m 低於此高度開始混入拉桿
  FLOOR_PITCH: 0.8,      // 低空拉桿最大量
  // —— handicap 鈍化 ——
  HANDICAP_TH_CUT: 0.45, // 滿 handicap 收掉的油門比例
  HANDICAP_ROLL_CUT: 0.6,// 滿 handicap 鈍化的 roll 比例（轉更慢）
  HANDICAP_WOBBLE: 0.25, // 滿 handicap 注入的方位偏移幅度（rad，故意瞄不準）
  // —— 難度曲線 ——
  CURVE_START: 0.2,      // 第 0 局難度
  CURVE_CAP: 0.85,       // 難度上限（永遠留一線生機給小孩）
  CURVE_RAMP: 9,         // 爬到接近上限所需的局數尺度（越大爬越慢）
  // —— adaptive ——
  HANDICAP_DEFAULT: 0.45,// 空資料友善預設（偏放水）
  HANDICAP_GAIN: 1.6,    // 勝率偏差 → handicap 調整增益
  // —— 開火 ——
  FIRE_RANGE_DEFAULT: 800, // m 預設射程（spec 沒給 rangeM 時）
  FIRE_CONE_DEFAULT: 0.26, // rad 預設錐半角（≈15°）：機頭大致對準才開火
};

/**
 * 安全取數：非有限數（含 undefined / NaN）→ 回退預設值。
 * @param {number|undefined} v @param {number} fallback
 * @returns {number}
 */
function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * 從 self/target 推算交戰幾何（全部做 NaN 防護）。
 * @param {PlaneState} self @param {PlaneState} target
 * @returns {{ ok:boolean, dx:number, dz:number, dy:number, dist:number,
 *            bearing:number, headErr:number, alignDot:number, agl:number }}
 *   ok=false 代表輸入殘缺，呼叫端應走 heuristic 地板。
 *   headErr＝angDiff(self.heading, bearing)：>0 需右轉、<0 需左轉。
 *   alignDot＝目標方向與「我機頭朝向」的 cos 夾角：1=正前、-1=正後。
 *   agl＝自機離地高度（純模組無地形，以 self.pos.y 為平地近似）。
 */
function geometry(self, target) {
  const sp = self?.pos, tp = target?.pos;
  if (!sp || !tp) {
    return { ok: false, dx: 0, dz: 0, dy: 0, dist: 0, bearing: 0, headErr: 0, alignDot: 0, agl: 0 };
  }
  const sx = num(sp.x, NaN), sy = num(sp.y, NaN), sz = num(sp.z, NaN);
  const tx = num(tp.x, NaN), ty = num(tp.y, NaN), tz = num(tp.z, NaN);
  const heading = num(self?.heading, NaN);
  if ([sx, sy, sz, tx, ty, tz, heading].some((v) => !Number.isFinite(v))) {
    return { ok: false, dx: 0, dz: 0, dy: 0, dist: 0, bearing: 0, headErr: 0, alignDot: 0, agl: 0 };
  }
  const dx = tx - sx, dz = tz - sz, dy = ty - sy;
  const dist = Math.hypot(dx, dz);
  const bearing = Math.atan2(dx, -dz);
  const headErr = angDiff(heading, bearing);
  // alignDot：目標相對我機頭的前後關係。我機頭單位向量 = (sin h, -cos h)。
  // 目標水平方向單位向量 = (dx, dz)/dist。cos 夾角 = headErr 的餘弦。
  const alignDot = dist > 1e-6 ? Math.cos(headErr) : 1;
  return { ok: true, dx, dz, dy, dist, bearing, headErr, alignDot, agl: sy };
}

/**
 * 保守追擊地板 Input —— heuristic 不可拔的最後防線。
 * 盡力朝目標方位轉、給中等油門；幾何也壞掉就直飛平飛（絕不 throw / 絕不 NaN）。
 * @param {PlaneState} self @param {PlaneState} target
 * @returns {Input}
 */
function heuristicFloor(self, target) {
  const g = geometry(self, target);
  if (!g.ok) {
    return { r: 0, p: 0, th: 0.5, gearUp: true };
  }
  const r = clamp(g.headErr * AI.ROLL_GAIN_BASE, -1, 1);
  const p = clamp(g.dy * AI.PITCH_GAIN, -0.5, 0.5);
  return { r, p, th: AI.CHASE_TH_BASE, gearUp: true };
}

/**
 * 主決策：依交戰幾何 + 難度 + handicap 產生一個 Input。
 *
 * 行為總覽：
 *  - 追擊：目標在前方/遠 → 轉向目標方位（roll）、油門上、pitch 追高度差。
 *  - 閃避：目標咬在自己尾後近距 → 反向破壞性轉彎（roll 打滿反向 + 拉桿 + 加力）。
 *  - 低空拉起：agl 低 → p 帶正拉桿（地板，純加法 Math.max，不被前面蓋掉）。
 *  - difficulty 高 → 轉更積極、油門更滿、pitch 更準。
 *  - handicap 高 → 鈍化：轉慢、油門收、注入方位偏移（故意瞄不準）。
 *  - heuristic 地板：任何 NaN/缺值/異常 → 回保守追擊 Input，不 throw。
 *
 * @param {PlaneState} self
 * @param {PlaneState} target
 * @param {{ difficulty?:number, handicap?:number }} [opts]
 * @returns {Input}
 */
export function decideInput(self, target, opts = {}) {
  // —— 地板：輸入殘缺 → 保守追擊 ——
  const g = geometry(self, target);
  if (!g.ok) return heuristicFloor(self, target);

  const difficulty = clamp(num(opts?.difficulty, 0.5), 0, 1);
  const handicap = clamp(num(opts?.handicap, 0), 0, 1);

  // 判斷是否該閃避：目標在我尾後（alignDot 偏負）且近距。
  const beingChased = g.alignDot < AI.EVADE_REAR_DOT && g.dist < AI.EVADE_DIST;

  let r, p, th;

  if (beingChased) {
    // —— 閃避：朝「離開目標」的方向打滿破壞性轉彎 ——
    // 目標在後方，headErr 接近 ±π。往 headErr 的反向滾轉 = 把機頭甩離追擊者的反方向，
    // 等同盡快脫離咬尾線。用 -sign(headErr) 確保是「破壞性」打滿。
    const dir = -Math.sign(g.headErr || 1);
    r = dir; // 打滿
    p = AI.EVADE_PITCH; // 拉桿（爬升轉彎甩尾）
    th = AI.EVADE_TH;
  } else {
    // —— 追擊：比例導引 ——
    const rollGain = AI.ROLL_GAIN_BASE + difficulty * AI.ROLL_GAIN_DIFF;
    r = clamp(g.headErr * rollGain, -1, 1);
    // pitch 追高度差（正=目標較高→拉桿爬升）；難度越高權威越大。
    const pitchGain = AI.PITCH_GAIN * (1 + difficulty * AI.PITCH_DIFF);
    p = clamp(g.dy * pitchGain, -0.6, 0.6);
    // 油門：基礎 + 難度加成；目標越偏離機頭略收一點油讓轉向先到位。
    th = AI.CHASE_TH_BASE + difficulty * AI.CHASE_TH_GAIN;
  }

  // —— handicap 鈍化（AI 放水）——
  if (handicap > 0) {
    // 方位偏移：故意瞄不準（用 self 狀態當偽隨機相位，純函式可重現、無真亂數）。
    const phase = (num(self.pos.x, 0) + num(self.pos.z, 0)) * 0.01;
    const wobble = Math.sin(phase) * AI.HANDICAP_WOBBLE * handicap;
    r = clamp(r + wobble, -1, 1);
    // 轉慢：roll 直接打折。
    r *= (1 - handicap * AI.HANDICAP_ROLL_CUT);
    // 油門收。
    th *= (1 - handicap * AI.HANDICAP_TH_CUT);
  }

  // —— 低空拉起地板（純加法 Math.max，永遠不被前面蓋掉，handicap 也不能拔）——
  if (g.agl < AI.FLOOR_AGL) {
    const urgency = clamp((AI.FLOOR_AGL - g.agl) / AI.FLOOR_AGL, 0, 1);
    p = Math.max(p, urgency * AI.FLOOR_PITCH);
  }

  // 最終夾箝（雙保險：絕不回 NaN / 出界）。
  return {
    r: clamp(num(r, 0), -1, 1),
    p: clamp(num(p, 0), -1, 1),
    th: clamp(num(th, 0.5), 0, 1),
    gearUp: true, // 空戰一律收輪（飛更快）
  };
}

/**
 * 難度曲線：依局數回一個 0..1 難度。
 * 前幾局低（給小孩暖身），隨局數漸升、收斂到上限 CURVE_CAP（永遠留生機）。
 * 用指數趨近：level = CAP - (CAP - START) * exp(-roundIndex / RAMP)。
 * 單調不遞減、永遠落在 [CURVE_START, CURVE_CAP]，roundIndex 異常也不爆界。
 * @param {number} roundIndex 第幾局（0 起算）
 * @returns {number} 0..1
 */
export function difficultyLevel(roundIndex) {
  const i = Math.max(0, num(roundIndex, 0));
  const { CURVE_START, CURVE_CAP, CURVE_RAMP } = AI;
  const level = CURVE_CAP - (CURVE_CAP - CURVE_START) * Math.exp(-i / CURVE_RAMP);
  return clamp(level, CURVE_START, CURVE_CAP);
}

/**
 * adaptive handicap：依玩家近期勝率，把難度回拉到目標勝率附近。
 *   玩家近期勝率 < target → 提高 handicap（AI 放水）；> target → 降低。
 * recent 介面（擇一，皆可混用）：
 *   - 布林陣列：[true, false, ...]（true = 玩家贏）
 *   - 物件陣列：[{win:true}, {win:false}, ...]
 * 空資料 / 殘缺 → 回友善預設 HANDICAP_DEFAULT（偏放水）。
 * @param {Array<boolean|{win?:boolean}>} recent 近期對局結果（越新放越後面無妨）
 * @param {number} [targetWinRate] 目標玩家勝率（預設 0.6，偏放水）
 * @returns {number} 0..1 的 handicap（高=AI 變弱）
 */
export function adaptiveHandicap(recent, targetWinRate = 0.6) {
  const target = clamp(num(targetWinRate, 0.6), 0, 1);
  if (!Array.isArray(recent) || recent.length === 0) {
    return AI.HANDICAP_DEFAULT;
  }
  let wins = 0, n = 0;
  for (const e of recent) {
    let win;
    if (typeof e === 'boolean') win = e;
    else if (e && typeof e === 'object') win = !!e.win;
    else continue; // 殘缺元素跳過
    if (win) wins += 1;
    n += 1;
  }
  if (n === 0) return AI.HANDICAP_DEFAULT;

  const winRate = wins / n;
  // 玩家贏太少（winRate < target）→ deficit>0 → handicap 升（放水）。
  const deficit = target - winRate;
  // 以友善預設為中心，依勝率偏差調整。
  const handicap = AI.HANDICAP_DEFAULT + deficit * AI.HANDICAP_GAIN;
  return clamp(handicap, 0, 1);
}

/**
 * 是否開火：目標在射程內 + 大致對準機頭（錐角內）才開火。
 * 最小 spec 介面（不 import weapons.js）：
 *   spec = { rangeM?:number, coneRad?:number }
 *     rangeM ＝最大射程（m，缺省 FIRE_RANGE_DEFAULT）。
 *     coneRad＝錐半角（rad，缺省 FIRE_CONE_DEFAULT）；目標方位誤差 |headErr| ≤ coneRad 才算對準。
 * 任何 NaN/缺值/異常 → 回 false（寧可不開火，安全側）。
 * @param {PlaneState} self @param {PlaneState} target
 * @param {{ rangeM?:number, coneRad?:number }} [spec]
 * @returns {boolean}
 */
export function shouldFire(self, target, spec = {}) {
  const g = geometry(self, target);
  if (!g.ok) return false;
  const rangeM = num(spec?.rangeM, AI.FIRE_RANGE_DEFAULT);
  const coneRad = num(spec?.coneRad, AI.FIRE_CONE_DEFAULT);
  // 用水平距 + 高度差合成三維距離，避免上下重疊就猛開火。
  const dist3d = Math.hypot(g.dist, g.dy);
  const inRange = dist3d <= rangeM;
  const aligned = Math.abs(wrapAngle(g.headErr)) <= Math.abs(coneRad);
  return inRange && aligned;
}
