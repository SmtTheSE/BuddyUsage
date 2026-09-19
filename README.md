# BuddyUsage

A small macOS island, docked to the edge of your screen, that shows how much
of your **Claude Code**, **Codex CLI** and **Gemini CLI** plan you've used —
without alt-tabbing into each provider's website.

One ring per assistant, coloured by how close you are to the limit. Hover a
ring for the detailed breakdown (session limit, weekly limit, when each
resets). Right-click for sign-in, refresh, dashboard, settings.

## Install

**One-liner (macOS, Apple Silicon or Intel):**

```bash
curl -fsSL https://raw.githubusercontent.com/SmtTheSE/BuddyUsage/main/install.sh | bash
```

**Direct download:**

- Apple Silicon: https://github.com/SmtTheSE/BuddyUsage/releases/latest/download/BuddyUsage-arm64.dmg
- Intel: https://github.com/SmtTheSE/BuddyUsage/releases/latest/download/BuddyUsage-x64.dmg

The build is not signed with an Apple Developer ID, so macOS will call it
"damaged" on first launch unless the quarantine flag is removed. The
installer does that for you; if you download the DMG by hand:

```bash
xattr -dr com.apple.quarantine /Applications/BuddyUsage.app
```

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
npm run build:mac    # unsigned .dmg + .zip in release/
```

Open http://localhost:5173/#island in a normal browser while `npm run dev`
is running to iterate on the UI with mock data (no Electron needed).

### Releasing

Push a tag and GitHub Actions builds both architectures and attaches them to
a GitHub Release, which is what the install links above point at:

```bash
npm version patch   # bumps package.json + creates the tag
git push --follow-tags
```

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
- **Unsigned build.** See the quarantine note above. Set `identity`/notarize
  in `electron-builder.yml` if you have a Developer ID.
- **macOS only** for now — the island geometry assumes a macOS menu bar and
  the installer uses `hdiutil`. The core (providers, parsing, store, CLI) is
  platform-neutral.
