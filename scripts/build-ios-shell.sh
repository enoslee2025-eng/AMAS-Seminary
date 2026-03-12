#!/bin/zsh
set -euo pipefail

ROOT="/Users/enoslee/Desktop/amas-asian-missionary-seminary (Codex)"
APP_NAME="AMASSeminary"
BUNDLE_ID="org.amas.seminary"
SOURCES_DIR="$ROOT/ios-shell"
BUILD_DIR="$ROOT/build/ios-shell"
APP_DIR="$BUILD_DIR/$APP_NAME.app"
SDK_PATH="$(xcrun --sdk iphonesimulator --show-sdk-path)"
TARGET_UDID="${TARGET_UDID:-${1:-}}"
BOOTED_UDID="${TARGET_UDID:-$(xcrun simctl list devices booted | awk -F '[()]' '/Booted/{print $2; exit}')}"

if [[ -z "${BOOTED_UDID:-}" ]]; then
  echo "No booted simulator found." >&2
  exit 1
fi

mkdir -p "$APP_DIR"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"

cp "$SOURCES_DIR/Info.plist" "$APP_DIR/Info.plist"
cp -R "$ROOT/public/recovered" "$APP_DIR/Recovered"

xcrun --sdk iphonesimulator clang \
  -fobjc-arc \
  -arch arm64 \
  -isysroot "$SDK_PATH" \
  -mios-simulator-version-min=15.0 \
  -framework CoreGraphics \
  -framework Foundation \
  -framework UIKit \
  -framework WebKit \
  "$SOURCES_DIR/main.m" \
  "$SOURCES_DIR/AppDelegate.m" \
  "$SOURCES_DIR/SceneDelegate.m" \
  "$SOURCES_DIR/WebViewController.m" \
  -o "$APP_DIR/$APP_NAME"

if ! xcrun simctl install "$BOOTED_UDID" "$APP_DIR" >/dev/null 2>&1; then
  xcrun simctl uninstall "$BOOTED_UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl install "$BOOTED_UDID" "$APP_DIR"
fi
xcrun simctl launch --terminate-running-process "$BOOTED_UDID" "$BUNDLE_ID"

echo "Installed $BUNDLE_ID to simulator $BOOTED_UDID"
