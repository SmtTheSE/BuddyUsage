import type { UsageForecast, UsageSnapshot } from '@shared/types'
import { formatUntil } from '../lib/usageColor'

interface InsightLineProps {
  snapshot?: UsageSnapshot
  forecast?: UsageForecast
}

/** "in 1 h 20 m" for a soon-ish moment, else a clock time. */
function untilText(iso: string): string {
  return formatUntil(iso) ?? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * Turns the numbers into the sentence a percentage can't say: whether the
 * current pace makes it to the reset, and which model still has room.
 * Silent when there isn't enough signal — a wrong prediction is worse than
 * no prediction.
 */
export function InsightLine({ snapshot, forecast }: InsightLineProps): JSX.Element | null {
  const metric = snapshot?.metrics?.[0]
  if (!metric || snapshot?.status === 'no_meter') return null

  const notes: { tone: 'warn' | 'plain'; text: string }[] = []

  if (forecast && forecast.ratePerHour > 0.5) {
    if (forecast.willRunOut && forecast.emptyAt) {
      notes.push({ tone: 'warn', text: `At ~${forecast.ratePerHour}%/h this empties ${untilText(forecast.emptyAt)}, before it resets.` })
    } else if (forecast.projectedAtReset !== undefined) {
      notes.push({ tone: 'plain', text: `At this pace, about ${Math.max(0, 100 - forecast.projectedAtReset)}% left at reset.` })
    }
  }

  // Which sibling window still has room — the cheapest saving there is.
  const siblings = (snapshot?.metrics ?? []).slice(1).filter((m) => /model|opus|sonnet|haiku|weekly/i.test(m.label))
  const tight = [metric, ...siblings].find((m) => m.percentUsed >= 80)
  const roomy = siblings.find((m) => m.percentUsed <= 50 && m !== tight)
  if (tight && roomy) {
    notes.push({ tone: 'plain', text: `${tight.label} ${tight.percentUsed}%, ${roomy.label} ${roomy.percentUsed}% — room left there.` })
  }

  if (notes.length === 0) return null
  return (
    <div className="insight">
      {notes.slice(0, 2).map((note) => (
        <p key={note.text} className={note.tone === 'warn' ? 'insight__note insight__note--warn' : 'insight__note'}>
          {note.text}
        </p>
      ))}
    </div>
  )
}
