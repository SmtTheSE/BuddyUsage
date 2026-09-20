import type { UsageMetric } from '@shared/types'

/**
 * Text-pattern based extraction shared by every provider parser.
 *
 * Why regex-over-plain-text instead of CSS selectors: provider usage pages
 * redesign their markup far more often than they change the words they use
 * ("used", "of", "resets", "%"). Matching on visible text is slower to break
 * and degrades to a readable "couldn't parse" message instead of a silent
 * wrong number when it does.
 */

export interface ParsedUsage {
  planLabel?: string
  metrics: UsageMetric[]
}

/** A named limit window a provider's page is expected to show. */
export interface MetricSpec {
  id: string
  /** Case-insensitive phrases that introduce this window on the page. First match wins. */
  labels: string[]
  /** Display label used in the UI. */
  displayLabel: string
}

// Ordered most-specific first; "Go" only counts next to plan wording since
// it's an everyday word.
const KNOWN_PLANS: { label: string; pattern: RegExp }[] = [
  { label: 'Enterprise', pattern: /\bEnterprise\b/i },
  { label: 'Business', pattern: /\bBusiness\b/i },
  { label: 'Team', pattern: /\bTeam\b/i },
  { label: 'Ultra', pattern: /\bUltra\b/i },
  { label: 'Max', pattern: /\bMax\b/i },
  { label: 'Pro', pattern: /\bPro\b/i },
  { label: 'Plus', pattern: /\bPlus\b/i },
  { label: 'Go', pattern: /\b(?:ChatGPT\s+)?Go\b(?=\s*(?:plan|subscription))/i },
  { label: 'Free', pattern: /\bFree\b(?!\s*(?:trial|messages?\s+until))/i }
]

/** Matches "12 of 50 messages", "12/50 requests", "12 out of 50", "$3.20 of $15.00". */
const FRACTION_PATTERN = /([$€£]?)([\d,.]+)\s*(?:\/|of|out of)\s*([$€£]?)([\d,.]+)\s*([a-zA-Z%]+)?/i

/**
 * Matches a standalone percentage plus the word that says which way it
 * counts. Claude/Gemini say "73% used"; the Codex page says "84% left" —
 * the same number means the opposite thing, so the qualifier matters.
 */
const PERCENT_PATTERN = /(\d{1,3}(?:\.\d+)?)\s?%\s*(left|remaining|available|used|consumed)?/i

/**
 * Matches "Resets on March 3", "resets in 4 hours", "renews Thu 12:00 AM",
 * "Resets 10:18 PM". Captures the phrase after the verb verbatim
 * (preposition included) so the UI can render "Resets in 51 min" exactly as
 * the provider words it. The phrase must start like a time so a "Resets"
 * heading followed by unrelated copy ("Use a reset to restore…") is skipped.
 */
