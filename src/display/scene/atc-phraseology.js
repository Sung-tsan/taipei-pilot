// @ts-check
// v4.1-2 ATC 仿真 phraseology（中文簡化、保真實感、無吉祥物；與小司機小貓無關）。純函式回字串。
// 涵蓋 離場（後推/taxi/排序/起飛許可）+ 到場（脫離/taxi/gate/靠橋）；空中走廊用語在 air-corridor.js。
// ⚠️ DRAFT：用語為 agent 擬稿，待 Sung 校稿（讀給孩子聽看看，真實感 + 6 歲懂兼顧）。
//    紀律：atc.test 守 ATC_DRAFT===true（教訓 B5：DRAFT 不可當定稿）。

export const ATC_DRAFT = true; // 待 Sung 校稿
const CS = '小飛官'; // callsign（孩子）

/** 登機中（地面作業資訊）。 @param {string} gate @param {number} pax */
export function atcBoarding(gate, pax) { return `🛫 ${gate} 登機中… 乘客 ${pax}/72，加油・行李作業中。`; }
/** 登機完成、請求後推。 @param {string} gate */
export function atcBoardComplete(gate) { return `🛫 ${gate} 登機完成，請求後推 — 按【確認】開始。`; }
/** 後推許可。 @param {string} gate */
export function atcPushback(gate) { return `🚜 松山地面，${CS}，${gate} 後推許可，引導車作業中。`; }
/** 滑行到跑道頭等待點。 @param {string} rwy */
export function atcTaxiToHold(rwy) { return `🗼 松山地面，${CS}，沿綠燈滑行到 ${rwy} 等待點。`; }
/** hold short 起飛排序。 @param {string} rwy */
export function atcHoldShort(rwy) { return `🗼 ${CS}，松山塔台，${rwy} 等待點 hold short，前一架離場中，稍候。`; }
/** 起飛許可。 @param {string} rwy */
export function atcCleared(rwy) { return `🗼 ${CS}，松山塔台，${rwy} 可以起飛！進跑道、對正、推滿油門。`; }
/** 脫離跑道、前往登機門。 @param {string} exitLabel @param {string} gate */
export function atcExit(exitLabel, gate) { return `🗼 松山塔台，${CS}，${exitLabel} 脫離跑道，前往 ${gate} 靠橋。`; }
/** 滑行到指派登機門。 @param {string} gate */
export function atcTaxiToGate(gate) { return `🗼 松山地面，${CS}，沿綠燈滑到指派的 ${gate} 靠橋。`; }
/** 已靠橋。 @param {string} gate */
export function atcDocked(gate) { return `🗼 ${gate} 已靠橋，歡迎來到松山，下次再飛！`; }
