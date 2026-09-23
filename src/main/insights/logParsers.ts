/**
 * Pure line → usage-event parsers for the transcripts each CLI writes.
 * Kept separate from the scanner so they can be unit-tested against real
 * captured lines: this is the only place that knows a provider's log shape.
 */

export interface TokenCounts {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
  /** Assistant turns folded into these counts. */
  turns: number
}

export interface UsageEvent {
  providerId: string
  /** ISO timestamp of the turn. */
  at: string
  /** Project directory the turn ran in, when the line says. */
  cwd?: string
  model?: string
  tokens: TokenCounts
}

export const EMPTY_TOKENS: TokenCounts = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, turns: 0 }

function sum(...values: (number | undefined)[]): number {
  return values.reduce((acc: number, v) => acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0), 0)
}

/** Cheap pre-filter so 99% of lines never reach JSON.parse. */
export function mayHoldUsage(providerId: string, line: string): boolean {
  return providerId === 'chatgpt' ? line.includes('"token_count"') : line.includes('"usage"')
}

/**
 * Claude Code: one JSON object per line; assistant turns carry
 * `message.usage` (with cache buckets), `message.model`, `cwd`, `timestamp`.
 * Sidechain lines are sub-agent turns — real usage, so they count.
 */
export function parseClaudeLine(line: string): UsageEvent | undefined {
  let data: Record<string, any>
  try {
    data = JSON.parse(line)
  } catch {
    return undefined
  }
  const usage = data?.message?.usage
  if (data?.type !== 'assistant' || !usage) return undefined
  const input = sum(usage.input_tokens)
  const output = sum(usage.output_tokens)
  const cacheWrite = sum(usage.cache_creation_input_tokens)
  const cacheRead = sum(usage.cache_read_input_tokens)
  const total = input + output + cacheWrite + cacheRead
  if (total === 0) return undefined
  return {
    providerId: 'claude',
    at: typeof data.timestamp === 'string' ? data.timestamp : new Date().toISOString(),
    cwd: typeof data.cwd === 'string' ? data.cwd : undefined,
    model: typeof data.message.model === 'string' ? data.message.model : undefined,
    tokens: { input, output, cacheRead, cacheWrite, total, turns: 1 }
  }
}

/**
 * Codex: `token_count` events carry a running *total* for the session, so
 * each one is turned into the delta since the previous event of that file
 * by the scanner. `last_token_usage` exists but is missing on resumed
 * sessions, so the cumulative figure is the reliable source.
 */
export function parseCodexLine(line: string): (UsageEvent & { cumulative: true }) | undefined {
  let data: Record<string, any>
  try {
    data = JSON.parse(line)
  } catch {
    return undefined
  }
  const info = data?.payload?.type === 'token_count' ? data.payload.info : undefined
  const totals = info?.total_token_usage
  if (!totals) return undefined
  const input = sum(totals.input_tokens) - sum(totals.cached_input_tokens)
  const cacheRead = sum(totals.cached_input_tokens)
  const cacheWrite = sum(totals.cache_write_input_tokens)
  const output = sum(totals.output_tokens)
  return {
    providerId: 'chatgpt',
    at: typeof data.timestamp === 'string' ? data.timestamp : new Date().toISOString(),
    model: undefined,
    tokens: {
      input: Math.max(0, input),
      output,
      cacheRead,
      cacheWrite,
      total: sum(totals.total_tokens) || Math.max(0, input) + output + cacheRead + cacheWrite,
      turns: 1
    },
    cumulative: true
  }
}

/** Header line of a Codex rollout: where the session ran and which model it used. */
export function parseCodexMeta(line: string): { cwd?: string; model?: string; subagent: boolean } | undefined {
  let data: Record<string, any>
  try {
    data = JSON.parse(line)
  } catch {
    return undefined
  }
  if (data?.type !== 'session_meta') return undefined
  const payload = data.payload ?? {}
  return {
    cwd: typeof payload.cwd === 'string' ? payload.cwd : undefined,
    model: typeof payload.model === 'string' ? payload.model : undefined,
    subagent: payload.thread_source === 'subagent'
  }
}

/** Difference between two cumulative readings, ignoring resets to a lower value. */
export function tokenDelta(current: TokenCounts, previous: TokenCounts | undefined): TokenCounts {
  if (!previous) return current
  const delta = {
    input: current.input - previous.input,
    output: current.output - previous.output,
    cacheRead: current.cacheRead - previous.cacheRead,
    cacheWrite: current.cacheWrite - previous.cacheWrite,
    total: current.total - previous.total,
    turns: 1
  }
  return delta.total < 0 ? current : delta
}

export function addTokens(a: TokenCounts, b: TokenCounts): TokenCounts {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    total: a.total + b.total,
    turns: a.turns + b.turns
  }
}

/** "claude-sonnet-5" → "Sonnet 5"; "gpt-5.6-sol" → "GPT-5.6"; unknown ids pass through. */
export function prettyModel(model: string | undefined): string {
  if (!model) return 'Unknown'
  // "claude-opus-5" → Opus 5, but the date suffix in
  // "claude-3-5-haiku-20241022" is not a version.
  const known = /(opus|sonnet|haiku)[- ]?(\d(?:\.\d+)?)?(?![\d.])/i.exec(model)
  if (known) {
    const name = known[1][0].toUpperCase() + known[1].slice(1).toLowerCase()
    return known[2] ? `${name} ${known[2]}` : name
  }
  const gpt = /gpt[- ]?([\d.]+)/i.exec(model)
  if (gpt) return `GPT-${gpt[1]}`
  const gemini = /gemini[- ]?([\d.]+)?[- ]?(pro|flash|ultra)?/i.exec(model)
  if (gemini && (gemini[1] || gemini[2])) {
    return ['Gemini', gemini[1], gemini[2] && gemini[2][0].toUpperCase() + gemini[2].slice(1)].filter(Boolean).join(' ')
  }
  return model
}
