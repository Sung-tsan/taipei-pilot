// @ts-check
// V5 航線巡航引擎 —— 純狀態機，零 THREE/DOM，vitest 直測。
// A→B 跨海不渲染 300km → 雲上抽象：起飛(細節)→拉高觸發雲上低細節→時間壓縮 + 半自動 →
// 近目的地 → 降回細節（main.js 接 load 到達 airspace）。北極星 ROADMAP §4 V5 / handoff v5.0-1 P3。
//
// 半自動：巡航段 progress 自動推進（孩子不必一直握桿飛 300km），玩家可微調航向（headingAdjust）
// 影響到達精準度（cosmetic），近目的地恢復全控。時間壓縮：整段航線壓到 [MIN,MAX] 秒的「快轉」。

/** 巡航段時間壓縮範圍（秒）：再遠也不無聊、再近也有儀式感。短航班預設。 */
export const CRUISE_MIN_SEC = 22;
export const CRUISE_MAX_SEC = 48;
/** P1-6 真實模式：略拉長巡航（仍壓縮，不重建 ATC）。 */
export const CRUISE_MIN_SEC_REALISTIC = 40;
export const CRUISE_MAX_SEC_REALISTIC = 90;
/** 爬到此高度（m）＋有選定航線 → 觸發進入雲上巡航（雲在 ~500，CLIMB_CEIL 1000）。 */
export const CRUISE_ENTER_ALT = 600;

/** @typedef {'climb'|'cruise'|'descent'|'arrived'} CruisePhase */
/**
 * @typedef {{
 *   route: import('../scene/airports.js').Route,
 *   distanceKm: number,
 *   durationSec: number,
 *   phase: CruisePhase,
 *   progress: number,    // 巡航段進度 0..1
 *   elapsed: number,     // 巡航段已過秒數
 *   headingErr: number,  // 累積航向偏差（半自動微調；近目的地化作到達精準度）
 * }} Cruise
 */

/**
 * 依航程算壓縮後巡航秒數（線性，夾在 [MIN,MAX]）。
 * @param {number} distanceKm
 * @param {'shortHaul'|'realistic'|string} [pace='shortHaul'] P1-6：realistic 用較長夾值
 * @returns {number}
 */
export function cruiseDuration(distanceKm, pace = 'shortHaul') {
  const realistic = pace === 'realistic';
  const lo = realistic ? CRUISE_MIN_SEC_REALISTIC : CRUISE_MIN_SEC;
  const hi = realistic ? CRUISE_MAX_SEC_REALISTIC : CRUISE_MAX_SEC;
  const raw = distanceKm / 6; // shortHaul：~280km → 46s；~50km → 8s（夾到 MIN）
  return Math.max(lo, Math.min(hi, raw));
}

/**
 * 建一段巡航（起飛後選定航線即建；phase 從 'climb' 起，等爬高觸發 'cruise'）。
 * @param {import('../scene/airports.js').Route} route @param {number} distanceKm
 * @param {'shortHaul'|'realistic'|string} [pace='shortHaul']
 * @returns {Cruise}
 */
export function makeCruise(route, distanceKm, pace = 'shortHaul') {
  return {
    route,
    distanceKm,
    durationSec: cruiseDuration(distanceKm, pace),
    phase: 'climb',
    progress: 0,
    elapsed: 0,
    headingErr: 0,
  };
}

/**
 * 推進巡航一步（main.js 每物理步呼叫）。
 * - climb：等高度 ≥ CRUISE_ENTER_ALT → 進 cruise（justEnteredCruise）。
 * - cruise：progress 依 dt/durationSec 自動推進（半自動）；headingAdjust 累積偏差；progress≥1 → descent（justArrived）。
 * - descent / arrived：不再推進（main.js 已接管 load 到達 airspace）。
 * @param {Cruise} c
 * @param {{ dt:number, alt:number, headingAdjust?:number }} p
 *   dt＝秒；alt＝目前高度 m；headingAdjust＝玩家航向微調 -1..1（半自動，cosmetic）。
 * @returns {{ phase:CruisePhase, progress:number, justEnteredCruise:boolean, justArrived:boolean }}
 */
export function stepCruise(c, { dt, alt, headingAdjust = 0 }) {
  let justEnteredCruise = false;
  let justArrived = false;
  if (c.phase === 'climb') {
    if (alt >= CRUISE_ENTER_ALT) { c.phase = 'cruise'; c.progress = 0; c.elapsed = 0; justEnteredCruise = true; }
  } else if (c.phase === 'cruise') {
    c.elapsed += dt;
    c.progress = Math.min(1, c.elapsed / c.durationSec);
    c.headingErr += (headingAdjust || 0) * dt; // 半自動微調累積（化作到達精準度）
    if (c.progress >= 1) { c.phase = 'descent'; justArrived = true; }
  }
  return { phase: c.phase, progress: c.progress, justEnteredCruise, justArrived };
}

/** 到達精準度（半自動微調太多 → 略降；給 HUD/到達品質參考，0..1）。 @param {Cruise} c */
export function arrivalAccuracy(c) {
  return Math.max(0, 1 - Math.min(1, Math.abs(c.headingErr) / 8));
}

/** 巡航 HUD 文字標籤。 @param {CruisePhase} phase */
export function cruisePhaseLabel(phase) {
  switch (phase) {
    case 'climb': return '爬升中…飛上雲端開始巡航';
    case 'cruise': return '雲上巡航中';
    case 'descent': return '下降進場';
    default: return '抵達';
  }
}

