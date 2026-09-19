## Download

| Your computer | Download |
| --- | --- |
| Mac with Apple Silicon (M1/M2/M3/M4) | **BuddyUsage-arm64.dmg** |
| Mac with Intel | **BuddyUsage-x64.dmg** |
| Windows (Intel/AMD) | **BuddyUsage-x64.exe** |
| Windows on ARM | **BuddyUsage-arm64.exe** |
| Linux (x86_64) | **BuddyUsage-x86_64.AppImage** |
| Linux (ARM64) | **BuddyUsage-arm64.AppImage** |

Not sure which Mac you have? Click the Apple menu → **About This Mac**: "Apple M…" means Apple Silicon, "Intel" means Intel.

## Install on Mac

**Prefer no security prompt at all?** Paste this into Terminal (Applications → Utilities → Terminal) and press Return:

```
curl -fsSL https://raw.githubusercontent.com/SmtTheSE/BuddyUsage/main/install.sh | bash
```

**Homebrew users:** `brew tap SmtTheSE/buddyusage https://github.com/SmtTheSE/BuddyUsage && brew trust SmtTheSE/buddyusage && brew install --cask buddyusage`

**Or the DMG:**

1. Open the downloaded `.dmg` and drag **BuddyUsage** onto **Applications**.
2. Open **Applications** and double-click **BuddyUsage**.
3. If your Mac says it **"could not verify"** the app or that it's from an **unidentified developer**:
   - Click **Done** (or **Cancel**).
   - Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to BuddyUsage.
   - Confirm with your password or Touch ID. This only happens the first time.

   On older macOS versions, right-click (or Control-click) BuddyUsage in Applications and choose **Open**, then **Open** again.

BuddyUsage runs as a small glass island on the edge of your screen (drag it anywhere — it snaps to the nearest edge) plus an icon in the menu bar. Click a ring → **Sign in** to connect each assistant. Free plans are supported: where a provider publishes no meter, the card says so instead of showing an error.

## Install on Windows

1. Run the downloaded `.exe`. It installs for your user only (no admin prompt) and starts automatically.
2. If Windows shows **"Windows protected your PC"**, click **More info → Run anyway**.

## Install on Linux

Make the AppImage executable (right-click → Properties → "Allow executing as program", or `chmod +x`), then double-click it.
