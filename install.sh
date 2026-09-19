#!/usr/bin/env bash
# BuddyUsage installer for macOS.
#   curl -fsSL https://raw.githubusercontent.com/SmtTheSE/BuddyUsage/main/install.sh | bash
# Downloads the latest release DMG for this Mac's CPU, copies the app to
# /Applications, strips the quarantine flag (the build is unsigned), and
# launches it.
set -euo pipefail

REPO="SmtTheSE/BuddyUsage"
APP="BuddyUsage"
VERSION="${BUDDYUSAGE_VERSION:-latest}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "BuddyUsage currently ships macOS builds only. See https://github.com/$REPO/releases" >&2
  exit 1
fi

case "$(uname -m)" in
  arm64) ARCH="arm64" ;;
  x86_64) ARCH="x64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

if [[ "$VERSION" == "latest" ]]; then
  URL="https://github.com/$REPO/releases/latest/download/$APP-$ARCH.dmg"
else
  URL="https://github.com/$REPO/releases/download/$VERSION/$APP-$ARCH.dmg"
fi

WORK="$(mktemp -d -t buddyusage)"
MOUNT="$WORK/mnt"
trap 'hdiutil detach "$MOUNT" -quiet >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

echo "Downloading $APP ($ARCH, $VERSION)…"
curl -fL --progress-bar "$URL" -o "$WORK/$APP.dmg"

echo "Mounting…"
hdiutil attach "$WORK/$APP.dmg" -nobrowse -quiet -mountpoint "$MOUNT"

echo "Installing to /Applications/$APP.app…"
rm -rf "/Applications/$APP.app"
cp -R "$MOUNT/$APP.app" "/Applications/$APP.app"
# Unsigned build: without this, Gatekeeper reports the app as "damaged".
xattr -dr com.apple.quarantine "/Applications/$APP.app"

echo "Done. Launching $APP…"
open -a "$APP"
