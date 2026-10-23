#!/bin/zsh
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")"
checkpoint_version=$(/usr/bin/plutil -extract version raw package.json)
if [[ -d "release/${checkpoint_version}/mac-arm64/Bito.app" ]]; then
  open "release/${checkpoint_version}/mac-arm64/Bito.app"
elif [[ -d "release/${checkpoint_version}/mac/Bito.app" ]]; then
  open "release/${checkpoint_version}/mac/Bito.app"
elif [[ -d "release/mac-arm64/Bito.app" ]]; then
  open "release/mac-arm64/Bito.app"
elif [[ -d "release/mac/Bito.app" ]]; then
  open "release/mac/Bito.app"
else
  echo "Menyiapkan Bito. Node.js 24 atau lebih baru diperlukan."
  if [[ ! -d node_modules ]]; then npm ci; fi
  npm run build
  npm start
fi
