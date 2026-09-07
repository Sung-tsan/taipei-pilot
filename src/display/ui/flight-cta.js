// @ts-check
// P1-5：短航班落地後 CTA（同一航線再飛／換對場／看成績）。純邏輯＋輕量 DOM 綁定，
// 讓 main.js 只在落地結算處接線，避免與平行 P1-3 大改衝突。

/** 旗艦短程（civil90 §1）：松山→高雄、松山→花蓮。 */
export const FLAGSHIP_ROUTE_IDS = /** @type {const} */ (['tsa-khh', 'tsa-hun']);

/** CTA 自動收合上限（spec §1 收尾 ≤15s）。 */
export const CTA_AUTO_DISMISS_MS = 15_000;

/**
 * @typedef {{
 *   routeId: string,
 *   pax: number,
 *   fromId: string,
 *   toId: string,
 *   gateScore: number|null,
 *   punctual?: boolean,
 *   planeId?: string,
 *   gateLabel?: string|null,
 *   landingGrade?: 'soft'|'ok'|'firm',
 *   landingStars?: number,
 * }} FlightResult
 *
 * @typedef {{ kind: 'replay'|'pair'|'flagship', routeId: string, originId: string, destId: string }} CtaPlan
 */

/**
 * 是否應顯示落地 CTA（有航線結算脈絡的民航短航班）。
 * @param {FlightResult|null|undefined} flight
 * @param {{ isCivil?: boolean }} [opts]
 */
export function shouldShowFlightCta(flight, opts = {}) {
  if (!flight || !flight.routeId || !flight.fromId || !flight.toId) return false;
  if (opts.isCivil === false) return false;
  return true;
}

/**
 * 同一航線再飛：回到出發場，再飛同一目的地。
 * @param {FlightResult} flight
 * @returns {CtaPlan}
 */
export function replayPlan(flight) {
  return { kind: 'replay', routeId: flight.routeId, originId: flight.fromId, destId: flight.toId };
}

/**
 * 換對場：從剛抵達場飛回出發場（同 route id，方向相反）。
 * @param {FlightResult} flight
 * @returns {CtaPlan}
 */
export function pairSwapPlan(flight) {
  return { kind: 'pair', routeId: flight.routeId, originId: flight.toId, destId: flight.fromId };
}

/**
 * 下一條旗艦（略過剛飛過的）。若剛飛非旗艦，回第一條旗艦。
 * @param {FlightResult} flight
 * @param {readonly string[]} [flagshipIds]
 * @returns {CtaPlan|null}
 */
export function nextFlagshipPlan(flight, flagshipIds = FLAGSHIP_ROUTE_IDS) {
  const ids = [...flagshipIds];
  if (ids.length === 0) return null;
  const idx = ids.indexOf(flight.routeId);
  const nextId = ids[(idx >= 0 ? idx + 1 : 0) % ids.length];
  const parts = nextId.split('-');
  if (parts.length < 2) return null;
  const [originId, destId] = parts;
  return { kind: 'flagship', routeId: nextId, originId, destId };
}

/**
 * 換對場優先用對飛；若呼叫端判定對飛不可用，可改傳 preferFlagship。
 * @param {FlightResult} flight
 * @param {{ preferFlagship?: boolean, flagshipIds?: readonly string[] }} [opts]
 * @returns {CtaPlan}
 */
export function resolveSwapPlan(flight, opts = {}) {
  if (opts.preferFlagship) {
    return nextFlagshipPlan(flight, opts.flagshipIds) ?? pairSwapPlan(flight);
  }
  return pairSwapPlan(flight);
}

/**
 * 成績列（準點／載客／航點／登機門）。
 * @param {FlightResult} flight
 * @param {(id: string) => string} airportName
 * @returns {string[]}
 */
export function formatScoreLines(flight, airportName) {
  const punctual = flight.punctual !== false;
  /** @type {string[]} */
  const lines = [
    `🛫 ${airportName(flight.fromId)} → ${airportName(flight.toId)}`,
    punctual ? '⭐ 準點抵達' : '⏰ 未準點',
    `👥 載客 ${flight.pax} 人`,
  ];
  if (flight.gateScore != null && Number.isFinite(flight.gateScore)) {
    const pct = Math.round(Math.max(0, Math.min(1, flight.gateScore)) * 100);
    lines.push(pct >= 100 ? '✨ 航點全過' : pct > 0 ? `🧭 航點 ${pct}%` : '🧭 航點未過');
  }
  // P1-3：落地品質（與 approach-guide judgeRunwayLanding 對齊）
  if (flight.landingStars != null && flight.landingStars > 0) {
    const feel = flight.landingGrade === 'soft' ? '漂亮落地' : flight.landingGrade === 'firm' ? '觸地偏重' : '降落成功';
    lines.push(`${'⭐'.repeat(Math.min(3, flight.landingStars))} ${feel}`);
  }
  if (flight.gateLabel) lines.push(`🚪 ${flight.gateLabel}`);
  return lines;
}

/**
 * 三顆 CTA 按鈕文案（主標＋副標）。
 * @param {FlightResult} flight
 * @param {CtaPlan} swap
 * @param {(id: string) => string} airportName
 */
