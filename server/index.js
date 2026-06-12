// @ts-check
// 單一進入點：https（自簽）+ 靜態檔（dist/）+ WebSocket relay，同一個 port。
// 真機驗收一律走這條：npm start（= vite build + node server/index.js）
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { ensureCert } from './cert.js';
import { lanIp } from './lan-ip.js';
import { Relay } from './relay.js';
import { PORT, HEARTBEAT_MS } from '../shared/constants.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(root, '..', 'dist');
const certDir = path.join(root, '..', '.cert');

const ip = lanIp();
const { key, cert } = ensureCert(certDir, ip);

/** @type {Record<string, string>} */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const server = https.createServer({ key, cert }, (req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  if (url === '/config.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ lanIp: ip, port: PORT }));
    return;
  }
  let file = url === '/' ? '/index.html' : url;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, ''); // 防 path traversal
  const full = path.join(distDir, file);
  if (!full.startsWith(distDir) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 — 先跑 npm run build 產生 dist/');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(full)] ?? 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
});

// --- WebSocket relay ---
const wss = new WebSocketServer({ server });
/** @type {Map<string, import('ws').WebSocket>} */
const sockets = new Map();
let nextId = 1;

// TP_DEBUG=1 → 事件流寫 /tmp/tp-server.log（除錯殭屍連線/斷線時序用）
const debugLog = process.env.TP_DEBUG
  ? (/** @type {string} */ line) => fs.appendFileSync('/tmp/tp-server.log', `${Date.now() % 100000} ${line}\n`)
  : () => {};

const relay = new Relay({
  send(clientId, data) {
    const ws = sockets.get(clientId);
    if (ws && ws.readyState === ws.OPEN) ws.send(data);
    const t = JSON.parse(data).t;
    if (t !== 'in') debugLog(`send→${clientId} ${t}`);
  },
  close(clientId) {
    debugLog(`force-close ${clientId}`);
    sockets.get(clientId)?.close();
    sockets.delete(clientId);
  },
});

setInterval(() => relay.sweepStale(), 2000); // 殭屍 remote（連線在、輸入停 4s）→ 斷線流程

wss.on('connection', (/** @type {import('ws').WebSocket} */ ws) => {
  const id = `c${nextId++}`;
  sockets.set(id, ws);
  relay.onConnect(id);

  let missedPongs = 0;
  const heartbeat = setInterval(() => {
    if (missedPongs >= 2) { ws.terminate(); return; } // 捕捉手機鎖屏這種不發 close 的斷線
    missedPongs += 1;
    ws.ping();
  }, HEARTBEAT_MS);
  ws.on('pong', () => { missedPongs = 0; });

  ws.on('message', (/** @type {Buffer} */ data) => {
    const s = data.toString();
    if (!s.startsWith('{"t":"in"')) debugLog(`recv←${id} ${s.slice(0, 60)}`);
    relay.onMessage(id, s);
  });
  ws.on('close', () => {
    debugLog(`ws-close ${id}`);
    clearInterval(heartbeat);
    sockets.delete(id);
    relay.onDisconnect(id);
  });
  ws.on('error', () => { /* close handler 收尾 */ });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  🛫 台北小飛官 server');
  console.log(`     電腦開：https://${ip}:${PORT}/`);
  console.log(`     手機掃螢幕上的 QR（或開 https://${ip}:${PORT}/remote.html）`);
  console.log('     憑證是自簽的：第一次開會跳警告，選「仍要前往」即可');
  console.log('');
});
