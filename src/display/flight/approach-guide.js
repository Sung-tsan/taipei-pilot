// @ts-check
// P1-3 進場／落地手感 —— 純判定與文案，零 THREE/DOM，vitest 直測。
// 對正（航向＋橫偏）、下滑（理想高度）、落地品質（下沉／側傾／中線）→ HUD／toast／成績。
// 北極星：civil90 SPEC §3 P1-3；複用 flight-model LAND_* 門檻精神。

/** 理想下滑角（rad≈3.5°）：短航班可讀、民航友善。 */
export const GLIDE_ANGLE = (3.5 * Math.PI) / 180;
/** 對正航向容差（rad≈8°）內視為「對正」。 */
export const ALIGN_OK_RAD = 0.14;
/** 中線橫偏（m）內視為對正；超過仍可落但成績降。 */
export const LATERAL_OK_M = 28;
/** 下滑高度相對理想的「剛好」帶（m）。 */
export const GLIDE_OK_M = 45;
/** 進場區：跑道頭外沿此距離內才顯示進場 HUD（m）。 */
export const APPROACH_ALONG_MAX = 4500;

/**
 * @typedef {{ along:number, lateral:number }} RunwayLocal
 * @typedef {{
 *   along:number, lateral:number, distToThreshold:number,
 *   headErr:number, alignOk:boolean, lateralOk:boolean,
 *   idealAlt:number, altErr:number, glideOk:boolean, glideHint:'high'|'ok'|'low',
 *   onFinal:boolean, gearDown:boolean,
 * }} ApproachStatus
 * @typedef {'soft'|'ok'|'firm'} LandingGrade
 */

/**
 * 世界座標 → 跑道 local（沿 runwayDir＝along，法線＝lateral）。
 * @param {{x:number,z:number}} pos @param {{x:number,z:number}} dir
 * @returns {RunwayLocal}
 */
export function toRunwayLocal(pos, dir) {
  return {
    along: pos.x * dir.x + pos.z * dir.z,
    lateral: pos.x * (-dir.z) + pos.z * dir.x,
  };
}

/**
 * 理想下滑高度：以「距著陸跑道頭」水平距離 × tan(下滑角)；頭內側用下限。
 * 跑道頭在 along = −halfLen（朝 +along 落地）。
 * @param {number} distToThreshold m（≥0＝頭外）
 * @param {number} [angleRad]
 */
export function idealGlideAlt(distToThreshold, angleRad = GLIDE_ANGLE) {
  const d = Math.max(0, distToThreshold);
  return Math.max(12, d * Math.tan(angleRad));
}

/**
 * 進場狀態（對正／下滑／是否在五邊）。
 * @param {{
 *   pos:{x:number,y:number,z:number}, heading:number, gearDown:boolean,
 *   runwayDir:{x:number,z:number}, runwayLength:number,
 * }} p
 * @returns {ApproachStatus}
 */
