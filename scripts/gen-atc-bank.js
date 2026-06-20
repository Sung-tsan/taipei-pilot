// @ts-check
/**
 * V5.1-1 真 ATC bank —— build-time 生成工具（dev-only，遊戲本體永不連雲）。
 *
 * 北極星 ROADMAP §4 V5 ATC / handoff v5.1-1。守 offline-LAN 鐵律：這支 script 是「一次性 dev 工具」，
 * 跑在開發機、用 ANTHROPIC_API_KEY 呼叫 Claude API（Haiku，便宜快）生成 grounded ATC 變體，
 * 過結構/grounding 驗證（不合格丟棄）後印出 → Sung 校審 → 人工烤進 src/display/scene/atc-bank.js（DRAFT 清旗標）。
 * **遊戲 runtime 從不執行此檔、不帶 API key、不連雲**（atc-bank.js 只讀烤好的常數）。
 *
 * 用法（開發機）：
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/gen-atc-bank.js
 *   （Node 18+ 內建 fetch；不裝 @anthropic-ai/sdk＝遊戲 deps 維持零 AI 套件、offline 不破。）
 *
 * 三件套（教訓 B4/B5）：① grounded prompt（只准真實航管用語 + 該機場真實 data）
 *   ② 結構/grounding 驗證（複用 atc-bank.js validateVariant，不合格丟棄）③ 固定 clip 地板（atc-phraseology FLOORS，本檔不碰）。
 */
import { AIRPORTS, AIRPORT_IDS } from '../src/display/scene/airports.js';
import { ATC_STAGES, validateVariant } from '../src/display/scene/atc-bank.js';

const MODEL = 'claude-haiku-4-5'; // handoff 指定：便宜快（claude-api skill 確認 model id）
const API_URL = 'https://api.anthropic.com/v1/messages';
const VARIANTS_PER_STAGE = 6; // 生多一點，驗證丟掉不合格後仍有餘

/** 每階段給生成器的情境說明（grounded：只准用真實航管用語 + 指定 placeholder）。 */
const STAGE_BRIEF = {
  boardComplete: '登機完成、請求後推。必含「確認」（提示玩家按確認鈕後推）。',
  pushback: '塔台/地面給後推許可，引導車作業。必含「後推」。',
  taxiToHold: '地面指示沿綠燈滑行到跑道頭等待點。必含「滑」與「等待點」。',
  holdShort: '在跑道等待點 hold short、前機離場中、稍候。必含「等待」。',
  cleared: '塔台給起飛許可。必含「起飛」。',
  exit: '落地後從脫離道脫離跑道、前往登機門。必含「脫離」。',
  taxiToGate: '地面指示沿綠燈滑到指派登機門靠橋。必含「靠橋」。',
  docked: '已靠橋、歡迎抵達、再見。必含「靠橋」。',
};

/** JSON schema：強制回 { variants: string[] }（structured outputs；Haiku 4.5 支援）。 */
const SCHEMA = {
  type: 'object',
  properties: { variants: { type: 'array', items: { type: 'string' } } },
  required: ['variants'],
  additionalProperties: false,
};

/** @param {string} stage @param {import('../src/display/scene/airports.js').AirportSpec} ap */
function buildPrompt(stage, ap) {
  return [
    '你是台灣民航塔台 ATC 用語產生器，為一款 6 歲兒童飛行遊戲生成「中文簡化、保真實感、適齡」的航管通話。',
    `機場：${ap.name}（ICAO ${ap.icao}）。呼號固定用 placeholder {cs}。`,
    '【硬規則／grounding】只准用真實航管用語結構；只准用這些 placeholder：{cs}=呼號、{station}=機場名、{rwy}=跑道、{gate}=登機門、{exit}=脫離道。',
    '不准出現任何其他 placeholder 或捏造的機場/航班資料。每句都要含 {station}（點名機場）。每句開頭可帶一個 emoji（🗼/🚜/🛫）。',
    `【本階段】${STAGE_BRIEF[stage] ?? stage}`,
    `產生 ${VARIANTS_PER_STAGE} 句不同說法的變體，孩子聽得懂、又像真的塔台。`,
  ].join('\n');
}

/** 呼叫 Claude API（raw fetch；claude-api skill：Haiku 不開 thinking、用 output_config.format 強制 JSON）。 */
async function genVariants(/** @type {string} */ stage, /** @type {any} */ ap) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: buildPrompt(stage, ap) }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content ?? []).filter((/** @type {any} */ b) => b.type === 'text').map((/** @type {any} */ b) => b.text).join('');
  /** @type {string[]} */
  const variants = JSON.parse(text).variants ?? [];
  // 結構/grounding 驗證（複用 runtime 同一把尺）→ 丟不合格。
  return variants.filter((v) => validateVariant(v, stage));
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('需要 ANTHROPIC_API_KEY（dev-only 工具；遊戲 runtime 不連雲）。'); process.exit(1);
  }
  /** @type {Record<string, Record<string, string[]>>} */
  const out = {};
  for (const id of AIRPORT_IDS) {
    out[id] = {};
    for (const stage of ATC_STAGES) {
      try {
        out[id][stage] = await genVariants(stage, AIRPORTS[id]);
        console.error(`✓ ${id}/${stage}: ${out[id][stage].length} 合格變體`);
      } catch (e) {
        out[id][stage] = []; // 逾時/失敗 → 空（runtime 自動退固定地板，安全網不破）
        console.error(`✗ ${id}/${stage}: ${(e instanceof Error ? e.message : e)} → 退固定地板`);
      }
    }
  }
  // 印出供 Sung 校審；定稿後人工貼進 atc-bank.js 的 ATC_BANK，並把 ATC_BANK_DRAFT 設 false。
  console.log(JSON.stringify(out, null, 2));
  console.error('\n⚠️ DRAFT：請 Sung 校審上面變體（適齡/正確/grounding），定稿後貼進 src/display/scene/atc-bank.js 並清 ATC_BANK_DRAFT。');
}

main().catch((e) => { console.error(e); process.exit(1); });
