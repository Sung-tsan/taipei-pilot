// @ts-check
import os from 'node:os';

/**
 * 挑一個手機掃 QR 連得到的 LAN IPv4。
 * 偏好私有網段；多個介面時偏好 en0（Mac 的 Wi-Fi）。
 * @returns {string}
 */
export function lanIp() {
  const ifaces = os.networkInterfaces();
  /** @type {{name:string, addr:string}[]} */
  const candidates = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(a.address)) {
        candidates.push({ name, addr: a.address });
      }
    }
  }
  if (candidates.length === 0) return '127.0.0.1';
  candidates.sort((a, b) => (a.name === 'en0' ? -1 : 0) - (b.name === 'en0' ? -1 : 0));
  return candidates[0].addr;
}
