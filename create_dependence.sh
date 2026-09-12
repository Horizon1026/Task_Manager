#!/usr/bin/env bash
set -euo pipefail
mission_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$mission_dir"
node_version="v22.22.0"
node_archive="node-${node_version}-linux-x64"
runtime_dir="$mission_dir/.runtime"
if ! command -v node >/dev/null 2>&1; then
  node_bin="$runtime_dir/$node_archive/bin/node"
  if [[ ! -x "$node_bin" ]]; then
    command -v curl >/dev/null 2>&1 || { printf '%s\n' '缺少 curl，无法下载 Node.js。' >&2; exit 1; }
    mkdir -p "$runtime_dir"
    archive="$runtime_dir/${node_archive}.tar.xz"
    curl --fail --location --retry 3 --connect-timeout 15 --max-time 300 "https://nodejs.org/dist/${node_version}/${node_archive}.tar.xz" -o "$archive"
    tar -xJf "$archive" -C "$runtime_dir"
    rm -f "$archive"
  fi
  export PATH="$runtime_dir/$node_archive/bin:$PATH"
fi
printf '使用 Node.js %s\n' "$(node --version)"
command -v npm >/dev/null 2>&1 || { printf '%s\n' '未找到 npm。' >&2; exit 1; }
if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
npm run build
printf '%s\n' '依赖恢复完成，应用构建完成。'