export function approachStatus(p) {
  const half = p.runwayLength / 2;
  const loc = toRunwayLocal(p.pos, p.runwayDir);
  const thresholdAlong = -half;
  const distToThreshold = thresholdAlong - loc.along; // 頭外為正（沿 −along 進場）
  const rwyHdg = Math.atan2(p.runwayDir.x, -p.runwayDir.z);
  // wrap 到 −π..π
  let headErr = p.heading - rwyHdg;
  headErr = ((headErr + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const alignOk = Math.abs(headErr) <= ALIGN_OK_RAD;
  const lateralOk = Math.abs(loc.lateral) <= LATERAL_OK_M;
  const idealAlt = idealGlideAlt(Math.max(0, distToThreshold));
  const altErr = p.pos.y - idealAlt;
  /** @type {'high'|'ok'|'low'} */
  let glideHint = 'ok';
  if (altErr > GLIDE_OK_M) glideHint = 'high';
  else if (altErr < -GLIDE_OK_M) glideHint = 'low';
  const glideOk = glideHint === 'ok';
  // 五邊：頭外、大致對正方向、尚在進場距離內
  const onFinal =
    distToThreshold > -200 &&
    distToThreshold < APPROACH_ALONG_MAX &&
    Math.abs(headErr) < 0.7 &&
    Math.abs(loc.lateral) < 400;
  return {
    along: loc.along,
    lateral: loc.lateral,
    distToThreshold,
    headErr,
    alignOk,
    lateralOk,
    idealAlt,
    altErr,
    glideOk,
    glideHint,
    onFinal,
    gearDown: !!p.gearDown,
  };
}

/**
 * ModeSlot 短文案（zh-Hant）：對正＋下滑＋輪。
 * @param {ApproachStatus} st
 */
export function approachModeLabel(st) {
  if (!st.onFinal) return '';
  const align = st.alignOk && st.lateralOk ? '對正 ✓' : st.headErr > 0 ? '偏右 → 左轉' : '偏左 → 右轉';
  const glide =
    st.glideHint === 'ok' ? '下滑穩' : st.glideHint === 'high' ? '偏高・收油門' : '偏低・補油門';
  const gear = st.gearDown ? '輪已放' : '先放輪！';
  return `🛬 ${align}｜${glide}｜${gear}`;
}

/**
 * TaskSlot／進場卡（zh-Hant）：距離＋目標高度。
 * @param {ApproachStatus} st @param {string} [airportName]
 */
export function approachTaskHtml(st, airportName = '目的地') {
  if (!st.onFinal) return '';
  const km = Math.max(0, st.distToThreshold) / 1000;
  const distLbl = km >= 0.1 ? `${km.toFixed(1)}km` : `${Math.round(Math.max(0, st.distToThreshold))}m`;
  return `🛬 對正 ${airportName} 跑道降落<br>距離 ${distLbl}　目標高度 ${Math.round(st.idealAlt)}m`;
}

/**
 * HomeSlot：進場時箭頭＝航向誤差（對正用）；標籤＝距離。
 * @param {ApproachStatus} st
 * @returns {{ rel:number, label:string }|null}
 */
export function approachHomeCue(st) {
  if (!st.onFinal) return null;
  const km = Math.max(0, st.distToThreshold) / 1000;
  const label =
    km >= 0.1 ? `跑道 ${km.toFixed(1)}km` : `跑道頭 ${Math.round(Math.max(0, st.distToThreshold))}m`;
  return { rel: st.headErr, label };
}

/**
 * 跑道落地品質（有別於迫降 judgeForcedLanding）：下沉／側傾／中線。
 * @param {{ sinkRate:number, bank:number, lateralM:number, speed?:number }} p
 * @param {{ landMaxSink?:number, landMaxBank?:number }} [lim]
 * @returns {{ grade:LandingGrade, stars:number, alignOk:boolean, softOk:boolean }}
 */
export function judgeRunwayLanding(p, lim = {}) {
  const maxSink = lim.landMaxSink ?? 6;
  const maxBank = lim.landMaxBank ?? 0.22;
  const softOk = p.sinkRate <= maxSink * 0.55 && Math.abs(p.bank) <= maxBank * 0.7;
  const okTouch = p.sinkRate <= maxSink && Math.abs(p.bank) <= maxBank;
  const alignOk = Math.abs(p.lateralM) <= LATERAL_OK_M * 1.4;
  /** @type {LandingGrade} */
  let grade = 'firm';
  if (softOk && alignOk) grade = 'soft';
  else if (okTouch && alignOk) grade = 'ok';
  else if (okTouch || alignOk) grade = 'ok';
  else grade = 'firm';
  const stars = grade === 'soft' ? 3 : grade === 'ok' ? 2 : 1;
  return { grade, stars, alignOk, softOk };
}

/**
 * 落地結算 toast（zh-Hant）；接 lastFlight 載客／準點鉤子。
 * @param {{ grade:LandingGrade, stars:number, alignOk:boolean, softOk:boolean }} j
 * @param {{ pax:number, gateNote?:string }} flight
 */
export function landingSuccessToast(j, flight) {
  const feel =
    j.grade === 'soft' ? '漂亮落地！掌聲響起來 👏' : j.grade === 'ok' ? '降落成功！👏' : '碰到了！下次更輕一點';
  const align = j.alignOk ? '對正佳' : '偏離中線';
  const soft = j.softOk ? '觸地柔' : '觸地偏重';
  const star = '⭐'.repeat(j.stars);
  const gate = flight.gateNote ? `・${flight.gateNote}` : '';
  return `🛬 航班完成！載客 ${flight.pax} 人・${feel}（${align}／${soft}）${star}${gate}`;
}

/**
 * placeOnApproach 建議姿態：對正、可讀下滑、進場速度（放輪後）。
 * @param {{ runwayDir:{x:number,z:number}, runwayLength:number, approachSpeed?:number }} p
 * @returns {{ x:number, z:number, y:number, heading:number, speed:number, gearDown:true }}
 */
export function approachSpawnPose(p) {
  const half = p.runwayLength / 2;
  const backDist = 2200; // 頭外 2.2km（與既有儀式距離一致）
  const along = -half - backDist;
  const dir = p.runwayDir;
  const heading = Math.atan2(dir.x, -dir.z);
  const y = idealGlideAlt(backDist) + 25; // 略高於理想，給孩子一點收油門空間
  const speed = p.approachSpeed ?? 48; // 民航進場：明顯慢於巡航、仍高於 V_GLIDE
  return {
    x: dir.x * along,
    z: dir.z * along,
    y,
    heading,
    speed,
    gearDown: true,
  };
}

/**
 * 五邊短走廊航點（runway frame → 世界）：對正環 → 下滑環 → 跑道頭。
 * 接 CorridorMarkers；與 placeOnApproach 同軸。
 * @param {{x:number,z:number}} dir @param {number} runwayLength
 * @returns {import('../scene/air-corridor.js').CorridorPoint[]}
 */
export function finalApproachPoints(dir, runwayLength) {
  const half = runwayLength / 2;
  /** @type {{ along:number, lateral:number, alt:number, label:string }[]} */
  const raw = [
    { along: -half - 2200, lateral: 0, alt: idealGlideAlt(2200) + 25, label: '對正跑道、確認放輪' },
    { along: -half - 1400, lateral: 0, alt: idealGlideAlt(1400), label: '五邊下滑' },
    { along: -half - 600, lateral: 0, alt: idealGlideAlt(600), label: '盯住跑道中線' },
    { along: -half + 40, lateral: 0, alt: 18, label: '通過跑道頭，落地' },
  ];
  return raw.map((w) => {
    const nx = -dir.z, nz = dir.x;
    return {
      x: dir.x * w.along + nx * w.lateral,
      z: dir.z * w.along + nz * w.lateral,
      alt: w.alt,
      leg: /** @type {'final'} */ ('final'),
      label: w.label,
    };
  });
}
