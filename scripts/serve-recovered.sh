#!/bin/zsh
set -euo pipefail

ROOT="/Users/enoslee/Desktop/amas-asian-missionary-seminary (Codex)"
TARGET="$ROOT/recovered_from_simulator/public"
PORT="${PORT:-4173}"

if [ ! -d "$TARGET" ]; then
  echo "Recovered snapshot not found: $TARGET" >&2
  exit 1
fi

echo "Serving recovered AMAS Seminary snapshot at http://127.0.0.1:$PORT"
exec python3 -m http.server "$PORT" -d "$TARGET"

