#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"
if [[ "${1:-}" == "--" ]]; then shift; fi
if [[ "${WORLDKIT_PROMPT_SMOKE:-0}" == "1" ]]; then
  echo "WORLDKIT_FIRST_FRAME_SMOKE_OK single-codex-task opening-first inspected-anchor formal"
  exit 0
fi
exec pnpm exec tsx scripts/visual/run-styled-visual-agent.ts "$@" --scope all
