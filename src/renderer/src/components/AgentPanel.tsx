import { useEffect, useMemo, useState } from 'react'
import type { AgentSession, NudgeResult, ProviderMeta } from '@shared/types'
import { selectSessions, useAppStore } from '../state/store'

interface AgentPanelProps {
  provider: ProviderMeta
}

function elapsed(iso?: string): string {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return 'just started'
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)} h ${mins % 60} min`
}

function stateLabel(s: AgentSession): string {
  if (s.state === 'stopping') return 'Stopping…'
  if (s.state === 'attention') {
    if (s.attention?.kind === 'finished') return 'Finished'
    if (s.attention?.kind === 'idle') return 'Idle, waiting for you'
    return 'Needs your OK'
  }
  return 'Running'
}

/**
 * The live sessions of one CLI agent inside its usage card: what is
 * running where, Stop / Jump per session, a one-line nudge box, and the
 * limit guard's "paused" notice with Resume.
 */
export function AgentPanel({ provider }: AgentPanelProps): JSX.Element | null {
  // Select the stable `agents` object and derive; selecting a fresh array
  // per render would re-render forever.
  const agents = useAppStore((s) => s.agents)
  const sessions = useMemo(() => selectSessions(agents, provider.id), [agents, provider.id])
  const paused = useMemo(() => agents.paused.filter((p) => p.providerId === provider.id), [agents, provider.id])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [reply, setReply] = useState<NudgeResult | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [, tick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(timer)
  }, [])

  if (!provider.agent) return null

  async function stop(id: string): Promise<void> {
    setBusy(id)
    try {
      await window.buddyUsage.stopAgent(id, true)
    } finally {
      setBusy(null)
    }
  }

  async function send(): Promise<void> {
    const value = text.trim()
    if (!value || sending) return
    setSending(true)
    setReply(null)
    try {
      const target = sessions.find((s) => s.state === 'attention') ?? sessions[0]
      const result = await window.buddyUsage.nudgeAgent(provider.id, value, target?.id)
      setReply(result)
      if (result.ok) setText('')
    } finally {
      setSending(false)
    }
  }

  const showNudge = sessions.length > 0 || paused.length > 0 || reply !== null
  // Nothing running, nothing paused: stay out of the way. The block is about
  // local CLI agents (claude / codex / gemini commands), not browser chats.
  if (!showNudge) return null

  const cli = provider.id === 'chatgpt' ? 'codex' : provider.id

  return (
    <div className="agents" data-solid>
      <div className="agents__title">
        <span>
          {cli} CLI · {sessions.length ? `${sessions.length} session${sessions.length === 1 ? '' : 's'} on this computer` : 'nothing running'}
        </span>
      </div>

      {sessions.map((s) => (
        <div key={s.id} className={`session session--${s.state}`}>
          <span className="session__dot" aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            <div className="session__name" title={s.cwd}>
              {s.project ?? (s.cwd ? s.cwd : 'session')}
            </div>
            <div className="session__meta">
              {stateLabel(s)}
              {s.startedAt ? ` · ${elapsed(s.startedAt)}` : ''}
            </div>
          </div>
          <span className="session__actions">
            {s.hostApp && (
              <button className="button button--small" title="Bring its window to the front" onClick={() => void window.buddyUsage.focusAgent(s.id)}>
                Jump
              </button>
            )}
            {s.pid !== undefined && (
              <button
                className="button button--small button--stop"
                disabled={busy === s.id || s.state === 'stopping'}
                title="Interrupt this session (same as Ctrl-C). The conversation is saved and can be resumed."
                onClick={() => void stop(s.id)}
              >
                Stop
              </button>
            )}
          </span>
          {s.attention?.message && <div className="session__msg">{s.attention.message}</div>}
        </div>
      ))}

      {paused.length > 0 && (
        <div className="paused">
          <span>
            Limit guard paused {paused.length} session{paused.length === 1 ? '' : 's'}
            {paused[0].project ? ` (${paused.map((p) => p.project).filter(Boolean).join(', ')})` : ''}.
          </span>
          <span className="session__actions">
            <button className="button button--small button--tinted" onClick={() => void window.buddyUsage.resumePaused(provider.id)}>
              Resume
            </button>
            <button className="link" onClick={() => void window.buddyUsage.dismissPaused(provider.id)}>
              Dismiss
            </button>
          </span>
        </div>
      )}

      {showNudge && (
        <>
          <form
            className="nudge"
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            <input
              className="nudge__input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={sending ? 'Waiting for the reply…' : 'Nudge: e.g. "stop after this file"'}
              disabled={sending}
              maxLength={500}
              onFocus={(e) => {
                void window.buddyUsage.setFocusable(true)
                // Keep the card open while typing even if the mouse wanders.
                e.currentTarget.dispatchEvent(new CustomEvent('buddy:pin', { bubbles: true, detail: provider.id }))
              }}
              onBlur={() => void window.buddyUsage.setFocusable(false)}
            />
            <button className="button button--small button--tinted" type="submit" disabled={sending || !text.trim()}>
              {sending ? '…' : 'Send'}
            </button>
          </form>
          {reply && (
            <div className={reply.ok ? 'nudge__reply' : 'nudge__reply nudge__reply--error'} title={reply.command}>
              {reply.ok ? reply.reply : reply.error}
            </div>
          )}
        </>
      )}
    </div>
  )
}
