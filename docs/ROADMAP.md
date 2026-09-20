# BuddyUsage roadmap

Where the app goes after "see your limits": from a gauge to the place you
**watch, budget and steer** the agents that spend those limits. Every item
lists what it builds on, how precise it can be, and a rough effort so the
cheap, high-value work ships first.

Effort: **S** = a day or less, **M** = a few days, **L** = a week or more.

---

## 1. Agent control (local, precise, no cloud)

### 1.1 Live agent presence — S
Show which assistants are *running right now*: a pulsing ring, "2 sessions
active", and the project each one is in.
- **Builds on:** the fs watchers already in `scheduler.ts` plus a process
  scan for `claude`, `codex`, `gemini` (`ps` / `tasklist`), with the
  working directory from `lsof` / the session file path.
- **Precision:** exact — the process either exists or it doesn't.

### 1.2 Stop button — S
A **Stop** on each active session card. Sends the same interrupt as
Ctrl-C (`SIGINT`) so the CLI stops the current turn cleanly; **Force quit**
sends `SIGTERM` / `taskkill`. Confirmation on force only.
- **Builds on:** 1.1.
- **Precision:** exact for CLI agents. Web chats (chatgpt.com, claude.ai
  in a browser) cannot be stopped from outside; say so in the UI rather
  than pretend.

### 1.3 Limit guard (auto-stop) — S
"Pause my agents when a limit passes N%." When the guard trips, BuddyUsage
interrupts running sessions, notifies, and offers **Resume** after the
reset. Per provider, off by default.
- **Builds on:** 1.2 + the thresholds we already colour rings with.
- **Why it sells:** it is the one thing no provider offers — protection
  against an agent looping through your whole week overnight.

### 1.4 "Waiting for you" badge — M
CLI agents stall silently when they need a permission click or finish a
task while you are in another window. BuddyUsage installs a hook so the
island shows **Claude is waiting** / **Codex finished** with a click to
jump to that terminal.
- **Builds on:** Claude Code hooks (`Notification`, `Stop` in
  `~/.claude/settings.json`) and Codex's `notify` config; both can run a
  command that pings a local socket the app listens on. Gemini CLI once it
  exposes hooks.
- **Precision:** exact, event-driven, zero polling.

### 1.5 Nudge box — M
A one-line message box on a session card: "use Sonnet for the rest",
"stop after this file", "write the tests too". Sends the text as a
follow-up to that session and shows the short reply inline.
- **How, honestly:** we cannot type into a terminal owned by the user's
  Terminal/iTerm/Windows Terminal reliably. What *is* precise:
  `claude -p --resume <session-id> "<text>"` continues that conversation
  headlessly; Codex's app-server protocol (JSON-RPC over stdio) accepts
  user messages and turn interrupts for sessions it owns; Gemini CLI has
  `--resume`. The nudge targets the most recent session for that provider
  (session ids come from the same dirs we already watch).
- **Scope note:** the reply appears in BuddyUsage, and the user's terminal
  sees it on next resume. Clear about that in the UI.

### 1.6 Remote glance and kill switch (phone) — L
Scan a QR code, open a page on your phone: rings, active sessions, Stop,
Nudge. Two tiers:
- **LAN only (first)** — a small local HTTP server in the main process,
  pairing token in the QR, no accounts, no cloud. M on its own.
- **Anywhere (later)** — an optional relay (or the user's own Tailscale /
  ngrok URL). Only then does it need infrastructure.

---

## 2. Budgeting: turn a percentage into a decision

### 2.1 Burn rate and forecast — M
Keep every reading (we already fetch every 3 min). From the slope: "At
this pace the 5-hour window empties in 1 h 20 m" and, the useful one,
"You'll reset with ~60% unused." A tiny sparkline in the card.
- **Precision:** an estimate; label it as one. Improves as history grows.

### 2.2 Daily budget — S (after 2.1)
"Weekly resets Thursday. 55% left over 2.5 days → about 22% per day."
Shown as a thin marker on the ring so you can see whether you are ahead
of or behind pace.

### 2.3 Threshold alerts and reset alerts — S
System notification at 80 / 95 / 100%, and "Weekly limit reset — you are
at 0%". Snooze per provider. Costs nothing; people ask for it first.

### 2.4 "Where did my week go" — M
Claude Code and Codex write every session to disk with token counts and
model names. Read them (local, no network) and show usage **per project
and per model** for the current window: "web-app 48%, infra 21%, Opus
70% of that." No provider shows this.

### 2.5 Model advice — S (after 2.4)
When Opus is near its weekly cap but Sonnet is not, say so in the card:
"Opus 92% · Sonnet 31% — switch with `/model sonnet`". Pure text, huge
saving for Max users.

---

## 3. More sources

### 3.1 API-key spend — M
Optional providers for the Anthropic Console, OpenAI Platform and Google
AI Studio billing pages: month-to-date dollars against a budget the user
sets. Same scraping pattern; API keys never touch the app.

### 3.2 More assistants — S each
Windsurf, Amp, Kiro, JetBrains AI, Copilot in VS Code: each is one file
in `providers/` (the plugin pattern exists for exactly this).

### 3.3 Multiple accounts per provider — M
Work and personal Claude in one island: a second session partition and a
label. Common with people on a Team plan plus their own Max.

---

## 4. Everyday polish that widens the audience

- **Global shortcut** to show/hide or expand the island — S.
- **Menu-bar / taskbar compact mode**: just the numbers, no island — S.
- **Focus mode**: hide until any ring passes the warn threshold — S.
- **Weekly summary** notification on reset day: "Used 78% of Claude, 20%
  of ChatGPT; heaviest project: web-app" — S after 2.4.
- **Team webhooks**: post limit events to Slack / Discord — S; lets a lead
  see when the team's Claude seats are running dry.
- **Windows first-class**: signed installer (SignPath is free for OSS),
  taskbar-flyout position, acrylic instead of Liquid Glass tokens — M.

---

## Suggested order

1. **Alerts (2.3), presence (1.1), Stop (1.2), limit guard (1.3)** — one
   short cycle, all exact, and together they make the "agent babysitter"
   story real.
2. **Waiting-for-you hook (1.4)** and **per-project usage (2.4)** — the
   two features people will screenshot.
3. **Forecast (2.1) + budget (2.2) + model advice (2.5)**.
4. **Nudge (1.5)**, then **LAN remote (1.6)**.
5. Sources and polish as demand shows.

## Non-goals (so the app stays honest)

- Typing into someone's live terminal window. Brittle on every OS; the
  nudge uses each CLI's own resume/protocol instead.
- Stopping a web chat tab from outside the browser.
- Any feature that needs the user's provider password or API key stored
  in BuddyUsage. Sign-in stays in the provider's own page, as today.
