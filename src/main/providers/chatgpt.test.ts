import { describe, expect, it } from 'vitest'
import { CODEX_USAGE_MARKER, chatgptProvider, parseCodexUsageJson, resetLabelFor } from './chatgpt'

// Shape of GET https://chatgpt.com/backend-api/wham/usage, as read by the
// Codex CLI's own `/status` (openai/codex → codex-rs/backend-client).
const NOW = new Date('2026-09-20T15:00:00')
const RESPONSE = {
  plan_type: 'plus',
  rate_limit: {
    allowed: true,
    limit_reached: false,
    primary_window: {
      used_percent: 0,
      limit_window_seconds: 18000,
      reset_after_seconds: 26280,
      reset_at: Math.floor(NOW.getTime() / 1000) + 26280
    },
    secondary_window: {
      used_percent: 16,
      limit_window_seconds: 604800,
      reset_after_seconds: 4 * 86400,
      reset_at: Math.floor(NOW.getTime() / 1000) + 4 * 86400
    }
  }
}

describe('parseCodexUsageJson', () => {
  it('reads both windows exactly, with reset times', () => {
    const parsed = parseCodexUsageJson(JSON.stringify(RESPONSE), NOW)
    expect(parsed?.planLabel).toBe('Plus')
    expect(parsed?.complete).toBe(true)
    expect(parsed?.metrics).toEqual([
      expect.objectContaining({ id: 'session', label: '5-hour limit', percentUsed: 0, resetLabel: 'at 10:18 PM' }),
      expect.objectContaining({ id: 'weekly', label: 'Weekly limit', percentUsed: 16, resetLabel: 'Sep 24 at 3:00 PM' })
    ])
    expect(parsed?.metrics[0].resetsAt).toBe(new Date(RESPONSE.rate_limit.primary_window.reset_at * 1000).toISOString())
  })

  it('an untouched account is 0% used, never 100%', () => {
    expect(parseCodexUsageJson(JSON.stringify(RESPONSE), NOW)?.metrics[0].percentUsed).toBe(0)
  })

  it('rounds and clamps fractional or out-of-range percentages', () => {
    const json = JSON.stringify({ rate_limit: { primary_window: { used_percent: 33.6 } } })
    expect(parseCodexUsageJson(json, NOW)?.metrics[0].percentUsed).toBe(34)
    const over = JSON.stringify({ rate_limit: { primary_window: { used_percent: 120 } } })
    expect(parseCodexUsageJson(over, NOW)?.metrics[0].percentUsed).toBe(100)
  })

  it('falls back to reset_after_seconds when reset_at is absent', () => {
    const json = JSON.stringify({ rate_limit: { primary_window: { used_percent: 5, reset_after_seconds: 600 } } })
    const metric = parseCodexUsageJson(json, NOW)?.metrics[0]
    expect(metric?.resetsAt).toBe(new Date(NOW.getTime() + 600_000).toISOString())
  })

  it('returns no metrics (not a guess) when the plan exposes no rate limit', () => {
    const parsed = parseCodexUsageJson(JSON.stringify({ plan_type: 'free', rate_limit: null }), NOW)
    expect(parsed?.planLabel).toBe('Free')
    expect(parsed?.metrics).toEqual([])
  })

  it('rejects malformed JSON', () => {
    expect(parseCodexUsageJson('not json', NOW)).toBeUndefined()
  })
})

describe('chatgptProvider.parse', () => {
  it('prefers the API reading over whatever the page text says', () => {
    const raw = `${CODEX_USAGE_MARKER}${JSON.stringify(RESPONSE)}\nUsage\n50%\nSomething misleading`
    expect(chatgptProvider.parse(raw)?.metrics[0]).toMatchObject({ id: 'session', percentUsed: 0 })
  })

  it('still reads the page text when no API reading is present', () => {
    const raw = '5 hour usage limit\n100% left\nResets 10:18 PM\nWeekly usage limit\n84% left\nResets Sep 2'
    const parsed = chatgptProvider.parse(raw)
    expect(parsed?.metrics.map((m) => m.percentUsed)).toEqual([0, 16])
  })
})

describe('resetLabelFor', () => {
  it('uses a bare time for today and a date otherwise', () => {
    expect(resetLabelFor(new Date('2026-09-20T22:18:00'), NOW)).toBe('at 10:18 PM')
    expect(resetLabelFor(new Date('2026-09-24T00:00:00'), NOW)).toBe('Sep 24 at 12:00 AM')
  })
})
