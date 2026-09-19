# BuddyUsage

**Website & install guide:** https://smtthese.github.io/BuddyUsage/

A small island, docked to the edge of your screen, that shows how much
of your **Claude**, **ChatGPT / Codex**, **Gemini**, **Cursor** and **GitHub Copilot** plan you've used —
without alt-tabbing into each provider's website.

One ring per assistant, coloured by how close you are to the limit. Hover a
ring for the detailed breakdown (session limit, weekly limit, when each
resets). Right-click for sign-in, refresh, dashboard, settings.

## Install

Builds ship for **macOS** (Apple Silicon + Intel), **Windows** (x64 + ARM64)
and **Linux** (x64 + ARM64). BuddyUsage is open source (MIT) and its builds
are not notarized with a paid Apple Developer ID, so pick the path that suits
you:

### macOS

**Installer script — no security prompt at all:**

```bash
curl -fsSL https://raw.githubusercontent.com/SmtTheSE/BuddyUsage/main/install.sh | bash
```

**Homebrew — one prompt on first launch, easy upgrades:**

```bash
brew tap SmtTheSE/buddyusage https://github.com/SmtTheSE/BuddyUsage
brew trust SmtTheSE/buddyusage
brew install --cask buddyusage
```

Upgrades: `brew upgrade --cask buddyusage`. (Homebrew 5 removed its
`--no-quarantine` flag, so this path shows the same one-time prompt as the
DMG below.)

