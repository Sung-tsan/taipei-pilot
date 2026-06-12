// @ts-check
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  workers: 1, // server 是有狀態的（slot/display 接管）→ 測試檔不可平行，否則兩個 display 互搶
  use: {
    baseURL: 'https://localhost:8443',
    ignoreHTTPSErrors: true, // 自簽憑證
  },
  webServer: {
    command: 'npm run start',
    url: 'https://localhost:8443/config.json',
    ignoreHTTPSErrors: true,
    reuseExistingServer: false, // 每次全新 server，避免 grace slot 狀態殘留
    timeout: 60000,
  },
});
