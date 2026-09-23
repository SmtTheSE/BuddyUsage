import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { ActivityReport, ActivityRow } from '@shared/types'
import { ProviderIcon } from './ProviderIcon'

const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' }
]
const SPRING = { type: 'spring', stiffness: 260, damping: 28 } as const

function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`
  return String(n)
}

function dayLabel(date: string, rangeDays: number): string {
  const d = new Date(`${date}T12:00:00`)
  if (rangeDays <= 7) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return String(d.getDate())
}

function Bars({ rows, emptyNote }: { rows: ActivityRow[]; emptyNote: string }): JSX.Element {
  const max = Math.max(1, ...rows.map((r) => r.tokens))
  if (rows.length === 0) return <p className="activity__empty">{emptyNote}</p>
  return (
    <ul className="bars">
      {rows.map((row) => (
        <li key={row.label} className="bar">
          <span className="bar__label" title={row.label}>
            {row.providerIds.length === 1 && <ProviderIcon providerId={row.providerIds[0]} name={row.label} size={14} />}
            {row.label}
          </span>
          <span className="bar__track">
            <motion.span
              className="bar__fill"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(2, (row.tokens / max) * 100)}%` }}
              transition={SPRING}
            />
          </span>
          <span className="bar__value">
            {row.share}%<span className="bar__tokens">{compact(row.tokens)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * "Where did my week go": the breakdown no provider shows — which projects
 * and which models spent the tokens, read from the transcripts the CLIs
 * write on this machine.
 */
export function ActivityView(): JSX.Element {
  const [rangeDays, setRangeDays] = useState(7)
  const [report, setReport] = useState<ActivityReport | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.buddyUsage.getActivity(rangeDays).then((r) => !cancelled && setReport(r))
    const off = window.buddyUsage.onActivityUpdated(() => {
      void window.buddyUsage.getActivity(rangeDays).then((r) => !cancelled && setReport(r))
    })
    return () => {
      cancelled = true
      off()
    }
  }, [rangeDays])

  const maxDay = useMemo(() => Math.max(1, ...(report?.byDay ?? []).map((d) => d.tokens)), [report])
  const cacheShare = report && report.totalTokens > 0 ? Math.round((report.cacheReadTokens / report.totalTokens) * 100) : 0
  const perDay = report && report.rangeDays > 0 ? Math.round(report.totalTokens / report.rangeDays) : 0

  async function rescan(): Promise<void> {
    setBusy(true)
    try {
      setReport(await window.buddyUsage.rescanActivity(rangeDays))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="activity">
      <header className="activity__head">
        <div>
          <h1>Activity</h1>
          <p className="activity__sub">
            Read from the session logs Claude Code and Codex keep on this computer. Nothing is uploaded.
          </p>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Range">
          {RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              role="radio"
              aria-checked={rangeDays === range.days}
              className={rangeDays === range.days ? 'segmented__item segmented__item--on' : 'segmented__item'}
              onClick={() => setRangeDays(range.days)}
            >
              {rangeDays === range.days && <motion.span layoutId="activity-pill" className="segmented__pill" transition={SPRING} />}
              <span className="segmented__label">{range.label}</span>
            </button>
          ))}
        </div>
      </header>

      {report && report.totalTokens === 0 ? (
        <section className="card activity__blank">
          <h2 className="card__title">Nothing yet</h2>
          <p>
            {report.scanning
              ? 'Reading your session logs…'
              : 'No Claude Code or Codex sessions in this range. Use one of them and this fills in on its own.'}
          </p>
        </section>
      ) : (
        <>
          <section className="stats">
            <div className="stat">
              <span className="stat__value">{compact(report?.totalTokens ?? 0)}</span>
              <span className="stat__label">tokens</span>
            </div>
            <div className="stat">
              <span className="stat__value">{compact(perDay)}</span>
              <span className="stat__label">per day</span>
            </div>
            <div className="stat">
              <span className="stat__value">{(report?.turns ?? 0).toLocaleString()}</span>
              <span className="stat__label">turns</span>
            </div>
            <div className="stat">
              <span className="stat__value">{cacheShare}%</span>
              <span className="stat__label">from cache</span>
            </div>
          </section>

          <section className="card">
            <h2 className="card__title">By day</h2>
            <div className="days" role="img" aria-label="Tokens per day">
              {(report?.byDay ?? []).map((day) => (
                <div key={day.date} className="day" title={`${day.date}: ${day.tokens.toLocaleString()} tokens`}>
                  <span className="day__bar-wrap">
                    <motion.span
                      className="day__bar"
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(2, (day.tokens / maxDay) * 100)}%` }}
                      transition={SPRING}
                    />
                  </span>
                  <span className="day__label">{dayLabel(day.date, report?.rangeDays ?? 7)}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="activity__cols">
            <section className="card">
              <h2 className="card__title">By project</h2>
              <Bars rows={report?.byProject ?? []} emptyNote="No project data in this range." />
            </section>
            <section className="card">
              <h2 className="card__title">By model</h2>
              <Bars rows={report?.byModel ?? []} emptyNote="No model data in this range." />
              {(report?.byProvider.length ?? 0) > 1 && (
                <>
                  <h2 className="card__title" style={{ marginTop: 14 }}>
                    By assistant
                  </h2>
                  <Bars rows={report?.byProvider ?? []} emptyNote="" />
                </>
              )}
            </section>
          </div>
        </>
      )}

      <footer className="activity__foot">
        <span>
          {report?.scanning ? 'Scanning session logs…' : 'Claude Code and Codex keep per-turn token counts; Gemini CLI does not yet.'}
        </span>
        <button className="link" onClick={() => void rescan()} disabled={busy || report?.scanning}>
          {busy ? 'Rescanning…' : 'Rescan'}
        </button>
      </footer>
    </div>
  )
}
