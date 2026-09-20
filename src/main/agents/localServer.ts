import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { networkInterfaces } from 'os'
import { Notification } from 'electron'
import type { AgentsState, ProviderMeta, RemoteInfo, UsageSnapshot } from '@shared/types'
import { getAgentsState, ingestHookEvent } from './agentMonitor'
import { hookEventFrom } from './hookEvents'
import { focusSession, nudge, stopSession } from './agentControl'
import { getSession } from './agentMonitor'
import { remotePageHtml } from './remotePage'

/**
 * One tiny HTTP listener with two jobs:
 *   1. receive hook events from the CLIs (always, on 127.0.0.1);
 *   2. serve the phone page and its API on the LAN when the user turns
 *      "Phone remote" on.
 * Every path carries the secret token; without it the server answers 404
 * and reveals nothing. The port is fixed-with-fallback so the hook
 * commands written into the CLIs' configs stay valid across launches.
 */

export const PREFERRED_PORT = 47831
const PORT_ATTEMPTS = 10
const BODY_LIMIT = 256 * 1024

export interface ServerDeps {
  token: () => string
  remoteEnabled: () => boolean
  alertsEnabled: () => boolean
  providers: () => ProviderMeta[]
  usage: () => UsageSnapshot[]
  refresh: () => Promise<void>
  /** Called after a hook event so the UI can react (notification click → focus). */
  onAttention?: (sessionId: string) => void
}

let server: Server | undefined
let port = PREFERRED_PORT
let deps: ServerDeps | undefined

export function getServerPort(): number {
  return port
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > BODY_LIMIT) {
        reject(new Error('too large'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
}

function isLocal(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? ''
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

async function handleHook(providerId: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isLocal(req)) return notFound(res)
  let body: Record<string, unknown> = {}
  try {
    const text = await readBody(req)
    body = text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    /* an empty or odd payload still counts as "something happened" */
  }
  const event = hookEventFrom(providerId, body)
  json(res, 200, { ok: true })
  if (!event) return
  const session = ingestHookEvent(event)
  // "Finished" fires after every turn of an interactive session, so it only
  // marks the ring; a permission prompt or an idle agent is worth a notification.
  const notable = event.kind === 'attention' && event.attention && event.attention.kind !== 'finished'
  if (notable && deps?.alertsEnabled() && Notification.isSupported()) {
    const provider = deps.providers().find((p) => p.id === providerId)
    const name = provider?.name ?? providerId
    const where = session.project ? ` · ${session.project}` : ''
    const title = event.attention!.kind === 'idle' ? `${name} is waiting for you${where}` : `${name} needs your OK${where}`
    const note = new Notification({ title, body: event.attention!.message ?? '' })
    note.on('click', () => void focusSession(session.id))
    note.show()
  }
  deps?.onAttention?.(session.id)
}

function remoteState(): { providers: ProviderMeta[]; usage: UsageSnapshot[]; agents: AgentsState } {
  return { providers: deps!.providers(), usage: deps!.usage().map(({ raw: _raw, ...s }) => s), agents: getAgentsState() }
}

async function handleApi(action: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!deps) return notFound(res)
  if (!deps.remoteEnabled() && !isLocal(req)) return notFound(res)
  if (req.method === 'GET' && action === 'state') return json(res, 200, remoteState())
  if (req.method !== 'POST') return notFound(res)
  let body: Record<string, unknown> = {}
  try {
    const text = await readBody(req)
    body = text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    return json(res, 400, { error: 'bad json' })
  }
  switch (action) {
    case 'stop': {
      const id = String(body.id ?? '')
      const ok = await stopSession(id, body.force === true)
      return json(res, 200, { ok })
    }
    case 'nudge': {
      const providerId = String(body.providerId ?? '')
      const session = body.sessionId ? getSession(String(body.sessionId)) : undefined
      const result = await nudge(providerId, String(body.text ?? ''), session)
      return json(res, 200, result)
    }
    case 'refresh':
      await deps.refresh()
      return json(res, 200, { ok: true })
    default:
      return notFound(res)
  }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://x')
  const parts = url.pathname.split('/').filter(Boolean)
  const token = deps?.token()
  if (!token) return notFound(res)

  // /buddyusage/<provider>/<token>  ← hook events
  if (parts[0] === 'buddyusage' && parts.length === 3 && parts[2] === token && req.method === 'POST') {
    return handleHook(parts[1], req, res)
  }
  // /r/<token>  ← phone page
  if (parts[0] === 'r' && parts[1] === token && parts.length === 2) {
    if (!deps?.remoteEnabled() && !isLocal(req)) return notFound(res)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    return void res.end(remotePageHtml(token))
  }
  // /api/<token>/<action>
  if (parts[0] === 'api' && parts[1] === token && parts.length === 3) {
    return handleApi(parts[2], req, res)
  }
  notFound(res)
}

function listen(host: string, tryPort: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const s = createServer((req, res) => {
      handle(req, res).catch(() => {
        if (!res.headersSent) json(res, 500, { error: 'internal' })
      })
    })
    s.once('error', reject)
    s.listen(tryPort, host, () => {
      s.off('error', reject)
      resolve(s)
    })
  })
}

/** Starts (or restarts, when the bind address must change) the listener. Resolves to the port in use. */
export async function startLocalServer(nextDeps: ServerDeps): Promise<number> {
  deps = nextDeps
  const host = nextDeps.remoteEnabled() ? '0.0.0.0' : '127.0.0.1'
  await stopLocalServer()
  let lastError: unknown
  for (let attempt = 0; attempt < PORT_ATTEMPTS; attempt++) {
    const tryPort = PREFERRED_PORT + attempt
    try {
      server = await listen(host, tryPort)
      port = tryPort
      return port
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not bind the agent listener.')
}

export function stopLocalServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) return resolve()
    const s = server
    server = undefined
    s.close(() => resolve())
    // Don't wait on keep-alive sockets from the phone page.
    s.closeAllConnections?.()
  })
}

export function lanAddresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address)
    }
  }
  return out
}

export async function remoteInfo(token: string, enabled: boolean): Promise<RemoteInfo> {
  const addresses = lanAddresses()
  const info: RemoteInfo = { enabled, addresses, port }
  if (enabled && addresses[0]) {
    info.url = `http://${addresses[0]}:${port}/r/${token}`
    try {
      const QRCode = await import('qrcode')
      info.qrSvg = await QRCode.toString(info.url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
    } catch {
      /* QR is a convenience; the URL alone still works */
    }
  }
  return info
}
