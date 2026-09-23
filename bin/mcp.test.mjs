import { describe, expect, it } from 'vitest'
import { createServer } from './mcp.mjs'

const usage = [
  {
    providerId: 'claude',
    status: 'ok',
    planLabel: 'Max',
    lastSyncedAt: '2026-09-23T10:00:00.000Z',
    metrics: [
      { id: 'session', label: 'Current session', percentUsed: 73, resetLabel: 'in 51 min' },
      { id: 'weekly-all', label: 'All models', percentUsed: 7, resetLabel: 'Thu 12:00 AM' }
    ]
  },
  { providerId: 'gemini', status: 'logged_out', message: 'Sign in required', metrics: [] }
]

const activity = {
  days: 7,
  total: 1000,
  turns: 12,
  projects: { 'web-app': 700, infra: 300 },
  models: { 'Opus 5': 900, 'Sonnet 5': 100 }
}

function server(overrides = {}) {
  return createServer({ version: '1.2.3', readUsage: () => usage, readActivity: () => activity, ...overrides })
}

const callText = (s, name, args) => s.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }).result.content[0].text

describe('MCP server', () => {
  it('advertises itself and its tools', () => {
    const s = server()
    const init = s.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }).result
    expect(init.serverInfo).toEqual({ name: 'buddyusage', version: '1.2.3' })
    expect(init.capabilities.tools).toBeDefined()
    expect(s.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).result.tools.map((t) => t.name)).toEqual([
      'get_usage',
      'get_activity',
      'check_budget'
    ])
  })

  it('reports every provider, including ones that need a sign-in', () => {
    const text = callText(server(), 'get_usage')
    expect(text).toContain('claude (Max): ok')
    expect(text).toContain('Current session: 73% used, resets in 51 min')
    expect(text).toContain('gemini: logged_out')
  })

  it('narrows to one provider', () => {
    expect(callText(server(), 'get_usage', { provider: 'gemini' })).not.toContain('claude')
  })

  it('turns the worst window into a verdict an agent can act on', () => {
    expect(callText(server(), 'check_budget')).toMatch(/^ok: claude Current session is 73%/)
    const tight = server({ readUsage: () => [{ ...usage[0], metrics: [{ id: 's', label: 'Current session', percentUsed: 88 }] }] })
    expect(callText(tight, 'check_budget')).toMatch(/^tight:/)
    const done = server({ readUsage: () => [{ ...usage[0], metrics: [{ id: 's', label: 'Current session', percentUsed: 100 }] }] })
    expect(callText(done, 'check_budget')).toMatch(/^exhausted:/)
  })

  it('summarises local activity by project and model', () => {
    const text = callText(server(), 'get_activity', { days: 7 })
    expect(text).toContain('1,000 tokens across 12 assistant turns')
    expect(text).toContain('web-app: 700 tokens (70%)')
    expect(text).toContain('Opus 5: 900 tokens (90%)')
  })

  it('says what to do when there is no data yet', () => {
    expect(callText(server({ readUsage: () => [] }), 'get_usage')).toContain('Open BuddyUsage')
    expect(callText(server({ readActivity: () => undefined }), 'get_activity')).toContain('No local session-log activity')
  })

  it('answers ping, ignores notifications and rejects unknown methods', () => {
    const s = server()
    expect(s.handle({ jsonrpc: '2.0', id: 9, method: 'ping' }).result).toEqual({})
    expect(s.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeUndefined()
    expect(s.handle({ jsonrpc: '2.0', id: 10, method: 'nope' }).error.code).toBe(-32601)
  })

  it('reports a bad tool name as a tool error, not a crash', () => {
    const response = server().handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nope' } })
    expect(response.result.isError).toBe(true)
    expect(response.result.content[0].text).toContain('Unknown tool')
  })
})
