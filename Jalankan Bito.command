#!/bin/zsh
set -e
cd "$(dirname "$0")"
if [[ -d "release/mac-arm64/Bito.app" ]]; then
  open "release/mac-arm64/Bito.app"
elif [[ -d "release/mac/Bito.app" ]]; then
  open "release/mac/Bito.app"
else
  echo "Menyiapkan Bito. Node.js 24 atau lebih baru diperlukan."
  if [[ ! -d node_modules ]]; then npm ci; fi
  npm run build
  npm start
fi
