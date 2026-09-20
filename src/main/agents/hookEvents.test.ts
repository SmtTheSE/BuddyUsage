import { describe, expect, it } from 'vitest'
import { hookEventFrom } from './hookEvents'

describe('hookEventFrom', () => {
  it('maps a Claude Code permission notification to attention', () => {
    const ev = hookEventFrom('claude', {
      hook_event_name: 'Notification',
      session_id: 's1',
      cwd: '/p',
      message: 'Claude needs your permission to use Bash',
      notification_type: 'permission_prompt'
    })
    expect(ev).toMatchObject({ providerId: 'claude', sessionId: 's1', cwd: '/p', kind: 'attention', attention: { kind: 'permission' } })
  })

  it('maps idle_prompt to idle and Stop to finished', () => {
    expect(hookEventFrom('claude', { hook_event_name: 'Notification', notification_type: 'idle_prompt' })?.attention?.kind).toBe('idle')
    expect(hookEventFrom('claude', { hook_event_name: 'Stop', session_id: 's1' })?.attention?.kind).toBe('finished')
  })

  it('maps Codex notify payloads (argv JSON) to finished with the last message', () => {
    const ev = hookEventFrom('chatgpt', { type: 'agent-turn-complete', 'thread-id': 't1', cwd: '/q', 'last-assistant-message': 'Done.' })
    expect(ev).toMatchObject({ sessionId: 't1', cwd: '/q', attention: { kind: 'finished', message: 'Done.' } })
  })

  it('maps Gemini AfterAgent / BeforeAgent', () => {
    expect(hookEventFrom('gemini', { hook_event_name: 'AfterAgent', session_id: 'g' })?.attention?.kind).toBe('finished')
    expect(hookEventFrom('gemini', { hook_event_name: 'BeforeAgent', session_id: 'g' })?.kind).toBe('clear')
  })

  it('clears on the user replying and ignores auth/unknown events', () => {
    expect(hookEventFrom('claude', { hook_event_name: 'UserPromptSubmit' })?.kind).toBe('clear')
    expect(hookEventFrom('claude', { hook_event_name: 'Notification', notification_type: 'auth_success' })).toBeUndefined()
    expect(hookEventFrom('claude', { hook_event_name: 'SomethingElse' })).toBeUndefined()
  })
})
