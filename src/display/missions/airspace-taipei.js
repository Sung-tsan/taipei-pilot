// @ts-check
// 台北空域任務資料（B1 seam：換空域＝換這份，引擎零改動）。
// ✅ facts / 任務 prompt / 鳥瞰知識 已 Sung 校稿定稿（2026-06-13，DRAFT 全清；教訓 B5）。
// 北極星 handoff v1.1-3 / spec §4.4。landmark id 對應 src/display/scene/taipei.js 的 7 地標。
import { MISSION_TYPES } from './missions.js';

/** @typedef {{ text:string, draft:boolean }} Copy */
/** 文案包裝。draft:false＝已 Sung 校稿定稿（2026-06-13）；新增草稿傳 true 標記待校（教訓 B5）。
 *  @param {string} text @param {boolean} [draft] @returns {Copy} */
const copy = (text, draft = false) => ({ text, draft });

export const airspaceTaipei = {
  city: 'taipei',
  // v1.1-1 後果軸 seam（本輪用全域預設；V3 天氣嚴重度也將吃這檔）
  consequenceDefaults: null,

  /** 7 地標：id 對 scene、size 供「先大後小」挑選、fact 已定稿（≤20 字） */
  landmarks: [
    { id: 'taipei101', name: '台北 101', size: 5, fact: copy('台北101 有 508 公尺，超級高！') },
    { id: 'grandHotel', name: '圓山大飯店', size: 4, fact: copy('圓山大飯店是紅色宮殿式建築。') },
    { id: 'presidentialOffice', name: '總統府', size: 3, fact: copy('總統府是日治時代的紅磚建築。') },
    { id: 'cksMemorial', name: '中正紀念堂', size: 4, fact: copy('中正紀念堂有 89 階大階梯。') },
    { id: 'miramarWheel', name: '美麗華摩天輪', size: 3, fact: copy('美麗華摩天輪高 100 公尺。') },
    { id: 'ximenRedHouse', name: '西門紅樓', size: 2, fact: copy('西門紅樓是八角形紅磚老市場。') },
    { id: 'daanPark', name: '大安森林公園', size: 5, fact: copy('大安森林公園是台北的大肺。') },
  ],

  /** 任務四型（landmark_find 的 targetId 對 landmarks；ring_route 取 river 折線；altitude 給 rule） */
  missions: [
    // 地標尋寶 ×7
    { id: 'find_taipei101', type: MISSION_TYPES.LANDMARK_FIND, targetId: 'taipei101', difficulty: 2, prompt: copy('飛去看看全台北最高的台北101！') },
    { id: 'find_grandHotel', type: MISSION_TYPES.LANDMARK_FIND, targetId: 'grandHotel', difficulty: 2, prompt: copy('去找紅色的圓山大飯店！') },
    { id: 'find_presidentialOffice', type: MISSION_TYPES.LANDMARK_FIND, targetId: 'presidentialOffice', difficulty: 3, prompt: copy('飛去總統府上空看一看！') },
    { id: 'find_cksMemorial', type: MISSION_TYPES.LANDMARK_FIND, targetId: 'cksMemorial', difficulty: 2, prompt: copy('找找看白牆藍頂的中正紀念堂！') },
    { id: 'find_miramarWheel', type: MISSION_TYPES.LANDMARK_FIND, targetId: 'miramarWheel', difficulty: 2, prompt: copy('飛去美麗華摩天輪轉一圈！') },
    { id: 'find_ximenRedHouse', type: MISSION_TYPES.LANDMARK_FIND, targetId: 'ximenRedHouse', difficulty: 3, prompt: copy('去西門町找八角形的紅樓！') },
    { id: 'find_daanPark', type: MISSION_TYPES.LANDMARK_FIND, targetId: 'daanPark', difficulty: 1, prompt: copy('飛到綠綠的大安森林公園！') },

    // 穿圈航線（沿淡水河生成圈）
    { id: 'route_tamsui', type: MISSION_TYPES.RING_ROUTE, riverName: '淡水河', ringCount: 5, difficulty: 4, prompt: copy('沿著淡水河，穿過所有藍光圈！') },

    // 高度挑戰
    { id: 'alt_above101', type: MISSION_TYPES.ALTITUDE, altRule: { kind: 'above', value: 520 }, difficulty: 4, prompt: copy('飛得比台北101 還高！') },
    { id: 'alt_lowriver', type: MISSION_TYPES.ALTITUDE, altRule: { kind: 'below', value: 120 }, difficulty: 3, prompt: copy('貼著基隆河，低低地飛！') },

    // 起降練習（回松機落地 或 真實模式迫降成功）
    { id: 'practice_landing', type: MISSION_TYPES.TAKEOFF_LANDING, difficulty: 1, prompt: copy('回到松山機場，安全降落！') },
  ],

  /** 鳥瞰知識（達成穿插教學；已定稿） */
  aerialKnowledge: [
    { id: 'rivers_flow', text: copy('淡水河由南往北，最後流進台灣海峽。') },
    { id: 'keelung_river', text: copy('基隆河繞著松山機場北邊轉彎。') },
    { id: 'runway_1028', text: copy('松山跑道叫 10/28，是用羅盤方向命名的。') },
  ],
};
