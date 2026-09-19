import { describe, expect, it } from 'vitest'
import { parseResetLabel } from './resetTime'

// Saturday 19 Sep 2026, 18:42 local.
const NOW = new Date(2026, 8, 19, 18, 42, 0)

describe('parseResetLabel', () => {
  it('handles "in N min"', () => {
    expect(parseResetLabel('in 51 min', NOW)).toEqual(new Date(2026, 8, 19, 19, 33, 0))
  })

  it('handles "in H hr M min"', () => {
    expect(parseResetLabel('in 4 hr 12 min', NOW)).toEqual(new Date(2026, 8, 19, 22, 54, 0))
  })

  it('handles "in 2 hours"', () => {
    expect(parseResetLabel('in 2 hours', NOW)).toEqual(new Date(2026, 8, 19, 20, 42, 0))
  })

  it('handles a clock time later today', () => {
    expect(parseResetLabel('at 7:07 PM', NOW)).toEqual(new Date(2026, 8, 19, 19, 7, 0))
  })

  it('rolls a clock time that already passed to tomorrow', () => {
    expect(parseResetLabel('at 9:00 AM', NOW)).toEqual(new Date(2026, 8, 20, 9, 0, 0))
  })

  it('handles month + day + time', () => {
    expect(parseResetLabel('Sep 22 at 11:07 PM', NOW)).toEqual(new Date(2026, 8, 22, 23, 7, 0))
  })

  it('handles a weekday + time in the coming week', () => {
    // Thursday after Saturday 19 Sep is 24 Sep.
    expect(parseResetLabel('Thu 12:00 AM', NOW)).toEqual(new Date(2026, 8, 24, 0, 0, 0))
  })

  it('handles "on <Month> <day>, <year> at midnight"', () => {
    expect(parseResetLabel('on March 3, 2027 at midnight', NOW)).toEqual(new Date(2027, 2, 3, 0, 0, 0))
  })

  it('returns undefined for unreadable phrases', () => {
    expect(parseResetLabel('soon', NOW)).toBeUndefined()
    expect(parseResetLabel(undefined, NOW)).toBeUndefined()
  })
})
