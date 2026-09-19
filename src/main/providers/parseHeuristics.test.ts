import { describe, expect, it } from 'vitest'
import {
  extractMetrics,
  findFraction,
  findPercent,
  findPlanLabel,
  findResetPhrase,
  looksSignedOut,
  parseUsageText,
  type MetricSpec
} from './parseHeuristics'

const CLAUDE_SPECS: MetricSpec[] = [
  { id: 'session', labels: ['Current session'], displayLabel: 'Current session' },
  { id: 'weekly-all', labels: ['All models'], displayLabel: 'All models' },
  { id: 'weekly-sonnet', labels: ['Sonnet only', 'Sonnet'], displayLabel: 'Sonnet only' }
]

// Modelled on the structure of claude.ai/settings/usage: a section heading,
// a reset phrase, and a percentage per limit window.
const CLAUDE_USAGE_PAGE = `Settings
Usage
Plan: Max

Current session
Resets in 51 min
73% used

Weekly limits
All models
Resets Thu 12:00 AM
7% used

Sonnet only
Resets Thu 12:00 AM
12% used`

describe('findFraction', () => {
  it('parses "used of limit" phrasing', () => {
    expect(findFraction('You have used 42 of 100 messages this week')).toMatchObject({
      used: 42,
      limit: 100,
      unit: 'messages',
      percentUsed: 42
    })
  })

  it('parses a bare "used/limit" slash', () => {
    expect(findFraction('12/50 requests remaining')).toMatchObject({ used: 12, limit: 50 })
  })

  it('handles thousands separators', () => {
    expect(findFraction('1,200 of 5,000 tokens')).toMatchObject({ used: 1200, limit: 5000 })
  })

  it('returns undefined when nothing matches', () => {
    expect(findFraction('no numbers here')).toBeUndefined()
  })
})

describe('findPercent', () => {
  it('parses a plain percentage', () => {
    expect(findPercent("You've used 73% of your weekly limit")).toBe(73)
  })

  it('returns undefined with no percentage present', () => {
    expect(findPercent('nothing to see here')).toBeUndefined()
  })
})

describe('findPlanLabel', () => {
  it.each([
    ['You are on the Pro plan', 'Pro'],
    ['Max subscribers get more capacity', 'Max'],
    ['Currently: Free', 'Free']
  ])('recognizes %s -> %s', (text, expected) => {
    expect(findPlanLabel(text)).toBe(expected)
  })

  it('returns undefined for unknown plan wording', () => {
    expect(findPlanLabel('Some custom internal tier')).toBeUndefined()
  })
})

describe('findResetPhrase', () => {
  it('keeps the phrase verbatim so the UI can say "Resets in 51 min"', () => {
    expect(findResetPhrase('Current session\nResets in 51 min\n73% used')).toBe('in 51 min')
  })

  it('captures a weekday/time reset', () => {
    expect(findResetPhrase('All models\nResets Thu 12:00 AM\n7% used')).toBe('Thu 12:00 AM')
  })

  it('captures a "renews in" phrase', () => {
    expect(findResetPhrase('Plan renews in 4 days')).toBe('in 4 days')
  })
})

describe('looksSignedOut', () => {
  // Captured live from chatgpt.com's anonymous landing page during manual
  // verification — it never redirects to a distinct /login URL, so the
  // URL-based isLoggedIn check alone misses it.
  const CHATGPT_ANON_LANDING = `New chat
Search chats
Get responses tailored to you

Log in to get answers based on saved chats, plus create images and upload files.

Log in
Sign up for free
Where should we begin?`

  it('recognizes a real captured logged-out landing page', () => {
    expect(looksSignedOut(CHATGPT_ANON_LANDING)).toBe(true)
  })

  it('does not flag ordinary usage copy', () => {
    expect(looksSignedOut('Pro plan — 30 of 40 messages used. Resets on Monday.')).toBe(false)
  })
})

describe('extractMetrics', () => {
  it('pulls every labeled limit window with its own percentage and reset phrase', () => {
    const metrics = extractMetrics(CLAUDE_USAGE_PAGE, CLAUDE_SPECS)
    expect(metrics).toEqual([
      expect.objectContaining({ id: 'session', label: 'Current session', percentUsed: 73, resetLabel: 'in 51 min' }),
      expect.objectContaining({ id: 'weekly-all', label: 'All models', percentUsed: 7, resetLabel: 'Thu 12:00 AM' }),
      expect.objectContaining({ id: 'weekly-sonnet', label: 'Sonnet only', percentUsed: 12 })
    ])
  })

  it('skips windows the page does not show', () => {
    const metrics = extractMetrics('Current session\n40% used', CLAUDE_SPECS)
    expect(metrics.map((m) => m.id)).toEqual(['session'])
  })

  it('tries alternative labels in order', () => {
    const metrics = extractMetrics('Sonnet\n55% used', CLAUDE_SPECS)
    expect(metrics[0]).toMatchObject({ id: 'weekly-sonnet', percentUsed: 55 })
  })

  it("does not bleed a later section's number into an earlier label with no value", () => {
    const metrics = extractMetrics('Current session\n(no data)\nAll models\n9% used', CLAUDE_SPECS)
    expect(metrics.find((m) => m.id === 'session')).toBeUndefined()
    expect(metrics.find((m) => m.id === 'weekly-all')?.percentUsed).toBe(9)
  })
})

describe('parseUsageText (full pipeline)', () => {
  it('returns labeled metrics plus the plan when the page matches the specs', () => {
    const result = parseUsageText(CLAUDE_USAGE_PAGE, CLAUDE_SPECS)
    expect(result?.planLabel).toBe('Max')
    expect(result?.metrics).toHaveLength(3)
    expect(result?.metrics[0]).toMatchObject({ percentUsed: 73 })
  })

  it('falls back to a single generic metric when no labels match', () => {
    const result = parseUsageText('Pro plan: 88% of usage limit used. Resets in 2 hours.', CLAUDE_SPECS)
    expect(result).toMatchObject({ planLabel: 'Pro' })
    expect(result?.metrics).toEqual([
      expect.objectContaining({ id: 'usage', percentUsed: 88, resetLabel: 'in 2 hours' })
    ])
  })

  it('prefers a fraction over a bare percentage in the fallback', () => {
    const result = parseUsageText('you have used 30 of 40 messages (75%)')
    expect(result?.metrics[0]).toMatchObject({ used: 30, limit: 40, percentUsed: 75 })
  })

  it('returns undefined for text with no recognizable usage pattern', () => {
    expect(parseUsageText('Welcome back! Here is your dashboard.')).toBeUndefined()
  })

  it('returns undefined for empty input', () => {
    expect(parseUsageText('   ')).toBeUndefined()
  })
})