export function ctaButtonLabels(flight, swap, airportName) {
  const od = (a, b) => `${airportName(a)}→${airportName(b)}`;
  return {
    replay: { title: '同一航線再飛', sub: od(flight.fromId, flight.toId) },
    swap: {
      title: swap.kind === 'flagship' ? '換旗艦航線' : '換對場',
      sub: od(swap.originId, swap.destId),
    },
    score: { title: '看這班成績', sub: '準點／載客／航點' },
  };
}

/**
 * 綁定 index.html `#flightCta` 面板（candy modal）。
 * @param {HTMLElement} root
 * @param {{
 *   onReplay: (plan: CtaPlan, flight: FlightResult) => void,
 *   onSwap: (plan: CtaPlan, flight: FlightResult) => void,
 *   onDismiss?: (flight: FlightResult|null) => void,
 *   airportName: (id: string) => string,
 *   autoDismissMs?: number,
 * }} handlers
 */
export function bindFlightCtaPanel(root, handlers) {
  const choicesEl = /** @type {HTMLElement} */ (root.querySelector('#flightCtaChoices'));
  const scoreEl = /** @type {HTMLElement} */ (root.querySelector('#flightCtaScore'));
  const scoreBody = /** @type {HTMLElement} */ (root.querySelector('#flightCtaScoreBody'));
  const titleEl = /** @type {HTMLElement} */ (root.querySelector('#flightCtaTitle'));
  const subEl = /** @type {HTMLElement} */ (root.querySelector('#flightCtaSub'));
  const btnReplay = /** @type {HTMLButtonElement} */ (root.querySelector('#flightCtaReplay'));
  const btnSwap = /** @type {HTMLButtonElement} */ (root.querySelector('#flightCtaSwap'));
  const btnScore = /** @type {HTMLButtonElement} */ (root.querySelector('#flightCtaScoreBtn'));
  const btnBack = /** @type {HTMLButtonElement} */ (root.querySelector('#flightCtaScoreBack'));
  const btnClose = /** @type {HTMLButtonElement} */ (root.querySelector('#flightCtaClose'));

  /** @type {FlightResult|null} */
  let current = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  let scoreView = false;

  const autoMs = handlers.autoDismissMs ?? CTA_AUTO_DISMISS_MS;

  function clearTimer() {
    if (timer != null) { clearTimeout(timer); timer = null; }
  }

  function hide() {
    clearTimer();
    root.classList.add('hidden');
    scoreView = false;
    if (choicesEl) choicesEl.classList.remove('hidden');
    if (scoreEl) scoreEl.classList.add('hidden');
  }

  /** @param {boolean} [notify] */
  function dismiss(notify = true) {
    const f = current;
    current = null;
    hide();
    if (notify) handlers.onDismiss?.(f);
  }

  /** @param {FlightResult} flight */
  function show(flight) {
    current = flight;
    scoreView = false;
    const swap = resolveSwapPlan(flight);
    const labels = ctaButtonLabels(flight, swap, handlers.airportName);
    if (titleEl) titleEl.textContent = '航班完成！👏';
    if (subEl) {
      subEl.textContent = `${handlers.airportName(flight.fromId)} → ${handlers.airportName(flight.toId)}　載客 ${flight.pax} 人`;
    }
    if (btnReplay) {
      btnReplay.innerHTML = `${labels.replay.title}<small>${labels.replay.sub}</small>`;
    }
    if (btnSwap) {
      btnSwap.innerHTML = `${labels.swap.title}<small>${labels.swap.sub}</small>`;
    }
    if (btnScore) {
      btnScore.innerHTML = `${labels.score.title}<small>${labels.score.sub}</small>`;
    }
    if (choicesEl) choicesEl.classList.remove('hidden');
    if (scoreEl) scoreEl.classList.add('hidden');
    root.classList.remove('hidden');
    clearTimer();
    timer = setTimeout(() => dismiss(true), autoMs);
  }

  function showScore() {
    if (!current) return;
    scoreView = true;
    clearTimer(); // 看成績時不自動關，避免讀不到
    if (scoreBody) {
      scoreBody.innerHTML = formatScoreLines(current, handlers.airportName)
        .map((l) => `<li>${l}</li>`).join('');
    }
    if (choicesEl) choicesEl.classList.add('hidden');
    if (scoreEl) scoreEl.classList.remove('hidden');
  }

  function backToChoices() {
    if (!current) return;
    scoreView = false;
    if (choicesEl) choicesEl.classList.remove('hidden');
    if (scoreEl) scoreEl.classList.add('hidden');
    clearTimer();
    timer = setTimeout(() => dismiss(true), autoMs);
  }

  btnReplay?.addEventListener('click', () => {
    if (!current) return;
    const f = current;
    const plan = replayPlan(f);
    current = null;
    hide();
    handlers.onReplay(plan, f);
  });
  btnSwap?.addEventListener('click', () => {
    if (!current) return;
    const f = current;
    const plan = resolveSwapPlan(f);
    current = null;
    hide();
    handlers.onSwap(plan, f);
  });
  btnScore?.addEventListener('click', () => showScore());
  btnBack?.addEventListener('click', () => backToChoices());
  btnClose?.addEventListener('click', () => dismiss(true));

  // 點 backdrop 關閉（與 modeMenu 一致）
  root.addEventListener('pointerdown', (e) => {
    if (e.target === root) dismiss(true);
  });

  return {
    show,
    hide: () => dismiss(false),
    dismiss: () => dismiss(true),
    get open() { return !!current && !root.classList.contains('hidden'); },
    get flight() { return current; },
    get showingScore() { return scoreView; },
  };
}