**DMG — one prompt on first launch:**
[Apple Silicon](https://github.com/SmtTheSE/BuddyUsage/releases/latest/download/BuddyUsage-arm64.dmg) ·
[Intel](https://github.com/SmtTheSE/BuddyUsage/releases/latest/download/BuddyUsage-x64.dmg).
Drag to Applications; the DMG window itself shows the steps. On first
launch macOS says it *"could not verify"* the app → **System Settings →
Privacy & Security → Open Anyway** (older macOS: right-click → Open). Once.

### Windows

[x64 installer](https://github.com/SmtTheSE/BuddyUsage/releases/latest/download/BuddyUsage-x64.exe) ·
[ARM64 installer](https://github.com/SmtTheSE/BuddyUsage/releases/latest/download/BuddyUsage-arm64.exe),
or in PowerShell:

```powershell
irm https://raw.githubusercontent.com/SmtTheSE/BuddyUsage/main/install.ps1 | iex
```

SmartScreen may show *"Windows protected your PC"* → **More info → Run
anyway** (once).

### Linux

[x86_64 AppImage](https://github.com/SmtTheSE/BuddyUsage/releases/latest/download/BuddyUsage-x86_64.AppImage) ·
[ARM64 AppImage](https://github.com/SmtTheSE/BuddyUsage/releases/latest/download/BuddyUsage-arm64.AppImage),
or `curl -fsSL …/install.sh | bash` as above. Make it executable and run.

### Why the macOS prompt exists, and how to remove it

Gatekeeper flags any browser download that isn't notarized by Apple, and
notarization requires a paid Apple Developer ID — there is no open-source
workaround for a browser download, and Homebrew now quarantines casks too.
The one prompt-free route is the installer script, which downloads without
a browser and clears the flag itself. If a Developer ID becomes
available, see [Signed releases](#signed-releases-no-security-prompts) —
the pipeline notarizes automatically and the DMG prompt disappears too.
For Windows, [SignPath Foundation](https://signpath.org/foundation) signs
open-source projects for free; the workflow accepts a standard `.pfx` via
`WIN_CSC_LINK` once one is issued.

**CLI** (reads the same data the app collects, works even when the app isn't running):

```bash
npm install -g github:SmtTheSE/BuddyUsage
buddyusage            # usage table for every provider
buddyusage --json     # machine-readable
buddyusage install    # download + install the latest release
buddyusage open       # launch the app
```

## First run

Click a ring → **Sign in** (or use the menu-bar icon → Sign in). A real
browser window opens on that provider's own login page. Sessions are kept
in an isolated, persistent partition per provider, so you do this once.

Drag the island anywhere — it snaps to the nearest screen edge and remembers
the spot. Hover it for the `›` handle to collapse it into a slim tab.

## What each plan can show

BuddyUsage reads exactly what each provider publishes, so free plans see
honest states rather than errors:

| Provider | Paid plans | Free plan |
| --- | --- | --- |
| **Claude** (claude.ai → Settings → Usage) | Current session + weekly limits with reset times | Anthropic publishes no percentages; the ring shows **Free** and the card explains — the app tells you when you hit the limit |
| **ChatGPT** (chatgpt.com → Codex → Usage) | Codex 5-hour + weekly limits (ChatGPT chat itself has no meter on any plan) | Same note; Codex limits appear on plans that include Codex |
| **Gemini** (gemini.google.com → Settings → Usage limits) | Current usage + weekly limit with resets | **Real gauges** — Google shows the panel for every plan |
| **Cursor** (cursor.com → Dashboard → Usage) · off by default | Included usage per model pool in dollars, monthly reset | Hobby plan shows included usage once used |
| **GitHub Copilot** (github.com → Settings → Billing → Metered usage) · off by default | AI Credits used of included (legacy plans: premium requests), monthly reset | Copilot Free shows metered usage once there is any |

## Updates

BuddyUsage checks GitHub Releases on launch and every few hours. When a
new version exists you get a system notification, a blue dot on the island,
an **Update** button in every card, and **Update to x.y.z…** in the menu-bar
menu. One click downloads the right build for your machine and installs it
in place — the app restarts on the new version. No terminal, no hunting for
files; a **Download ↗** link to the release page is always there as a fallback.

This is built in rather than using Electron's stock auto-updater because
that one refuses to install on macOS without a Developer ID signature.

## Staying current without clicking Refresh

The gauges are meant to be glanced at, not poked. Every sync path funnels
into one deduplicated fetch per provider, so nothing ever double-hits a
site:

| Trigger | When |
| --- | --- |
| Poll | Every 3 min by default (1–60 in Settings), staggered per provider |
| You use a tool | The CLI's local session dir changes (`~/.claude/projects`, `~/.codex/sessions`, `~/.gemini/tmp`) → re-sync ~15 s later, at most once a minute while active |
| A limit resets | "Resets in 51 min" / "at 7:07 PM" / "Sep 22 at 11:07 PM" is parsed and a re-sync is scheduled just after, so the ring drops to 0% on its own |
| Wake from sleep | Everything re-syncs a few seconds after resume |
| You open a card | If its data is older than 45 s it quietly refreshes, showing "Updating…" inline |

## Why it works this way

CLI coding assistants don't expose a unified usage API. The only place to
check "how much of my limit is left" is each provider's account **Settings →
Usage** page. BuddyUsage keeps a hidden, logged-in browser window per
provider, reads that page on a schedule, and renders the numbers.

## Architecture

- **Island window** (`src/main/windows/islandWindow.ts`): a frameless,
  transparent, always-on-top, non-activating panel docked to the screen
  edge. Only the island and its popover catch the mouse; empty space passes
  clicks through to whatever is underneath.
- **Provider plugins** (`src/main/providers/`): every assistant implements
  `ProviderDefinition` (URLs, session partition, expected limit windows,
  login check, extract, parse). `registry.ts` is the single list —
  **adding an assistant is one file + one line**.
- **Parsing** (`parseHeuristics.ts`): matches on the *words* a usage page
  uses ("Current session", "Resets in 51 min", "73%") rather than CSS
  selectors, because wording survives redesigns far better than markup.
  Fully unit-tested against page fixtures (`npm test`).
- **Scraping** (`src/main/scraping/`): one hidden persistent-session window
  per provider, staggered polling, a hard per-fetch timeout, and a
  never-throws contract — every failure becomes a well-formed snapshot
  (`ok` / `stale` / `error` / `logged_out`) that keeps the last good numbers
  on screen.
- **Persistence** (`src/main/store/`): schema-versioned settings and usage
  cache via `electron-store`. The CLI reads the cache file directly.
- **IPC**: one channel registry (`src/shared/types.ts`), one typed
  `window.buddyUsage` bridge (`src/preload/index.ts`); the renderer never
  touches Node or Electron.

## Develop

```bash
npm install
npm run dev          # launches the app with hot reload
npm test             # parser unit tests
npm run typecheck
npm run build:mac    # unsigned .dmg + .zip in release/ (--win / --linux likewise)
```

Open http://localhost:5173/#island in a normal browser while `npm run dev`
is running to iterate on the UI with mock data (no Electron needed).

### Releasing

Push a tag and GitHub Actions builds macOS, Windows and Linux (x64 + ARM64)
and attaches them to a GitHub Release, which is what the install links above
point at. The release page gets plain-language install steps from
`.github/release-notes.md`.

```bash
npm version patch   # bumps package.json + creates the tag
git push --follow-tags
```

### Signed releases (no security prompts)

Apple and Microsoft only let an app open with zero warnings if it's signed
by a registered developer — there is no workaround for end users. The
pipeline is already wired for it; add these repository secrets
(**Settings → Secrets and variables → Actions**) and the next tagged release
is signed and notarized automatically:

| Secret | What it is |
| --- | --- |
| `CSC_LINK` | Base64 of a **Developer ID Application** `.p12` exported from Keychain (`base64 -i cert.p12 \| pbcopy`) — needs an [Apple Developer Program](https://developer.apple.com/programs/) membership |
| `CSC_KEY_PASSWORD` | The `.p12` password |
| `APPLE_ID` | The Apple ID of the developer account |
| `APPLE_APP_SPECIFIC_PASSWORD` | An [app-specific password](https://support.apple.com/102654) for that Apple ID |
| `APPLE_TEAM_ID` | The 10-character team ID from the developer account |
| `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` | Base64 `.pfx` code-signing certificate + password (Windows, optional) |

Without these, macOS builds are ad-hoc signed (valid but unverified → one
"Open Anyway" prompt) and Windows builds are unsigned (one SmartScreen prompt).

### Adding a provider

1. Create `src/main/providers/<id>.ts` — copy `claude.ts`, set the URLs,
   session partition and the labels of the limit windows its page shows.
2. Add it to `src/main/providers/registry.ts`.
3. (Optional) add a mark in `src/renderer/src/components/ProviderIcon.tsx`;
   otherwise the first letter is shown.

## Known limitations

- **Scraping is brittle by nature.** If a provider rewords its usage page,
  parsing can fail; the popover then shows a clear message and the last
  extracted text is kept in the cache (`buddyusage --json`) to make fixing
  the label list quick.
- **Security prompt on first launch** until the release is signed — see
  [Signed releases](#signed-releases-no-security-prompts).
- **Best tested on macOS.** Windows and Linux builds ship from the same
  code; the island docks to the edge of the primary display's work area on
  every platform, but Linux transparency/click-through depends on the
  compositor (see Install).
