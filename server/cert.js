// @ts-check
// 自簽 HTTPS 憑證：第一次啟動 runtime 產生，快取到 .cert/；LAN IP 變了自動重產。
// 手機端各踩一次「憑證警告 → 仍要瀏覽」即可（iOS：顯示詳細資訊 → 前往這個網站）。
import fs from 'node:fs';
import path from 'node:path';
import selfsigned from 'selfsigned';

/**
 * @param {string} certDir 快取資料夾（建議專案內 .cert/，gitignore）
 * @param {string} ip 當下 LAN IP
 * @returns {{ key:string, cert:string }}
 */
export function ensureCert(certDir, ip) {
  const cachePath = path.join(certDir, 'cert.json');
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (cached.ip === ip && cached.key && cached.cert) {
      return { key: cached.key, cert: cached.cert };
    }
  } catch {
    // 無快取或壞檔 → 重產
  }
  const pems = selfsigned.generate(
    [{ name: 'commonName', value: 'taipei-pilot.local' }],
    {
      days: 3650,
      keySize: 2048,
      extensions: [
        { name: 'basicConstraints', cA: false },
        {
          name: 'subjectAltName',
          altNames: [
            { type: 2, value: 'localhost' },        // DNS
            { type: 7, ip: '127.0.0.1' },            // IP
            { type: 7, ip },
          ],
        },
      ],
    },
  );
  fs.mkdirSync(certDir, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify({ ip, key: pems.private, cert: pems.cert }));
  return { key: pems.private, cert: pems.cert };
}
