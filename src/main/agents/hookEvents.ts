import type { AgentAttention } from '@shared/types'
import type { HookEvent } from './agentMonitor'

/**
 * Normalises the JSON each CLI posts into one event shape.
 *   Claude Code hooks: { hook_event_name, session_id, cwd, message, notification_type }
 *   Codex notify:      { type: "agent-turn-complete", thread-id, cwd, last-assistant-message }
 *   Gemini CLI hooks:  { hook_event_name, session_id, cwd, message }
 * Unknown events return undefined and are ignored.
 */
export function hookEventFrom(providerId: string, body: Record<string, unknown>): HookEvent | undefined {
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const sessionId = str(body.session_id) ?? str(body['thread-id']) ?? str(body.thread_id)
  const cwd = str(body.cwd)
  const name = (str(body.hook_event_name) ?? str(body.type) ?? '').toLowerCase()
  const message = str(body.message) ?? str(body['last-assistant-message'])
  const at = new Date().toISOString()
  const base = { providerId, sessionId, cwd }

  const attention = (kind: AgentAttention['kind'], text?: string): HookEvent => ({
    ...base,
    kind: 'attention',
    attention: { kind, message: text?.slice(0, 280), at }
  })

  switch (name) {
    case 'notification': {
      const type = (str(body.notification_type) ?? '').toLowerCase()
      if (type.includes('idle')) return attention('idle', message)
      if (type.includes('permission') || type.includes('elicitation') || /permission|approve|allow/i.test(message ?? ''))
        return attention('permission', message)
      if (type.includes('auth')) return undefined
      return attention('permission', message)
    }
    case 'stop':
    case 'afteragent':
    case 'agent-turn-complete':
      return attention('finished', message)
    case 'userpromptsubmit':
    case 'beforeagent':
    case 'pretooluse':
    case 'posttooluse':
      return { ...base, kind: 'clear' }
    default:
      return undefined
  }
}
