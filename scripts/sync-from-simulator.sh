#!/bin/zsh
set -euo pipefail

ROOT="/Users/enoslee/Desktop/amas-asian-missionary-seminary (Codex)"
APP_ID="org.amas.seminary"
DEST="$ROOT/recovered_from_simulator/public"
PUBLIC_DEST="$ROOT/public/recovered"

APP_PATH=""

if APP_PATH="$(xcrun simctl get_app_container booted "$APP_ID" app 2>/dev/null)"; then
  :
else
  APP_PATH=""
fi

if [ -z "${APP_PATH:-}" ] || [ ! -d "$APP_PATH/public" ]; then
  APP_PATH="$(
    python3 - <<'PY'
import os
base = "/Users/enoslee/Library/Developer/CoreSimulator/Devices"
candidates = []
for root, dirs, files in os.walk(base):
    if root.endswith("/App.app/public") and "index.html" in files:
        app_path = root[:-len("/public")]
        try:
            mtime = os.path.getmtime(os.path.join(root, "index.html"))
        except OSError:
            continue
        candidates.append((mtime, app_path))
if candidates:
    candidates.sort(reverse=True)
    print(candidates[0][1])
PY
  )"
fi

if [ -z "${APP_PATH:-}" ] || [ ! -d "$APP_PATH/public" ]; then
  echo "Could not locate any simulator app public directory for $APP_ID" >&2
  exit 1
fi

mkdir -p "$DEST"
mkdir -p "$PUBLIC_DEST"
rsync -a --delete "$APP_PATH/public/" "$DEST/"
rsync -a --delete "$APP_PATH/public/" "$PUBLIC_DEST/"
python3 - <<'PY'
from pathlib import Path

target = Path("/Users/enoslee/Desktop/amas-asian-missionary-seminary (Codex)/public/recovered/index.html")
if target.exists():
    content = target.read_text(encoding="utf-8")
    content = content.replace('src="/assets/', 'src="./assets/')
    target.write_text(content, encoding="utf-8")
PY
echo "Recovered snapshot refreshed from simulator:"
echo "$APP_PATH/public -> $DEST"
echo "$APP_PATH/public -> $PUBLIC_DEST"
