import { describe, expect, it } from 'vitest'
import { parseClaudeLine, parseCodexLine, parseCodexMeta, prettyModel, tokenDelta } from './logParsers'

// Both fixtures are real lines from this machine's transcripts, trimmed.
const CLAUDE_LINE = JSON.stringify({
  type: 'assistant',
  cwd: '/Users/dev/web-app',
  timestamp: '2026-09-19T10:07:48.638Z',
  message: {
    model: 'claude-sonnet-5',
    usage: {
      input_tokens: 2,
      cache_creation_input_tokens: 34505,
      cache_read_input_tokens: 46886,
      output_tokens: 819
    }
  }
})

const CODEX_LINE = JSON.stringify({
  timestamp: '2026-08-18T04:31:43.554Z',
  type: 'event_msg',
  payload: {
    type: 'token_count',
    info: {
      total_token_usage: {
        input_tokens: 19134,
        cached_input_tokens: 11008,
        cache_write_input_tokens: 0,
        output_tokens: 246,
        total_tokens: 19380
      }
    }
  }
})

describe('parseClaudeLine', () => {
  it('reads tokens, model, project and time from an assistant turn', () => {
    expect(parseClaudeLine(CLAUDE_LINE)).toEqual({
      providerId: 'claude',
      at: '2026-09-19T10:07:48.638Z',
      cwd: '/Users/dev/web-app',
      model: 'claude-sonnet-5',
      tokens: { input: 2, output: 819, cacheRead: 46886, cacheWrite: 34505, total: 82212, turns: 1 }
    })
  })

  it('ignores user lines, zero-token turns and junk', () => {
    expect(parseClaudeLine(JSON.stringify({ type: 'user', message: { content: 'hi' } }))).toBeUndefined()
    expect(parseClaudeLine(JSON.stringify({ type: 'assistant', message: { usage: {} } }))).toBeUndefined()
    expect(parseClaudeLine('{ not json')).toBeUndefined()
  })
})

describe('parseCodexLine', () => {
  it('reads the cumulative counters, excluding cached tokens from input', () => {
    const event = parseCodexLine(CODEX_LINE)
    expect(event?.cumulative).toBe(true)
    expect(event?.tokens).toEqual({ input: 8126, output: 246, cacheRead: 11008, cacheWrite: 0, total: 19380, turns: 1 })
  })

  it('reads the rollout header for project and model', () => {
    const meta = parseCodexMeta(
      JSON.stringify({ type: 'session_meta', payload: { id: 'x', cwd: '/Users/dev/infra', model: 'gpt-5.6-sol', thread_source: 'subagent' } })
    )
    expect(meta).toEqual({ cwd: '/Users/dev/infra', model: 'gpt-5.6-sol', subagent: true })
  })
})

describe('tokenDelta', () => {
  const at = (total: number) => ({ input: total, output: 0, cacheRead: 0, cacheWrite: 0, total, turns: 1 })

  it('subtracts the previous cumulative reading', () => {
    expect(tokenDelta(at(500), at(200)).total).toBe(300)
  })

  it('treats a lower reading as a fresh session rather than negative usage', () => {
    expect(tokenDelta(at(100), at(900)).total).toBe(100)
  })

  it('passes the first reading through', () => {
    expect(tokenDelta(at(42), undefined).total).toBe(42)
  })
})

describe('prettyModel', () => {
  it('shortens the ids the logs carry', () => {
    expect(prettyModel('claude-opus-5')).toBe('Opus 5')
    expect(prettyModel('claude-3-5-haiku-20241022')).toBe('Haiku')
    expect(prettyModel('gpt-5.6-sol')).toBe('GPT-5.6')
    expect(prettyModel('gemini-2.5-pro')).toBe('Gemini 2.5 Pro')
    expect(prettyModel(undefined)).toBe('Unknown')
  })
})
