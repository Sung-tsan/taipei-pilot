// @ts-check
// 遙控器主流程：開始鈕（gesture 內拿權限）→ 連線 → 校正 → 30Hz 發送。
import { TiltReader } from './tilt.js';
import { ThrottleSlider } from './throttle.js';
import { Feedback } from './feedback.js';
import { RemoteNet } from './net/client.js';
import { INPUT_HZ, SLOT_COLORS, SLOT_NAMES } from '../../shared/constants.js';
import { BTN } from '../../shared/protocol.js';

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const startScreen = $('start');
const controlScreen = $('control');
const fullScreen = $('full');
const startErr = $('startErr');
const slotBanner = $('slotBanner');
const slotName = $('slotName');
const statusDot = $('statusDot');
const attitudeCanvas = /** @type {HTMLCanvasElement} */ ($('attitude'));
const rotateGuard = $('rotateGuard');

const tilt = new TiltReader();
const throttle = new ThrottleSlider($('thrTrack'), $('thrFill'));
const feedback = new Feedback($('flash'));
const net = new RemoteNet();

const isTestMode = new URLSearchParams(location.search).has('test');
/** @type {{r:number, p:number, th:number}|null} Playwright 注入用 */
let injected = null;
if (isTestMode) {
  /** @type {any} */ (window).__injectInput =
    (/** @type {number} */ r, /** @type {number} */ p, /** @type {number} */ th) => { injected = { r, p, th }; };
}

const calScreen = $('calibrate');
const calCanvas = /** @type {HTMLCanvasElement} */ ($('calCanvas'));
let calibrated = false;

// Android：進全螢幕 + 鎖定橫向 —— 禁掉「傾斜觸發自動旋轉」。
// 小孩玩到一半滑到通知列/返回手勢會退出全螢幕（鎖跟著鬆掉），
// 所以不只開場做一次：之後每個觸控手勢都檢查、掉了就趁手勢補鎖。
const IS_IOS = typeof (/** @type {any} */ (globalThis.DeviceOrientationEvent))?.requestPermission === 'function';
function ensureFullscreenLock() {
  if (IS_IOS || isTestMode) return; // iOS 無 fullscreen API，靠 angle0 凍結 + 不中斷設計
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  document.documentElement.requestFullscreen()
    .then(() => /** @type {any} */ (screen.orientation)?.lock?.('landscape'))
    .catch(() => { /* 鎖不了就靠 angle0 凍結 + 不中斷設計 */ });
}

$('startBtn').addEventListener('click', async () => {
  ensureFullscreenLock();
  // ⚠️ requestPermission 必須同步進入，不可先 await 別的
  const state = await tilt.start();
  if (state === 'denied') {
    startErr.textContent = '沒有拿到感應器權限 😢 請關掉這個分頁、重新掃 QR 再試一次';
    return;
  }
  if (state === 'unsupported' && !isTestMode) {
    startErr.textContent = '這支手機讀不到傾斜感應器（之後會有螢幕搖桿備案）';
    // 還是讓它連線——油門照常可用，傾斜值 0
  }
  feedback.unlockAudio();
  feedback.keepAwake();
  net.connect(); // 先佔 slot（校準時就完成連線，不讓孩子等兩次）
  startSendLoop(); // 立刻開始發送（飛機停著沒影響）—— 也是 server 活性偵測的心跳
  startScreen.classList.add('hidden');
  calScreen.classList.remove('hidden');
  drawCalPreview();
});

// —— 首次校準：泡泡即時預覽（相對預設基準），擺好姿勢按確認 = 設中立位 ——
function drawCalPreview() {
  if (calibrated) return;
  drawBubble(calCanvas, tilt.read());
  requestAnimationFrame(drawCalPreview);
}

$('calDoneBtn').addEventListener('click', () => {
  tilt.calibrate(); // 用「現在的握姿」當中立位
  calibrated = true;
  calScreen.classList.add('hidden');
  controlScreen.classList.remove('hidden');
  controlScreen.style.display = 'grid';
  checkOrientation(); // 進操控頁 → guard 規則切換成「不中斷」模式
  requestAnimationFrame(drawAttitude);
});

// 全螢幕被退出（通知列/返回手勢）→ 下一個觸控手勢補鎖
window.addEventListener('pointerdown', ensureFullscreenLock);

$('calBtn').addEventListener('click', () => {
  tilt.calibrate();
  feedback.unlockAudio();
});

