// @ts-check
// ATC 仿真 phraseology（中文簡化、保真實感、無吉祥物）。V5.1-1：機場感知（站名走 airport，不再 hardcode 松山）
// + 真 ATC bank（從 atc-bank.js 挑 grounded 變體，缺/不合格 → 固定地板 FLOORS）。零雲端。
// 涵蓋 離場（後推/taxi/排序/起飛）+ 到場（脫離/taxi/gate/靠橋）；空中走廊用語在 air-corridor.js。
// ⚠️ DRAFT：地板用語 + bank 變體皆待 Sung 校稿（讀給孩子聽：真實感 + 6 歲懂）。atc.test 守 grounding 不變式。
import { ATC_BANK_DRAFT, pickVariant } from './atc-bank.js';

export const ATC_DRAFT = true;       // 地板用語待 Sung 校稿
export { ATC_BANK_DRAFT };           // bank 變體待 Sung 校審（re-export 便於檢查）
const CS = '小飛官';                  // callsign（孩子）
const DEFAULT_STATION = '松山';       // 站名缺省（back-compat；V5 由 main 傳 air.spec.name）

/**
 * 固定地板（三件套不可拔的一層）：每階段一句 deterministic phraseology，機場感知。
 * 必含「站名 + 該階段關鍵詞」——與 atc-bank STAGE_KEYWORDS 對齊，保證 grounding 不變式對地板也成立。
 * @type {Record<string, (c:{cs:string,station:string,rwy?:string,gate?:string,exit?:string})=>string>}
 */
const FLOORS = {
  boardComplete: (c) => `🛫 ${c.station}，${c.cs}，${c.gate ?? '登機門'} 登機完成，請求後推 — 按【確認】開始。`,
  pushback: (c) => `🚜 ${c.station}地面，${c.cs}，${c.gate ?? '登機門'} 後推許可，引導車作業中。`,
  taxiToHold: (c) => `🗼 ${c.station}地面，${c.cs}，沿綠燈滑行到 ${c.rwy ?? '跑道'} 等待點。`,
  holdShort: (c) => `🗼 ${c.cs}，${c.station}塔台，${c.rwy ?? '跑道'} 等待點稍候，前一架離場中。`,
  cleared: (c) => `🗼 ${c.cs}，${c.station}塔台，${c.rwy ?? '跑道'} 可以起飛！進跑道、對正、推滿油門。`,
  exit: (c) => `🗼 ${c.station}塔台，${c.cs}，${c.exit ?? '脫離道'} 脫離跑道，前往 ${c.gate ?? '登機門'} 靠橋。`,
  taxiToGate: (c) => `🗼 ${c.station}地面，${c.cs}，沿綠燈滑到 ${c.gate ?? '登機門'} 靠橋。`,
  docked: (c) => `🗼 ${c.cs}，${c.gate ?? '登機門'} 已靠橋，歡迎抵達 ${c.station}，下次再飛！`,
};

/**
 * 取一句 ATC：先從 bank 挑 grounded 變體（多樣），缺/不合格 → 固定地板（保底）。
 * @param {string} stage @param {{station?:string, rwy?:string, gate?:string, exit?:string}} ctx
 * @param {()=>number} [rng]
 * @returns {string}
 */
export function atcLine(stage, ctx, rng) {
  const full = { cs: CS, ...ctx, station: ctx.station ?? DEFAULT_STATION }; // station 預設要在 ...ctx 之後（否則 ctx.station=undefined 會蓋掉預設）
  const v = pickVariant(stage, /** @type {any} */ (full), rng ?? Math.random);
  if (v) return v;
  const floor = FLOORS[stage];
  return floor ? floor(/** @type {any} */ (full)) : '';
}

// —— 具名函式（main.js 用；station 缺省＝松山保 back-compat）——

/** 登機中（地面作業資訊，計數器；非 bank 階段＝floor-only）。 @param {string} gate @param {number} pax */
export function atcBoarding(gate, pax) { return `🛫 ${gate} 登機中… 乘客 ${pax}/72，加油・行李作業中。`; }
/** 登機完成、請求後推。 @param {string} gate @param {string} [station] */
export function atcBoardComplete(gate, station) { return atcLine('boardComplete', { station, gate }); }
/** 後推許可。 @param {string} gate @param {string} [station] */
export function atcPushback(gate, station) { return atcLine('pushback', { station, gate }); }
/** 後推完成、交還操控（v5.2-2 過渡拍點；floor-only、DRAFT 待校）。 @param {string} [station] */
export function atcPushDone(station) { return `🚜 ${station ?? DEFAULT_STATION}地面，${CS}，後推完成 — 操控交還，沿綠燈開始滑行。`; }
/** 接近等待點預告（v5.2-2 過渡；floor-only、DRAFT 待校）。 @param {string} rwy @param {string} [station] */
export function atcPrepareHold(rwy, station) { return `🗼 ${station ?? DEFAULT_STATION}地面，${CS}，接近 ${rwy} 等待點 — 減速、準備停等。`; }
/** hold short 排序倒數（v5.2-2 過渡；floor-only、DRAFT 待校）。 @param {string} rwy @param {string|undefined} station @param {number} secLeft */
export function atcHoldShortCount(rwy, station, secLeft) { return `🗼 ${CS}，${station ?? DEFAULT_STATION}塔台，${rwy} 等待點稍候 — 前機離場中，約 ${Math.max(0, Math.ceil(secLeft))} 秒。`; }
/** 滑行到跑道頭等待點。 @param {string} rwy @param {string} [station] */
export function atcTaxiToHold(rwy, station) { return atcLine('taxiToHold', { station, rwy }); }
/** hold short 起飛排序。 @param {string} rwy @param {string} [station] */
export function atcHoldShort(rwy, station) { return atcLine('holdShort', { station, rwy }); }
/** 起飛許可。 @param {string} rwy @param {string} [station] */
export function atcCleared(rwy, station) { return atcLine('cleared', { station, rwy }); }
/** 脫離跑道、前往登機門。 @param {string} exitLabel @param {string} gate @param {string} [station] */
export function atcExit(exitLabel, gate, station) { return atcLine('exit', { station, exit: exitLabel, gate }); }
/** 滑行到指派登機門。 @param {string} gate @param {string} [station] */
export function atcTaxiToGate(gate, station) { return atcLine('taxiToGate', { station, gate }); }
/** 已靠橋。 @param {string} gate @param {string} [station] */
export function atcDocked(gate, station) { return atcLine('docked', { station, gate }); }
