/**
 * An MCP server over stdio that lets the coding agents themselves see how
 * much of their plan is left.
 *
 * Why this exists: the numbers BuddyUsage collects are most useful to the
 * thing spending them. With this wired in, Claude Code or Codex can check
 * its own budget before starting something expensive, and say "you have
 * 12% of the weekly window left" instead of hitting the wall mid-task.
 *
 * It reads the same local files the app writes — no network, no keys — and
 * exposes three read-only tools. The protocol is small enough to implement
 * directly (initialize / tools/list / tools/call), so the CLI keeps its
 * zero-dependency install.
 */
import { existsSync, readFileSync } from 'fs'
import { createInterface } from 'readline'

const PROTOCOL_VERSION = '2024-11-05'

export function createServer({ readUsage, readActivity, version }) {
  const tools = [
    {
      name: 'get_usage',
      description:
        "Current plan usage for every AI assistant the user has connected (Claude, ChatGPT/Codex, Gemini, Cursor, GitHub Copilot): percentage used per limit window, when each resets, and the plan name. Use before starting long or expensive work, and when the user asks how much of their limit is left.",
      inputSchema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            description: "Optional provider id to narrow to: claude, chatgpt, gemini, cursor or copilot."
          }
        }
      }
    },
    {
      name: 'get_activity',
      description:
        'Token usage on this computer broken down by project, by model and by day, read from the local Claude Code and Codex session logs. Use to answer "where did my usage go" or to compare cost between projects and models.',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'How many days back to include (1-30, default 7).' }
        }
      }
    },
    {
      name: 'check_budget',
      description:
        'A single verdict on whether there is room to run something expensive right now: ok, tight or exhausted, with the limiting window and its reset time. Use before kicking off a long autonomous run.',
      inputSchema: {
        type: 'object',
        properties: {
          provider: { type: 'string', description: 'Provider id to check. Defaults to the one closest to its limit.' }
        }
      }
    }
  ]

  function usageText(providerFilter) {
    const snapshots = readUsage().filter((s) => !providerFilter || s.providerId === providerFilter)
    if (snapshots.length === 0) {
      return providerFilter
        ? `No data for "${providerFilter}". Open BuddyUsage and sign in to it.`
        : 'No usage data yet. Open BuddyUsage and sign in to at least one assistant.'
    }
    return snapshots
      .map((snapshot) => {
        const head = `${snapshot.providerId}${snapshot.planLabel ? ` (${snapshot.planLabel})` : ''}: ${snapshot.status}`
        if (!snapshot.metrics?.length) return `${head}${snapshot.message ? ` — ${snapshot.message}` : ''}`
        const lines = snapshot.metrics.map(
          (m) => `  - ${m.label}: ${m.percentUsed}% used${m.resetLabel ? `, resets ${m.resetLabel}` : ''}`
        )
        return [head, ...lines, `  last synced: ${snapshot.lastSyncedAt ?? 'never'}`].join('\n')
      })
      .join('\n')
  }

  function activityText(days) {
    const report = readActivity(days)
    if (!report || report.total === 0) return 'No local session-log activity in this range.'
    const rows = (map, title) => {
      const entries = Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
      if (entries.length === 0) return ''
      const lines = entries.map(([label, tokens]) => `  - ${label}: ${tokens.toLocaleString()} tokens (${Math.round((tokens / report.total) * 100)}%)`)
      return [`${title}:`, ...lines].join('\n')
    }
    return [
      `Last ${report.days} day(s): ${report.total.toLocaleString()} tokens across ${report.turns.toLocaleString()} assistant turns.`,
      rows(report.projects, 'By project'),
      rows(report.models, 'By model')
    ]
      .filter(Boolean)
      .join('\n')
  }

  function budgetText(providerFilter) {
    const snapshots = readUsage().filter(
      (s) => (!providerFilter || s.providerId === providerFilter) && (s.status === 'ok' || s.status === 'stale')
    )
    const windows = snapshots.flatMap((s) => (s.metrics ?? []).map((m) => ({ provider: s.providerId, ...m })))
    if (windows.length === 0) return 'unknown: no usage data. Open BuddyUsage and sign in.'
    const worst = windows.sort((a, b) => b.percentUsed - a.percentUsed)[0]
    const verdict = worst.percentUsed >= 98 ? 'exhausted' : worst.percentUsed >= 80 ? 'tight' : 'ok'
    const advice =
      verdict === 'exhausted'
        ? 'Do not start long work on this plan until it resets.'
        : verdict === 'tight'
          ? 'Keep the task short, or switch to a model with a separate, roomier window.'
          : 'There is room for a long run.'
    return `${verdict}: ${worst.provider} ${worst.label} is ${worst.percentUsed}% used${
      worst.resetLabel ? `, resets ${worst.resetLabel}` : ''
    }. ${advice}`
  }

  function call(name, args = {}) {
    switch (name) {
      case 'get_usage':
        return usageText(typeof args.provider === 'string' ? args.provider : undefined)
      case 'get_activity':
        return activityText(Math.max(1, Math.min(30, Number(args.days) || 7)))
      case 'check_budget':
        return budgetText(typeof args.provider === 'string' ? args.provider : undefined)
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }

  /** Returns a JSON-RPC response object, or undefined for notifications. */
  function handle(request) {
    const { id, method, params } = request
    const reply = (result) => ({ jsonrpc: '2.0', id, result })
    switch (method) {
      case 'initialize':
        return reply({
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'buddyusage', version }
        })
      case 'tools/list':
        return reply({ tools })
      case 'tools/call':
        try {
          return reply({ content: [{ type: 'text', text: call(params?.name, params?.arguments) }] })
        } catch (error) {
          return reply({ content: [{ type: 'text', text: String(error.message ?? error) }], isError: true })
        }
      case 'ping':
        return reply({})
      default:
        // Notifications carry no id and expect no answer.
        if (id === undefined || id === null) return undefined
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } }
    }
  }

  return { handle, tools }
}

/** Wires the server to stdin/stdout, one JSON-RPC message per line. */
export function serveStdio(server) {
  const lines = createInterface({ input: process.stdin })
  lines.on('line', (line) => {
    const text = line.trim()
    if (!text) return
    let request
    try {
      request = JSON.parse(text)
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n')
      return
    }
    const response = server.handle(request)
    if (response) process.stdout.write(JSON.stringify(response) + '\n')
  })
  lines.on('close', () => process.exit(0))
}

export function readJsonFile(path) {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}