// —— 起落架（左拇指）：送「期望狀態」，實際狀態由 display 回報（pstate）——
let wantGearUp = false;
const gearBtn = $('gearBtn');
const gearState = $('gearState');
gearBtn.addEventListener('click', () => {
  wantGearUp = !wantGearUp;
  renderGear(!wantGearUp); // 樂觀顯示，pstate 回報後校正
  feedback.unlockAudio();
});
net.onPState = (/** @type {boolean} */ gearDown) => renderGear(gearDown);
/** @param {boolean} gearDown */
function renderGear(gearDown) {
  gearBtn.classList.toggle('up', !gearDown);
  gearState.textContent = gearDown ? '已放下' : '已收起';
}

net.onState = () => {
  if (net.slotsFull) {
    controlScreen.classList.add('hidden');
    calScreen.classList.add('hidden');
    startScreen.classList.add('hidden');
    fullScreen.classList.remove('hidden');
    return;
  }
  if (net.slot !== null) {
    slotName.textContent = `${SLOT_NAMES[net.slot]} ✈️`;
    slotBanner.style.background = SLOT_COLORS[net.slot];
  }
  statusDot.textContent = !net.connected ? '🔄 重連中…'
    : !net.displayConnected ? '🖥️ 大螢幕沒開'
    : '🟢';
};

net.onFx = (/** @type {string} */ kind) => {
  if (kind === 'bump') feedback.bump();
};

// —— 30Hz 發送（取最新 sensor 值，不是每個 event 都送）——
let seq = 0;
function startSendLoop() {
  setInterval(() => {
    const t = injected ?? { ...tilt.read(), th: throttle.value };
    net.sendInput({ s: seq++, r: t.r, p: t.p, th: t.th, b: wantGearUp ? BTN.GEAR_UP : 0 });
  }, Math.round(1000 / INPUT_HZ));
}

// —— 姿態泡泡（孩子確認「這是我」+ 校正是否正確）——
/**
 * @param {HTMLCanvasElement} canvas
 * @param {{r:number, p:number}} input
 */
function drawBubble(canvas, { r, p }) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, R = W / 2 - 6;
  ctx.clearRect(0, 0, W, H);
  // 外圈
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = '#222b44'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#3a4666'; ctx.stroke();
  // 十字
  ctx.strokeStyle = '#3a4666'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
  // 泡泡（roll → x、pitch → y；拉桿 = 泡泡向下，像姿態儀）
  const bx = cx + r * R * 0.75;
  const by = cy + p * R * 0.75;
  const bubbleR = R * 0.14;
  ctx.beginPath(); ctx.arc(bx, by, bubbleR, 0, Math.PI * 2);
  ctx.fillStyle = net.slot !== null ? SLOT_COLORS[net.slot] : '#f2b94b';
  ctx.fill();
  ctx.beginPath(); ctx.arc(bx - bubbleR * 0.3, by - bubbleR * 0.3, bubbleR * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fill();
}

function drawAttitude() {
  drawBubble(attitudeCanvas, injected ?? tilt.read());
  requestAnimationFrame(drawAttitude);
}

// —— 橫拿 guard ——
// 遊戲開始前：直拿 → 全版遮罩擋住（要橫拿才能校準）。
// 遊戲中（已在操控頁）：**絕不中斷**——傾斜映射用的是校準時凍結的 angle0，
// 螢幕被 OS 轉直也不影響操控，只顯示小提示請孩子轉回來。
function checkOrientation() {
  const landscape = window.matchMedia('(orientation: landscape)').matches;
  const inControl = !controlScreen.classList.contains('hidden');
  rotateGuard.classList.toggle('hidden', landscape || inControl);
  $('rotateHint').classList.toggle('show', !landscape && inControl);
}
window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 60));
window.matchMedia('(orientation: landscape)').addEventListener?.('change', checkOrientation);
checkOrientation();

// 背景化時停止亂送（鎖屏由 server 心跳判斷斷線）
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (!net.connected && !net.slotsFull) net.connect();
  tilt.restart(); // 背景化常讓 OS 暫停 sensor，回前景主動重掛
});

// —— 感測器看門狗（遊戲中自動修復）——
// deviceorientation 流如果停了（傾斜讀值凍結 → 只會打平、壓不了機頭），
// 每秒檢查、超過 2 秒沒新 event 就自動重掛 listener，孩子完全無感。
const SENSOR_STALL_MS = 2000;
setInterval(() => {
  if (!tilt.started || !tilt.lastEventAt) return; // 還沒拿到第一筆（unsupported/test）不誤判
  if (document.visibilityState !== 'visible') return;
  if (performance.now() - tilt.lastEventAt > SENSOR_STALL_MS) {
    tilt.restart();
  }
}, 1000);
