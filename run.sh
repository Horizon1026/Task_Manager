#!/usr/bin/env bash
set -euo pipefail
mission_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$mission_dir"
if ! command -v node >/dev/null 2>&1; then
  mission_node="$mission_dir/.runtime/node-v22.22.0-linux-x64/bin"
  if [[ -x "$mission_node/node" ]]; then export PATH="$mission_node:$PATH"; else printf '%s\n' '未找到 Node.js。请先执行 ./create_dependence.sh。'; exit 1; fi
fi
if [[ ! -d node_modules ]]; then ./create_dependence.sh; fi
if [[ ! -f dist/index.html ]]; then npm run build; fi
exec npm start
