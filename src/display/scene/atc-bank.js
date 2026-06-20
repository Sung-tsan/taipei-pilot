// @ts-check
// V5 真 ATC「預生成 grounded bank」—— runtime 純邏輯（挑變體 + 結構/grounding 驗證 + 固定地板）。
// 零雲端：變體於 build-time 由 scripts/gen-atc-bank.js 生成、Sung 審核後烤進此檔（DRAFT）。
// runtime 只從 bank 挑 + 填機場真實 data（站名/跑道/門/脫離道），缺/不合格 → fallback 固定地板。
// 北極星 ROADMAP §4 V5 ATC / handoff v5.1-1。三件套（教訓 B4/B5）：grounded prompt（gen 時）+
// 結構驗證（此檔 validateVariant，build+runtime 都跑）+ 固定 clip 地板（atc-phraseology FLOORS）+ 逾時/缺 → 地板。

/** bank 是否仍為 DRAFT（待 Sung 校審；教訓 B5：未校稿不可當定稿）。 */
export const ATC_BANK_DRAFT = true;

/** ATC 階段（與 atc-phraseology FLOORS 對齊）。boardComplete 必含「確認」（gameplay：提示玩家按確認後推）。 */
export const ATC_STAGES = /** @type {const} */ ([
  'boardComplete', 'pushback', 'taxiToHold', 'holdShort', 'cleared', 'exit', 'taxiToGate', 'docked',
]);

/** 每階段必含關鍵詞（結構/grounding 驗證——保真實感 + 保 gameplay 關鍵字）。 */
const STAGE_KEYWORDS = /** @type {Record<string, string[]>} */ ({
  boardComplete: ['確認'],   // 必須提示玩家按確認（不可丟）
  pushback: ['後推'],
  taxiToHold: ['滑', '等待點'],
  holdShort: ['等待'],
  cleared: ['起飛'],
  exit: ['脫離'],
  taxiToGate: ['靠橋'],
  docked: ['靠橋'],
});

/** 允許的 placeholder（grounding：只准用機場真實 data，未知 placeholder＝不合格）。 */
const ALLOWED_KEYS = new Set(['cs', 'station', 'rwy', 'gate', 'exit', 'pax']);

/**
 * 預生成變體 bank（DRAFT，待 Sung 審）。placeholder：{cs}=呼號 {station}=機場名 {rwy}=跑道 {gate}=登機門 {exit}=脫離道。
 * 全部走真實航管用語結構（站台+呼號+真實 data），中文簡化、6 歲懂、保真實感。
 * 每階段必含 STAGE_KEYWORDS 才合格（gen-atc-bank.js 同規則丟不合格）。
 * @type {Record<string, string[]>}
 */
export const ATC_BANK = {
  boardComplete: [
    '🛫 {station}，{cs}，登機完成，請求後推 — 按【確認】開始。',
    '🛫 {cs}，{station} {gate} 登機好了，要後推請按【確認】。',
    '🛫 {station}地面，{cs}，乘客都上機了，按【確認】開始後推。',
  ],
  pushback: [
    '🚜 {station}地面，{cs}，{gate} 後推許可，引導車作業中。',
    '🚜 {cs}，{station}地面，准許從 {gate} 後推，引導車推你出來。',
    '🚜 {station}地面，{cs}，{gate} 可以後推了，注意引導車。',
  ],
  taxiToHold: [
    '🗼 {station}地面，{cs}，沿綠燈滑行到 {rwy} 等待點。',
    '🗼 {cs}，{station}地面，跟著綠燈滑到 {rwy} 等待點。',
    '🗼 {station}地面，{cs}，滑行道綠燈帶你到 {rwy} 等待點。',
  ],
  holdShort: [
    '🗼 {cs}，{station}塔台，{rwy} 等待點稍候，前一架離場中。',
    '🗼 {station}塔台，{cs}，在 {rwy} 等待點等一下，前機正在起飛。',
    '🗼 {cs}，{station}塔台，{rwy} 等待點 hold short，稍候放行。',
  ],
  cleared: [
    '🗼 {cs}，{station}塔台，{rwy} 可以起飛！進跑道、對正、推滿油門。',
    '🗼 {station}塔台，{cs}，{rwy} 風向良好，可以起飛！',
    '🗼 {cs}，{station}塔台，{rwy} 准許起飛，一路順風！',
  ],
  exit: [
    '🗼 {station}塔台，{cs}，{exit} 脫離跑道，前往 {gate} 靠橋。',
    '🗼 {cs}，{station}塔台，從 {exit} 脫離跑道，再滑去 {gate} 靠橋。',
    '🗼 {cs}，{station}塔台，{exit} 脫離跑道後，滑到 {gate} 靠橋。',
  ],
  taxiToGate: [
    '🗼 {station}地面，{cs}，沿綠燈滑到 {gate} 靠橋。',
    '🗼 {cs}，{station}地面，跟綠燈滑去 {gate} 靠橋。',
    '🗼 {station}地面，{cs}，綠燈帶你到 {gate} 靠橋。',
  ],
  docked: [
    '🗼 {cs}，{gate} 已靠橋，歡迎抵達 {station}，下次再飛！',
    '🗼 {station}塔台，{cs}，{gate} 靠橋完成，歡迎光臨，再見！',
    '🗼 {cs}，{station} {gate} 靠橋好了，旅客可以下機，謝謝！',
  ],
};

/**
 * 結構/grounding 驗證一個變體模板（build-time 丟不合格 + runtime 跳過）：
 * ① 非空 ② 含該階段必要關鍵詞（保真實感/gameplay）③ 含 {station} grounding ④ 無未知 placeholder。
 * @param {string} tmpl @param {string} stage @returns {boolean}
 */
export function validateVariant(tmpl, stage) {
  if (!tmpl || typeof tmpl !== 'string') return false;
  const kws = STAGE_KEYWORDS[stage];
  if (kws && !kws.some((k) => tmpl.includes(k))) return false; // 缺關鍵詞＝不合格
  if (!tmpl.includes('{station}')) return false;               // grounding：一定要點名機場
  if (!tmpl.includes('{cs}')) return false;                    // grounding：真實航管一定帶呼號
  // 未知 placeholder＝不合格（防生成幻覺欄位）
  const keys = [...tmpl.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  return keys.every((k) => ALLOWED_KEYS.has(k));
}

/** 填入機場真實 data；缺值留原樣（驗證已擋未知 key）。 @param {string} tmpl @param {Record<string,string|number>} ctx */
export function fillTemplate(tmpl, ctx) {
  return tmpl.replace(/\{(\w+)\}/g, (_, k) => (ctx[k] != null ? String(ctx[k]) : `{${k}}`));
}

/**
 * 從 bank 挑一個合格變體並填值。缺變體/全不合格 → null（呼叫端用固定地板）。
 * @param {string} stage @param {Record<string,string|number>} ctx @param {()=>number} [rng]
 * @returns {string|null}
 */
export function pickVariant(stage, ctx, rng = Math.random) {
  const pool = (ATC_BANK[stage] || []).filter((t) => validateVariant(t, stage));
  if (!pool.length) return null;
  let r = rng();
  if (!(r >= 0 && r < 1)) r = 0;
  const filled = fillTemplate(pool[Math.floor(r * pool.length) % pool.length], ctx);
  // 填完仍有殘留 placeholder（ctx 缺欄位）→ 視為不可用，退地板（安全網）
  return /\{\w+\}/.test(filled) ? null : filled;
}
