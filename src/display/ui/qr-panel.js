// @ts-check
// 大螢幕上的 QR 面板：手機掃了變遙控器。兩支掃同一個 QR，slot 自動分配。
import QRCode from 'qrcode';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} urlLabel
 */
export async function renderQr(canvas, urlLabel) {
  let lanIp = location.hostname;
  try {
    const cfg = await (await fetch('/config.json')).json();
    lanIp = cfg.lanIp;
  } catch { /* 拿不到就用目前 hostname（可能是 localhost，掃不到） */ }
  const port = location.port || '443';
  const url = `https://${lanIp}:${port}/remote.html`;
  await QRCode.toCanvas(canvas, url, {
    width: 240,
    margin: 1,
    color: { dark: '#1a2233', light: '#f2ead8' },
  });
  urlLabel.textContent = url;
  return url;
}
