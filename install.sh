#!/usr/bin/env bash
# BuddyUsage installer for macOS and Linux.
#   curl -fsSL https://raw.githubusercontent.com/SmtTheSE/BuddyUsage/main/install.sh | bash
# Windows: see install.ps1.
set -euo pipefail

REPO="SmtTheSE/BuddyUsage"
APP="BuddyUsage"
VERSION="${BUDDYUSAGE_VERSION:-latest}"

case "$(uname -m)" in
  arm64|aarch64) ARCH="arm64"; LINUX_ARCH="arm64" ;;
  x86_64|amd64) ARCH="x64"; LINUX_ARCH="x86_64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

asset_url() {
  if [[ "$VERSION" == "latest" ]]; then
    echo "https://github.com/$REPO/releases/latest/download/$1"
  else
    echo "https://github.com/$REPO/releases/download/$VERSION/$1"
  fi
}

WORK="$(mktemp -d -t buddyusage.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

case "$(uname -s)" in
  Darwin)
    MOUNT="$WORK/mnt"
    echo "Downloading $APP ($ARCH, $VERSION)…"
    curl -fL --progress-bar "$(asset_url "$APP-$ARCH.dmg")" -o "$WORK/$APP.dmg"
    echo "Mounting…"
    hdiutil attach "$WORK/$APP.dmg" -nobrowse -quiet -mountpoint "$MOUNT"
    echo "Installing to /Applications/$APP.app…"
    rm -rf "/Applications/$APP.app"
    cp -R "$MOUNT/$APP.app" "/Applications/$APP.app"
    hdiutil detach "$MOUNT" -quiet
    # Unsigned build: without this, Gatekeeper reports the app as "damaged".
    xattr -dr com.apple.quarantine "/Applications/$APP.app"
    echo "Done. Launching $APP…"
    open -a "$APP"
    ;;
  Linux)
    DEST="${HOME}/.local/bin/$APP.AppImage"
    mkdir -p "$(dirname "$DEST")"
    echo "Downloading $APP ($ARCH, $VERSION)…"
    curl -fL --progress-bar "$(asset_url "$APP-$LINUX_ARCH.AppImage")" -o "$DEST"
    chmod +x "$DEST"
    echo "Installed to $DEST (add ~/.local/bin to PATH if it isn't). Launching…"
    nohup "$DEST" >/dev/null 2>&1 &
    ;;
  *)
    echo "Unsupported OS: $(uname -s). On Windows run install.ps1." >&2
    exit 1
    ;;
esac
