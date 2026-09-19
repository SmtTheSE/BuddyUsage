/**
 * Turns a provider's human reset phrase into an absolute time so the
 * scheduler can re-sync the moment a window rolls over. Phrases seen live:
 *   "in 51 min", "in 4 hr 12 min", "in 2 hours"
 *   "at 7:07 PM", "Thu 12:00 AM", "Mon 9:00 AM"
 *   "Sep 22 at 11:07 PM", "on March 3, 2026 at midnight"
 * Returns undefined for anything it can't read — callers just fall back to
 * the regular polling interval.
 */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const RELATIVE = /\bin\s+(?:(\d+)\s*(?:hours?|hrs?|h)\b)?\s*(?:(\d+)\s*(?:minutes?|mins?|m)\b)?/i
const CLOCK = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i
const MONTH_DAY = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?/i
const WEEKDAY = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i

export function parseResetLabel(label: string | undefined, now: Date = new Date()): Date | undefined {
  if (!label) return undefined
  const text = label.trim()

  const relative = RELATIVE.exec(text)
  if (relative && (relative[1] || relative[2])) {
    const hours = Number(relative[1] ?? 0)
    const minutes = Number(relative[2] ?? 0)
    return new Date(now.getTime() + (hours * 60 + minutes) * 60_000)
  }

  const clock = CLOCK.exec(text)
  const midnight = /\bmidnight\b/i.test(text)
  const noon = /\bnoon\b/i.test(text)
  if (!clock && !midnight && !noon) return undefined

  let hour = 0
  let minute = 0
  if (clock) {
    hour = Number(clock[1]) % 12
    minute = Number(clock[2] ?? 0)
    if (clock[3].toLowerCase() === 'pm') hour += 12
  } else if (noon) {
    hour = 12
  }

  const target = new Date(now)
  target.setSeconds(0, 0)

  const monthDay = MONTH_DAY.exec(text)
  const weekday = WEEKDAY.exec(text)

  if (monthDay) {
    target.setFullYear(monthDay[3] ? Number(monthDay[3]) : now.getFullYear())
    target.setMonth(MONTHS.indexOf(monthDay[1].slice(0, 3).toLowerCase()), Number(monthDay[2]))
    target.setHours(hour, minute)
    if (!monthDay[3] && target.getTime() < now.getTime()) target.setFullYear(target.getFullYear() + 1)
    return target
  }

  if (weekday) {
    const wanted = WEEKDAYS.indexOf(weekday[1].toLowerCase())
    let delta = (wanted - now.getDay() + 7) % 7
    target.setHours(hour, minute)
    if (delta === 0 && target.getTime() <= now.getTime()) delta = 7
    target.setDate(now.getDate() + delta)
    return target
  }

  target.setHours(hour, minute)
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)
  return target
}
