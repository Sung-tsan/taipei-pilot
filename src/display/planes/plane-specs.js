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
 * @typedef {{
 *   id: string,
 *   name: string,                 // HUD 顯示（含 emoji）
 *   tone: 'cartoon'|'combat'|'airliner',  // tone ladder：程序/音效擬真度（視覺恆為玩具）
 *   flight: Partial<typeof P>,    // 飛行手感覆寫（空＝沿用 P＝T-34C 位元不變）
 *   dims: { wingspan:number, minRunwayLength:number }, // 短場挑戰 + 迫降共用一份
 *   fuelSec: number,              // 續航秒數（V5 啟用油量機制；本輪僅參數化佔位）
 *   model: PlaneModel,            // voxel 模型（無 prop＝噴射機）
 *   unlock: { flightMin:number, landings:number },     // v1.2 解鎖門檻（本輪可選、不擋）
 * }} PlaneSpec
 */

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
};

/** 預設起手機種（v1.2 機庫前唯一不需解鎖的機） */
export const DEFAULT_PLANE = 't34c';

/** 機種清單（給選單/測試列舉，順序＝ tone ladder） */
export const PLANE_IDS = /** @type {const} */ (['t34c', 'f16']);

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
