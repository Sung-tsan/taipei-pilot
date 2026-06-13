#!/bin/bash
# 台北小飛官 — 雙擊啟動器
# 雙擊這個檔案就會自動建置 + 起 server，並打開瀏覽器。

# 切換到這個檔案所在的資料夾（不管從哪裡點都對）
cd "$(dirname "$0")" || exit 1

clear
echo "🛫  台北小飛官 啟動中…"
echo "────────────────────────────────"

# 找 node（GUI 雙擊時 PATH 較精簡，主動補上常見安裝路徑）
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ 找不到 Node.js。請先到 https://nodejs.org 安裝（18 以上版本），再雙擊一次。"
  echo ""
  read -n 1 -s -r -p "按任意鍵關閉視窗…"
  exit 1
fi
echo "✅ Node 版本：$(node -v)"

# 第一次跑：自動安裝相依套件
if [ ! -d "node_modules" ]; then
  echo "📦 第一次啟動，安裝相依套件中（只有這次會比較久）…"
  npm install || { echo "❌ npm install 失敗"; read -n 1 -s -r -p "按任意鍵關閉…"; exit 1; }
fi

# server 起來後，背景等幾秒自動開瀏覽器
( sleep 6; open "https://localhost:8443/" ) &

echo "🚀 建置並啟動 server…（電腦和手機要連同一個 Wi-Fi）"
echo "   瀏覽器會自動打開；憑證警告請選「進階 → 仍要前往」。"
echo "   要結束遊戲：在這個視窗按 Control + C，或直接關掉視窗。"
echo "────────────────────────────────"
echo ""

npm start

# server 結束後別讓視窗瞬間消失
echo ""
read -n 1 -s -r -p "server 已停止。按任意鍵關閉視窗…"
