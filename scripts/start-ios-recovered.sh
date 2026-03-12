#!/bin/zsh
set -euo pipefail

ROOT="/Users/enoslee/Desktop/amas-asian-missionary-seminary (Codex)"
PORT="${PORT:-4173}"
SERVER_LOG="$ROOT/build/recovered-server.log"
PREFERRED_DEVICE_NAME="${PREFERRED_DEVICE_NAME:-iPhone 16 Pro}"
PREFERRED_RUNTIME="${PREFERRED_RUNTIME:-iOS 18.3}"

mkdir -p "$ROOT/build"

ensure_server() {
  if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
    return
  fi

  nohup "$ROOT/scripts/serve-recovered.sh" >"$SERVER_LOG" 2>&1 &

  for _ in {1..20}; do
    if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
      return
    fi
    sleep 0.5
  done

  echo "Recovered snapshot server did not start on port $PORT" >&2
  exit 1
}

resolve_device_udid() {
  local devices
  devices="$(xcrun simctl list devices)"

  python3 -c '
import re
import sys

preferred_runtime = sys.argv[1]
preferred_name = sys.argv[2]
current_runtime = None
booted = []
preferred = None
first_available = None

for raw_line in sys.stdin:
    line = raw_line.rstrip("\n")
    runtime_match = re.match(r"^-- (.+) --$", line)
    if runtime_match:
      current_runtime = runtime_match.group(1)
      continue

    device_match = re.match(r"^\s+(.+?) \(([0-9A-F-]{36})\) \(([^)]+)\)\s*(?:\(.*\))?\s*$", line)
    if not device_match:
      continue

    name, udid, state = device_match.groups()
    if state == "Unavailable":
      continue

    if state == "Booted":
      booted.append(udid)

    if current_runtime == preferred_runtime and name == preferred_name and preferred is None:
      preferred = udid

    if first_available is None:
      first_available = udid

print(preferred or (booted[0] if booted else first_available) or "")
' "$PREFERRED_RUNTIME" "$PREFERRED_DEVICE_NAME" <<<"$devices"
}

UDID="$(resolve_device_udid)"

if [[ -z "${UDID:-}" ]]; then
  echo "Could not find an available iOS simulator device." >&2
  exit 1
fi

open -a Simulator >/dev/null 2>&1 || true
xcrun simctl boot "$UDID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$UDID" -b

ensure_server

"$ROOT/scripts/build-ios-shell.sh" "$UDID"

osascript -e 'tell application "Simulator" to activate' >/dev/null 2>&1 || true

echo "Recovered iOS shell launched on simulator $UDID"
