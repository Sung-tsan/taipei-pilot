// @ts-check
// 開發模式：同時起 vite（前端 HMR）+ node server（ws relay）。
// 頁面開 vite 的網址（會印在下面），ws 自動連 8443 的 node server。
import { spawn } from 'node:child_process';

const procs = [
  spawn('node', ['server/index.js'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit' }),
];
const killAll = () => procs.forEach((p) => p.kill());
process.on('SIGINT', killAll);
process.on('SIGTERM', killAll);
procs.forEach((p) => p.on('exit', killAll));
