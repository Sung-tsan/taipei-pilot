// @ts-check
// 機型諸元登記表 —— 純資料 + 純查詢，vitest 直測。
// 這是「你解鎖的飛機，決定模擬的深度」的資料地基（ROADMAP §2 成長弧 / §5B 機隊 pillar）：
// 飛行手感、外型、油量、迫降諸元，一機一份；引擎層用同一條路跑（B1 參數化的機型版，
// 之後 ATR-72/B737/A330 照填、引擎零改動）。
//
// 鐵律（接手品質基準）：T-34C 的 flight 覆寫＝空物件 → flightParams('t34c') 與 v1 的 P 表
// 數值完全一致（純加法 + 中立預設），保證 v1 教練機手感位元不變。F-16 才填差異參數。
import { P } from '../flight/flight-model.js';
import { t34cBody, t34cProp, t34cPropPos, t34cGear } from '../../voxel/models/t34c.js';
import { f16Body, f16Gear } from '../../voxel/models/f16.js';

/**
 * @typedef {import('../../voxel/build.js').VoxelModel} VoxelModel
 * @typedef {{ body:VoxelModel, gear:VoxelModel, prop?:VoxelModel, propPos?:{x:number,y:number,z:number} }} PlaneModel
 * @typedef {{ glb:string, lengthM:number, yaw?:number }} GlbModel
 *   V4 民航機：CC0/CC-BY low-poly GLB（runtime 過 assets/glb-model.js normalize 管線，§11 共存）。
 *   glb＝public 路徑；lengthM＝最長水平邊縮到幾公尺；yaw＝機鼻朝向修正(rad，待 HITL 校正)。
 * @typedef {{
 *   id: string,
 *   name: string,                 // HUD 顯示（含 emoji）
 *   tone: 'cartoon'|'combat'|'airliner',  // tone ladder：程序/音效擬真度（視覺恆為玩具）
 *   flight: Partial<typeof P>,    // 飛行手感覆寫（空＝沿用 P＝T-34C 位元不變）
 *   dims: { wingspan:number, minRunwayLength:number }, // 短場挑戰 + 迫降共用一份
 *   fuelSec: number,              // 續航秒數（V5 啟用油量機制；本輪僅參數化佔位）
 *   model: PlaneModel | GlbModel, // 手刻 voxel（T-34C/F-16）或 GLB（V4 民航機，§11）
 *   unlock: { flightMin:number, landings:number },     // v1.2 解鎖門檻（本輪可選、不擋）
 * }} PlaneSpec
 */

/** @param {PlaneModel|GlbModel} m @returns {m is GlbModel} 是否為 GLB 模型（V4 民航機） */
export function isGlbModel(m) {
  return !!m && typeof (/** @type {any} */ (m).glb) === 'string';
}

/** @type {Record<string, PlaneSpec>} */
export const PLANE_SPECS = {
  // T-34C 初級教練機 —— 基準機。flight 覆寫刻意留空＝與 P 表逐位元一致。
  t34c: {
    id: 't34c',
    name: '🛩 T-34C',
    tone: 'cartoon',
    flight: {},
    dims: { wingspan: 10, minRunwayLength: 250 }, // 與 forced-landing.js T34C_DIMS 同值
    fuelSec: 900,
    model: { body: t34cBody, prop: t34cProp, propPos: t34cPropPos, gear: t34cGear },
    unlock: { flightMin: 0, landings: 0 }, // 起手機種，無門檻
  },
  // F-16 戰鬥機 —— tone ladder 擬真端：更快、更靈活、更耗油（fuel V5 啟用）。
  f16: {
    id: 'f16',
    name: '🚀 F-16',
    tone: 'combat',
    flight: {
      V_MIN: 34, V_GLIDE: 30, V_ROTATE: 44,
      V_MAX: 95, V_MAX_GEAR: 70,
      GROUND_TOP: 58, GROUND_ACCEL: 14, ACCEL: 16,
      // 空戰靈活度（HITL：要閃得過敵彈）：滾得更快、傾角更大、轉得更緊。
      MAX_BANK: 1.2, BANK_RATE: 3.8, MAX_PITCH: 0.5, PITCH_RATE: 2.2, TURN_G: 15,
    },
    dims: { wingspan: 10, minRunwayLength: 450 }, // 噴射機要更長的迫降直段
    fuelSec: 480, // 耗油兇（航程更短）
    model: { body: f16Body, gear: f16Gear }, // 無 prop＝噴射機
    unlock: { flightMin: 15, landings: 5 }, // v1.2 解鎖：飛 15 分 + 成功降落 5 次
  },
  // ATR-72 民航支線客機 —— tone ladder 仿真端（V4 民航與地面作業）。重、轉彎慢、滑行/起飛距離長。
  // 機體＝CC0/CC-BY low-poly GLB（§11，runtime 過 normalize 管線）；目前用通用客機代用（見 public/models/CREDITS.md）。
  atr72: {
    id: 'atr72',
    name: '🛬 ATR-72',
    tone: 'airliner',
    flight: {
      // 重機：起飛速度高、極速中等、加減速慢；姿態收斂慢、傾角小（客機不甩尾）。
      V_MIN: 32, V_GLIDE: 30, V_ROTATE: 46,
      V_MAX: 82, V_MAX_GEAR: 62,
      GROUND_TOP: 46, GROUND_ACCEL: 9, GROUND_DRAG: 5, ACCEL: 7,
      MAX_BANK: 0.6, BANK_RATE: 1.3, MAX_PITCH: 0.3, PITCH_RATE: 0.8, TURN_G: 9,
    },
    dims: { wingspan: 27, minRunwayLength: 1200 }, // 真實翼展 ~27m、需長跑道（迫降諸元）
    fuelSec: 1500, // 民航航程長
    model: { glb: '/models/airliner.glb', lengthM: 27, yaw: 0 }, // yaw 待 HITL 校正機鼻朝向
    unlock: { flightMin: 30, landings: 10 }, // v1.2 解鎖：民航機進階門檻
  },
};

/** 預設起手機種（v1.2 機庫前唯一不需解鎖的機） */
export const DEFAULT_PLANE = 't34c';

/** 機種清單（給選單/測試列舉，順序＝ tone ladder） */
export const PLANE_IDS = /** @type {const} */ (['t34c', 'f16', 'atr72']);

/** @param {string} id @returns {PlaneSpec} 未知 id → 退回預設機（不爆） */
export function planeSpec(id) {
  return PLANE_SPECS[id] ?? PLANE_SPECS[DEFAULT_PLANE];
}

/**
 * 該機種的完整飛行手感參數＝P 基準表疊上機種覆寫。
 * T-34C（覆寫空）→ 與 P 數值逐位元一致；F-16 → 噴射手感。
 * @param {string} id @returns {typeof P}
 */
export function flightParams(id) {
  return { ...P, ...planeSpec(id).flight };
}
