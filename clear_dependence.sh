#!/usr/bin/env bash
set -euo pipefail
mission_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$mission_dir"
generated_paths=(node_modules dist .runtime test-results playwright-report)
for path in "${generated_paths[@]}"; do
  if [[ -e "$path" || -L "$path" ]]; then printf '清理 %s\n' "$path"; rm -rf -- "$path"; fi
done
while IFS= read -r -d '' path; do printf '清理 %s\n' "$path"; rm -f -- "$path"; done < <(find . -type f -name '*.tmp' -not -path './.git/*' -print0)
printf '%s\n' '依赖和构建产物已清理。源代码、锁文件、项目 YAML 和脚本已保留。'