/** 剩餘巡航秒數（整數，給 ETA）。 @param {Cruise} c */
export function cruiseEtaSec(c) {
  if (c.phase !== 'cruise') return c.phase === 'climb' ? Math.round(c.durationSec) : 0;
  return Math.max(0, Math.round(c.durationSec - c.elapsed));
}


// ============================================================================
// P1-2 巡航去過場化：航點閘門 + 天氣節拍（純邏輯，vitest 直測；視覺在 cruise-markers.js）
// ============================================================================

/** 穿圈水平容差（m）；與 race / corridor 同級、6 歲友善。 */
export const CRUISE_GATE_RADIUS = 140;
/** 閘門沿航向間距（m）：壓縮巡航 22–48s 內仍飛得過 2 座。 */
export const CRUISE_GATE_SPACING = 850;
/** progress 超過 atProgress 此值仍未穿 → 判定擦過（miss）。 */
export const CRUISE_GATE_MISS_SLACK = 0.14;

/**
 * @typedef {'gate'|'weather'} CruiseBeatKind
 * @typedef {{
 *   id: string,
 *   kind: CruiseBeatKind,
 *   atProgress: number,
 *   label: string,
 *   hit: boolean,
 *   resolved: boolean,
 * }} CruiseBeat
 * @typedef {{ beatId:string, x:number, y:number, z:number, r:number }} CruiseGateWorld
 */

/**
 * 短航班巡航節拍：2 座可見航點閘門 + 1 個天氣拍（非純 #cruiseOverlay 快轉）。
 * @param {string} [destName] 目的地短名（第二閘門標籤）
 * @returns {CruiseBeat[]}
 */
export function makeCruiseBeats(destName = '目的地') {
  return [
    { id: 'gate1', kind: 'gate', atProgress: 0.30, label: '西岸航點', hit: false, resolved: false },
    { id: 'wx1', kind: 'weather', atProgress: 0.50, label: '雲層天氣', hit: false, resolved: false },
    { id: 'gate2', kind: 'gate', atProgress: 0.72, label: `${destName}前方`, hit: false, resolved: false },
  ];
}

/**
 * 依進雲當下飛機位置／航向／高度，把 gate beats 放到世界座標（之字微偏，要微調才穿得過）。
 * @param {{x:number,z:number}} origin
 * @param {number} heading rad（飛行 heading：0＝−Z）
 * @param {number} alt
 * @param {CruiseBeat[]} beats
 * @returns {CruiseGateWorld[]}
 */
export function placeCruiseGates(origin, heading, alt, beats) {
  const fx = Math.sin(heading);
  const fz = -Math.cos(heading);
  const nx = Math.cos(heading); // 右側法線
  const nz = Math.sin(heading);
  /** @type {CruiseGateWorld[]} */
  const out = [];
  let gi = 0;
  for (const b of beats) {
    if (b.kind !== 'gate') continue;
    gi += 1;
    const dist = CRUISE_GATE_SPACING * gi;
    const lat = gi === 1 ? -55 : 90; // 微之字：第一偏左、第二偏右
    out.push({
      beatId: b.id,
      x: origin.x + fx * dist + nx * lat,
      y: alt,
      z: origin.z + fz * dist + nz * lat,
      r: CRUISE_GATE_RADIUS,
    });
  }
  return out;
}

/**
 * 推進巡航節拍：閘門靠世界距離判定；天氣靠 progress；逾時未穿 → miss。
 * @param {CruiseBeat[]} beats
 * @param {CruiseGateWorld[]} gates
 * @param {number} progress 0..1
 * @param {{x:number,z:number}} planePos
 * @returns {{ justHit: CruiseBeat|null, justMissed: CruiseBeat|null, justWeather: CruiseBeat|null }}
 */
export function stepCruiseBeats(beats, gates, progress, planePos) {
  /** @type {CruiseBeat|null} */ let justHit = null;
  /** @type {CruiseBeat|null} */ let justMissed = null;
  /** @type {CruiseBeat|null} */ let justWeather = null;
  for (const b of beats) {
    if (b.resolved) continue;
    if (b.kind === 'weather') {
      if (progress >= b.atProgress) {
        b.resolved = true;
        b.hit = true;
        justWeather = b;
      }
      continue;
    }
    const g = gates.find((x) => x.beatId === b.id);
    if (!g) continue;
    const dist = Math.hypot(planePos.x - g.x, planePos.z - g.z);
    if (dist <= g.r) {
      b.hit = true;
      b.resolved = true;
      justHit = b;
    } else if (progress >= b.atProgress + CRUISE_GATE_MISS_SLACK) {
      b.hit = false;
      b.resolved = true;
      justMissed = b;
    }
  }
  return { justHit, justMissed, justWeather };
}

/** 下一個尚未解決的節拍（給 HUD／世界標亮）。 @param {CruiseBeat[]} beats */
export function nextCruiseBeat(beats) {
  return beats.find((b) => !b.resolved) ?? null;
}

/** 閘門命中率 0..1（無閘門＝1）。 @param {CruiseBeat[]} beats */
export function cruiseGateScore(beats) {
  const gates = beats.filter((b) => b.kind === 'gate');
  if (gates.length === 0) return 1;
  return gates.filter((b) => b.hit).length / gates.length;
}

/** 下一航點 HUD 文案（zh-Hant）。 @param {CruiseBeat|null|undefined} beat */
export function cruiseNextLabel(beat) {
  if (!beat) return '即將進場';
  if (beat.kind === 'weather') return `下一拍：${beat.label}`;
  return `下一航點：${beat.label}（穿光圈）`;
}
