// @ts-check
// V5 航網地理 registry —— 純資料 + 純查詢，零 THREE/DOM，vitest 直測。
// 九機場（真實經緯度/跑道諸元/招牌挑戰）+ 九航線（航網收集）+ 全圖投影 + haversine 航程。
// 北極星 ROADMAP §4 V5 / §5 機場 pillar（「真實特性＝關卡」）/ §5B 航程 gates。
//
// 設計（B1 參數化極致）：每機場一份 spec，runway.lengthM / weather / terrain 就是它的關卡；
// 換機場＝換這份資料，引擎零改動。airport-scene.js 吃 spec 長出場景；route-engine.js 吃航線跑巡航。
// weatherProfile key 對 weather.js 的 WEATHER_PROFILES（9 機場 schema 已 ready）。

/**
 * @typedef {'city'|'coast'|'island'|'mountain'} Terrain
 *   city=市區進場；coast=海邊；island=離島（四周海）；mountain=山海之間。
 * @typedef {{
 *   id: string,            // 內部 id（＝weather profile key）
 *   name: string,          // 中文名（HUD/全圖/收集簿）
 *   icao: string,          // ICAO 代號（真實感；ATC grounding 用）
 *   lat: number, lng: number, // 真實經緯度（全圖落點＝台灣地理教材）
 *   runway: { headingDeg:number, lengthM:number, widthM:number }, // 真實跑道（短場挑戰）
 *   weather: string,       // weather.js WEATHER_PROFILES key
 *   terrain: Terrain,
 *   tier: 'intro'|'inter'|'expert', // 難度梯度（解鎖順序）
 *   signature: string,     // 招牌挑戰（一句話，HUD 進場提示）
 *   home?: boolean,        // 是否母場（松山＝預設起點）
 * }} AirportSpec
 */

/**
 * 九機場 registry（真實經緯度 + 跑道諸元；值對 ROADMAP §5 難度梯度）。
 * tsa（松山）＝母場，世界原點與 taipei.js 一致。其餘為航網目的地。
 * @type {Record<string, AirportSpec>}
 */
export const AIRPORTS = {
  tsa: { id: 'tsa', name: '台北松山', icao: 'RCSS', lat: 25.0694, lng: 121.5521, runway: { headingDeg: 100, lengthM: 2605, widthM: 60 }, weather: 'tsa', terrain: 'city', tier: 'intro', signature: '市區進場', home: true },
  tpe: { id: 'tpe', name: '桃園', icao: 'RCTP', lat: 25.0777, lng: 121.2328, runway: { headingDeg: 52, lengthM: 3660, widthM: 60 }, weather: 'tpe', terrain: 'coast', tier: 'intro', signature: '大型國際場・好飛' },
  rmq: { id: 'rmq', name: '台中清泉崗', icao: 'RCMQ', lat: 24.2647, lng: 120.6213, runway: { headingDeg: 180, lengthM: 3660, widthM: 60 }, weather: 'rmq', terrain: 'coast', tier: 'inter', signature: '長跑道' },
  khh: { id: 'khh', name: '高雄小港', icao: 'RCKH', lat: 22.5771, lng: 120.3500, runway: { headingDeg: 90, lengthM: 3150, widthM: 60 }, weather: 'khh', terrain: 'coast', tier: 'inter', signature: '海邊市區' },
  hun: { id: 'hun', name: '花蓮', icao: 'RCYU', lat: 24.0231, lng: 121.6181, runway: { headingDeg: 30, lengthM: 2700, widthM: 45 }, weather: 'hun', terrain: 'mountain', tier: 'inter', signature: '山海之間・亂流' },
  ttt: { id: 'ttt', name: '台東', icao: 'RCFN', lat: 22.7550, lng: 121.1017, runway: { headingDeg: 40, lengthM: 1600, widthM: 40 }, weather: 'ttt', terrain: 'mountain', tier: 'inter', signature: '側風・山區進場' },
  mzg: { id: 'mzg', name: '澎湖馬公', icao: 'RCQC', lat: 23.5687, lng: 119.6283, runway: { headingDeg: 20, lengthM: 3000, widthM: 45 }, weather: 'mzg', terrain: 'island', tier: 'expert', signature: '強側風' },
  knh: { id: 'knh', name: '金門', icao: 'RCBS', lat: 24.4279, lng: 118.3592, runway: { headingDeg: 60, lengthM: 2400, widthM: 45 }, weather: 'knh', terrain: 'island', tier: 'expert', signature: '易起霧・常關場' },
  lzn: { id: 'lzn', name: '馬祖南竿', icao: 'RCFG', lat: 26.1598, lng: 119.9580, runway: { headingDeg: 30, lengthM: 1600, widthM: 30 }, weather: 'lzn', terrain: 'island', tier: 'expert', signature: '短跑道・霧・地形（最難）' },
};

/** 九機場 id（順序＝難度梯度／解鎖順序）。 */
export const AIRPORT_IDS = /** @type {const} */ (['tsa', 'tpe', 'rmq', 'khh', 'hun', 'ttt', 'mzg', 'knh', 'lzn']);

/** 母場（預設起點）。 */
export const HOME_AIRPORT = 'tsa';