const RESET_PATTERN =
  /\b(?:resets?|renews?)\s+((?:\d|(?:in|on|at|every|tomorrow|today|tonight|midnight|noon|mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b)[^.\n]{0,40})/i

/** How much page text after a label is considered "its" section. */
const METRIC_WINDOW_CHARS = 160

function toNumber(raw: string): number {
  return Number(raw.replace(/,/g, ''))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** "5-hour limit" and "5 hour limit" are the same label; let hyphens and spaces match each other. */
function labelPattern(label: string): RegExp {
  const flexible = escapeRegExp(label).replace(/[\s-]+/g, '[\\s-]+')
  return new RegExp(`\\b${flexible}\\b`, 'i')
}

export function findPlanLabel(text: string): string | undefined {
  return KNOWN_PLANS.find((plan) => plan.pattern.test(text))?.label
}

/**
 * A signed-in page that offers an upgrade instead of a meter — what free
 * plans see on Claude and ChatGPT. Lets the UI say "Free plan, no meter"
 * rather than "couldn't read usage".
 */
const FREE_TIER_PATTERN =
  /\b(?:upgrade to (?:pro|plus|max|go|premium)|free plan|current plan:?\s*free|you(?:'re| are) on (?:the )?free)\b/i

export function looksFreeTier(text: string): boolean {
  return FREE_TIER_PATTERN.test(text)
}

export function findFraction(
  text: string
): Pick<UsageMetric, 'used' | 'limit' | 'unit' | 'percentUsed'> | undefined {
  const match = FRACTION_PATTERN.exec(text)
  if (!match) return undefined
  const used = toNumber(match[2])
  const limit = toNumber(match[4])
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return undefined
  const currency = match[1] || match[3]
  return {
    used,
    limit,
    unit: currency || match[5]?.toLowerCase(),
    percentUsed: Math.round((used / limit) * 100)
  }
}

/** Returns the percentage *used*, inverting "N% left" / "N% remaining" phrasing. */
export function findPercent(text: string): number | undefined {
  const match = PERCENT_PATTERN.exec(text)
  if (!match) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value)) return undefined
  const qualifier = match[2]?.toLowerCase()
  const remaining = qualifier === 'left' || qualifier === 'remaining' || qualifier === 'available'
  const used = remaining ? 100 - value : value
  return Math.round(Math.min(100, Math.max(0, used)))
}

export function findResetPhrase(text: string): string | undefined {
  const match = RESET_PATTERN.exec(text)
  return match?.[1]?.trim()
}

/**
 * Some providers (e.g. ChatGPT's anonymous landing page) never redirect to a
 * distinct /login URL for a logged-out visitor, so a URL-based check alone
 * misses them and would otherwise surface as a generic parse "error". This
 * catches the common auth-wall phrasing so it can be reported as
 * "sign in required" instead — still text-pattern based, not selector-based.
 */
const SIGNED_OUT_PATTERN = /\b(log ?in|sign ?in|sign ?up)\b.{0,30}\b(to|for)\b/i

export function looksSignedOut(text: string): boolean {
  return SIGNED_OUT_PATTERN.test(text)
}

/**
 * Finds each named limit window on the page: the first percentage (or
 * used/limit fraction) and reset phrase that appear within a short window
 * of text after the label.
 */
export function extractMetrics(text: string, specs: MetricSpec[]): UsageMetric[] {
  const normalized = text.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim()

  // Locate every known label first so each section can be bounded by the
  // next one — otherwise a label with no value would swallow its
  // neighbour's number.
  const found: { spec: MetricSpec; start: number; end: number }[] = []
  for (const spec of specs) {
    for (const label of spec.labels) {
      const match = labelPattern(label).exec(normalized)
      if (match) {
        found.push({ spec, start: match.index, end: match.index + match[0].length })
        break
      }
    }
  }
  found.sort((a, b) => a.start - b.start)

  const metrics: UsageMetric[] = []
  found.forEach((entry, index) => {
    const nextStart = found[index + 1]?.start ?? Number.POSITIVE_INFINITY
    const section = normalized.slice(entry.end, Math.min(nextStart, entry.end + METRIC_WINDOW_CHARS))
    const fraction = findFraction(section)
    const percent = fraction?.percentUsed ?? findPercent(section)
    if (percent === undefined) return

    metrics.push({
      id: entry.spec.id,
      label: entry.spec.displayLabel,
      percentUsed: percent,
      used: fraction?.used,
      limit: fraction?.limit,
      unit: fraction?.unit,
      resetLabel: findResetPhrase(section)
    })
  })

  // Keep the provider's declared order (primary metric first) regardless of
  // where the sections appear on the page.
  const order = new Map(specs.map((s, i) => [s.id, i]))
  return metrics.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

/**
 * Full parse: labeled windows first; if the page shows none of the expected
 * labels, fall back to the first usage-looking number anywhere so a plan
 * with a simpler page still produces a gauge. Returns `undefined` when
 * nothing recognizable was found, so callers report "couldn't parse" instead
 * of guessing.
 */
export function parseUsageText(text: string, specs: MetricSpec[] = []): ParsedUsage | undefined {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined

  const planLabel = findPlanLabel(normalized)
  const metrics = extractMetrics(text, specs)
  if (metrics.length > 0) return { planLabel, metrics }

  const fraction = findFraction(normalized)
  const percent = fraction?.percentUsed ?? findPercent(normalized)
  if (percent === undefined) return undefined

  return {
    planLabel,
    metrics: [
      {
        id: 'usage',
        label: 'Usage',
        percentUsed: percent,
        used: fraction?.used,
        limit: fraction?.limit,
        unit: fraction?.unit,
        resetLabel: findResetPhrase(normalized)
      }
    ]
  }
}
