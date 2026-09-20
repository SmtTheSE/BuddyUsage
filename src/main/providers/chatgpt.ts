import type { WebContents } from 'electron'
import type { UsageMetric } from '@shared/types'
import { defaultExtractRaw, defaultIsLoggedIn, type ProviderDefinition } from './types'
import { parseUsageText, type MetricSpec, type ParsedUsage } from './parseHeuristics'

/**
 * ChatGPT itself publishes no usage meter — OpenAI only tells you when
 * you've hit a limit. The one meter attached to a ChatGPT account is the
 * Codex one (rolling 5-hour and weekly windows, drawn from the same plan),
 * so that is what this provider reads.
 *
 * The Codex usage page is rendered from a JSON endpoint that the Codex CLI
 * also uses for `/status` (`backend-client` in openai/codex:
 * `GET /backend-api/wham/usage`). Reading that endpoint from inside the
 * signed-in window gives the exact percentages and reset timestamps with
 * no dependency on how the page words or lays out its numbers. The page
 * text stays as a fallback should the endpoint ever move.
 */
const metrics: MetricSpec[] = [
  {
    id: 'session',
    labels: ['5-hour usage limit', '5-hour limit', 'Current session'],
    displayLabel: '5-hour limit'
  },
  { id: 'weekly', labels: ['Weekly usage limit', 'Weekly limit', 'Weekly'], displayLabel: 'Weekly limit' }
]

/** Separates the JSON reading from the page text that follows it in `raw`. */
export const CODEX_USAGE_MARKER = '__buddyusage_codex_usage__'

/** Runs in the page: the web app's own session token, then the usage endpoint. Empty string on any failure. */
const FETCH_USAGE_JS = `(async () => {
  try {
    const session = await fetch('/api/auth/session', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null))
    const token = session && session.accessToken
    if (!token) return ''
    const headers = { Authorization: 'Bearer ' + token }
    const accountId = session.account && session.account.id
    if (accountId) headers['ChatGPT-Account-Id'] = accountId
    const res = await fetch('/backend-api/wham/usage', { credentials: 'include', headers })
    if (!res.ok) return ''
    return ${JSON.stringify(CODEX_USAGE_MARKER)} + JSON.stringify(await res.json())
  } catch (e) {
    return ''
  }
})()`

interface CodexWindow {
  used_percent?: number
  limit_window_seconds?: number
  reset_after_seconds?: number
  reset_at?: number
}

interface CodexUsageResponse {
  plan_type?: string
  rate_limit?: {
    allowed?: boolean
    limit_reached?: boolean
    primary_window?: CodexWindow | null
    secondary_window?: CodexWindow | null
  } | null
}

const PLAN_NAMES: Record<string, string> = {
  free: 'Free',
  go: 'Go',
  plus: 'Plus',
  pro: 'Pro',
  team: 'Team',
  business: 'Business',
  enterprise: 'Enterprise',
  edu: 'Edu'
}

/** "at 10:18 PM" today, otherwise "Sep 24 at 12:00 AM" — mirrors how the page words it. */
export function resetLabelFor(resetAt: Date, now: Date): string {
  const time = resetAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const sameDay = resetAt.toDateString() === now.toDateString()
  if (sameDay) return `at ${time}`
  const day = resetAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${day} at ${time}`
}

function windowMetric(id: string, label: string, win: CodexWindow | null | undefined, now: Date): UsageMetric | undefined {
  if (!win || typeof win.used_percent !== 'number' || !Number.isFinite(win.used_percent)) return undefined
  const metric: UsageMetric = {
    id,
    label,
    percentUsed: Math.round(Math.min(100, Math.max(0, win.used_percent)))
  }
  const resetSeconds =
    typeof win.reset_at === 'number'
      ? win.reset_at
      : typeof win.reset_after_seconds === 'number'
        ? now.getTime() / 1000 + win.reset_after_seconds
        : undefined
  if (resetSeconds !== undefined && Number.isFinite(resetSeconds)) {
    const resetAt = new Date(resetSeconds * 1000)
    metric.resetsAt = resetAt.toISOString()
    metric.resetLabel = resetLabelFor(resetAt, now)
  }
  return metric
}

/** Exported for tests. `now` defaults to the wall clock. */
export function parseCodexUsageJson(json: string, now = new Date()): ParsedUsage | undefined {
  let data: CodexUsageResponse
  try {
    data = JSON.parse(json)
  } catch {
    return undefined
  }
  if (!data || typeof data !== 'object') return undefined

  const planLabel = data.plan_type ? (PLAN_NAMES[data.plan_type.toLowerCase()] ?? data.plan_type) : undefined
  const limits = data.rate_limit
  const parsed: UsageMetric[] = []
  const primary = windowMetric('session', '5-hour limit', limits?.primary_window, now)
  const secondary = windowMetric('weekly', 'Weekly limit', limits?.secondary_window, now)
  if (primary) parsed.push(primary)
  if (secondary) parsed.push(secondary)

  // The endpoint answered, so this is the whole story even when a plan
  // exposes only one window — no need to keep re-reading the page.
  return { planLabel, metrics: parsed, complete: true }
}

async function extractRaw(contents: WebContents): Promise<string> {
  const text = await defaultExtractRaw(contents)
  const fromApi: string = await contents.executeJavaScript(FETCH_USAGE_JS).catch(() => '')
  return fromApi ? `${fromApi}\n${text}` : text
}

function parse(raw: string): ParsedUsage | undefined {
  if (raw.startsWith(CODEX_USAGE_MARKER)) {
    const newline = raw.indexOf('\n')
    const json = raw.slice(CODEX_USAGE_MARKER.length, newline === -1 ? undefined : newline)
    const fromApi = parseCodexUsageJson(json)
    if (fromApi) return fromApi
    raw = newline === -1 ? '' : raw.slice(newline + 1)
  }
  return parseUsageText(raw, metrics)
}

export const chatgptProvider: ProviderDefinition = {
  id: 'chatgpt',
  name: 'ChatGPT',
  color: '#10A37F',
  usageUrl: 'https://chatgpt.com/codex/settings/usage',
  loginUrl: 'https://chatgpt.com/auth/login',
  sessionPartition: 'persist:chatgpt',
  metrics,
  activityPaths: ['.codex/sessions'],
  freeTierNote:
    'ChatGPT does not publish a usage meter for chat — it tells you when a limit is reached. Codex limits appear here on plans that include Codex.',
  isLoggedIn: defaultIsLoggedIn,
  extractRaw,
  parse
}