/** 目前 3 個 demo 機場（v5.0-1 完整可飛；其餘 6 場 v5.1-2 rollout）。 */
export const DEMO_AIRPORTS = /** @type {const} */ (['tsa', 'khh', 'knh']);

/** @param {string} id @returns {AirportSpec} 未知 → 退回母場（不爆）。 */
export function airport(id) { return AIRPORTS[id] ?? AIRPORTS[HOME_AIRPORT]; }

/** @typedef {{ text:string, draft:boolean }} Copy */
/** 文案包裝（draft:true＝待 Sung 校稿，教訓 B5）。 @param {string} text @param {boolean} [draft] @returns {Copy} */
const copy = (text, draft = true) => ({ text, draft });

/**
 * @typedef {{ id:string, from:string, to:string, name:string, fact:Copy }} Route
 */

/**
 * 九航線（航網收集；ROADMAP §4「九航線全通大慶祝」）。以松山為主軸 hub + 一條跨島支線
 * （高雄→澎湖，示範非母場出發），九條覆蓋全部九機場。fact 為 DRAFT 待 Sung 校稿（教訓 B5）。
 * 航線難度＝出發 × 到達機場挑戰疊加（§4）。
 * @type {Route[]}
 */
export const ROUTES = [
  { id: 'tsa-tpe', from: 'tsa', to: 'tpe', name: '松山→桃園', fact: copy('桃園是台灣最大的國際機場。') },
  { id: 'tsa-rmq', from: 'tsa', to: 'rmq', name: '松山→台中', fact: copy('台中清泉崗有很長的跑道。') },
  { id: 'tsa-khh', from: 'tsa', to: 'khh', name: '松山→高雄', fact: copy('高雄小港在海邊，是南部大城。') },
  { id: 'tsa-hun', from: 'tsa', to: 'hun', name: '松山→花蓮', fact: copy('花蓮在山和海中間，風會亂亂吹。') },
  { id: 'tsa-ttt', from: 'tsa', to: 'ttt', name: '松山→台東', fact: copy('台東靠山，降落要小心側風。') },
  { id: 'tsa-mzg', from: 'tsa', to: 'mzg', name: '松山→澎湖', fact: copy('澎湖是離島，風特別大。') },
  { id: 'tsa-knh', from: 'tsa', to: 'knh', name: '松山→金門', fact: copy('金門常常起霧，看不清楚跑道。') },
  { id: 'tsa-lzn', from: 'tsa', to: 'lzn', name: '松山→馬祖南竿', fact: copy('馬祖南竿跑道很短，又常有霧，最難降落！') },
  { id: 'khh-mzg', from: 'khh', to: 'mzg', name: '高雄→澎湖', fact: copy('從高雄也能飛去澎湖，飛機不一定都從台北出發。') },
];

/** @param {string} id @returns {Route|null} */
export function route(id) { return ROUTES.find((r) => r.id === id) ?? null; }

/** 全部航線 id。 */
export const ROUTE_IDS = ROUTES.map((r) => r.id);

/**
 * 從某機場可飛的航線（雙向：可去也可回；全圖選線在 A 機場顯示任一端＝A 的航線）。
 * 航線 id 不分方向（收集只記一次），實際目的地＝另一端（routeOtherEnd）。
 * @param {string} fromId
 */
export function routesFrom(fromId) { return ROUTES.filter((r) => r.from === fromId || r.to === fromId); }

/** 航線在某機場的「另一端」＝實際目的地。 @param {Route} r @param {string} fromId @returns {string} */
export function routeOtherEnd(r, fromId) { return r.from === fromId ? r.to : r.from; }

const R_EARTH_KM = 6371;
/** @param {number} deg */
const rad = (deg) => (deg * Math.PI) / 180;

/**
 * 兩經緯度球面距離（haversine，公里）。航程 gates（v5.0-2 油量）用。
 * @param {number} lat1 @param {number} lng1 @param {number} lat2 @param {number} lng2 @returns {number} km
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 航線距離（公里，整數）。 @param {string} fromId @param {string} toId @returns {number} */
export function routeDistanceKm(fromId, toId) {
  const a = airport(fromId); const b = airport(toId);
  return Math.round(haversineKm(a.lat, a.lng, b.lat, b.lng));
}

/** 台灣全圖經緯度邊界（含金門 118.36 / 馬祖 26.16；留邊距）。 */
export const MAP_BOUNDS = { latMin: 21.8, latMax: 26.4, lngMin: 118.1, lngMax: 122.2 };

/**
 * 經緯度 → 全圖正規化座標（x 右、y 下，皆 0..1；UI 乘上像素尺寸即落點）。
 * 全圖＝台灣地理學習地圖（九機場標真實相對位置）。
 * @param {number} lat @param {number} lng @param {typeof MAP_BOUNDS} [bounds]
 * @returns {{x:number, y:number}}
 */
export function mapXY(lat, lng, bounds = MAP_BOUNDS) {
  const x = (lng - bounds.lngMin) / (bounds.lngMax - bounds.lngMin);
  const y = (bounds.latMax - lat) / (bounds.latMax - bounds.latMin);
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}
