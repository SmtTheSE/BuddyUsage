/**
 * The phone page: rings, live sessions with Stop, and a nudge box. Served
 * by localServer.ts as a single self-contained document so it works on
 * any phone browser on the same network with nothing to install.
 */
export function remotePageHtml(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0b0b0d" />
<title>BuddyUsage</title>
<style>
  :root { color-scheme: dark; --bg:#0b0b0d; --card:#17171b; --line:#26262c; --fg:#f2f2f4; --muted:#8e8e97; --ok:#34c759; --warn:#f2e53a; --bad:#ff4d1c; --accent:#5e9cff; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font: 16px/1.45 -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; padding: max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom)); }
  h1 { font-size: 18px; margin: 4px 0 14px; display:flex; align-items:center; justify-content:space-between; }
  h1 span { color: var(--muted); font-weight: 500; font-size: 13px; }
  .rings { display:grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 12px; margin-bottom: 18px; }
  .ring { background: var(--card); border:1px solid var(--line); border-radius: 18px; padding: 14px 8px 12px; text-align:center; }
  .gauge { --p:0; --c:var(--ok); width: 64px; height: 64px; margin: 0 auto 8px; border-radius: 50%; background: conic-gradient(var(--c) calc(var(--p) * 1%), #2a2a31 0); display:grid; place-items:center; position:relative; }
  .gauge::after { content: attr(data-label); position:absolute; inset: 7px; border-radius:50%; background: var(--card); display:grid; place-items:center; font-weight: 700; font-size: 14px; }
  .ring b { display:block; font-size: 13px; font-weight: 600; }
  .ring small { color: var(--muted); font-size: 11px; }
  .ring.active .gauge { box-shadow: 0 0 0 3px rgba(94,156,255,.35); animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { box-shadow: 0 0 0 6px rgba(94,156,255,.12); } }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 18px 0 8px; }
  .session { background: var(--card); border:1px solid var(--line); border-radius: 16px; padding: 12px 14px; margin-bottom: 10px; }
  .session .top { display:flex; align-items:center; gap: 10px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); flex: none; }
  .dot.attention { background: var(--warn); box-shadow: 0 0 0 4px rgba(242,229,58,.18); }
  .dot.stopping { background: var(--muted); }
  .session .name { font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session .meta { color: var(--muted); font-size: 12px; margin-top: 2px; }
  .session .msg { margin-top: 8px; font-size: 13px; color: #d8d8de; background:#101013; border-radius: 10px; padding: 8px 10px; }
  .row { display:flex; gap: 8px; margin-top: 10px; }
  button { appearance:none; border:0; border-radius: 12px; padding: 10px 14px; font: inherit; font-weight: 600; background:#2a2a31; color: var(--fg); }
  button.stop { background:#3a1d17; color:#ffb4a0; }
  button.primary { background: var(--accent); color:#04122b; }
  button:disabled { opacity:.5; }
  .nudge { display:flex; gap: 8px; margin-top: 10px; }
  .nudge input { flex:1; min-width:0; border:1px solid var(--line); background:#101013; color: var(--fg); border-radius: 12px; padding: 10px 12px; font: inherit; }
  .reply { margin-top: 8px; font-size: 13px; white-space: pre-wrap; color:#d8d8de; background:#101013; border-radius: 10px; padding: 8px 10px; max-height: 40vh; overflow:auto; }
  .empty { color: var(--muted); font-size: 14px; padding: 8px 2px; }
  .foot { color: var(--muted); font-size: 12px; margin-top: 22px; text-align:center; }
</style>
</head>
<body>
<h1>BuddyUsage <span id="status">connecting…</span></h1>
<div class="rings" id="rings"></div>
<h2>Agents</h2>
<div id="sessions"></div>
<h2>Nudge</h2>
<div class="session">
  <div class="meta">Send a short follow-up to the latest conversation. The reply appears here and in the agent's own transcript.</div>
  <div class="nudge">
    <select id="nudgeProvider" style="border-radius:12px;background:#101013;color:var(--fg);border:1px solid var(--line);padding:0 8px"></select>
    <input id="nudgeText" placeholder="e.g. stop after this file" />
    <button class="primary" id="nudgeSend">Send</button>
  </div>
  <div class="reply" id="nudgeReply" hidden></div>
</div>
<p class="foot">Same Wi‑Fi as your computer · BuddyUsage keeps running there</p>
<script>
  const T = ${JSON.stringify(token)};
  const api = (a, body) => fetch('/api/' + T + '/' + a, body ? { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) } : {}).then(r => r.json());
  const color = p => p >= 70 ? 'var(--bad)' : p >= 40 ? 'var(--warn)' : 'var(--ok)';
  const since = iso => { if (!iso) return ''; const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000)); return m < 60 ? m + ' min' : Math.floor(m/60) + ' h ' + (m%60) + ' min'; };
  let providers = [];
  function render(s) {
    providers = s.providers;
    const usage = Object.fromEntries(s.usage.map(u => [u.providerId, u]));
    const active = new Set(s.agents.sessions.map(x => x.providerId));
    document.getElementById('rings').innerHTML = s.providers.map(p => {
      const u = usage[p.id]; const m = u && u.metrics && u.metrics[0];
      const pct = m ? m.percentUsed : null;
      const label = pct === null ? (u && u.status === 'logged_out' ? 'Sign in' : u && u.status === 'no_meter' ? 'Free' : '–') : pct + '%';
      const words = { logged_out: 'Sign in needed', error: "Couldn't read", stale: 'Stale', loading: 'Loading…', no_meter: 'No meter on this plan', ok: '' };
      const sub = m && m.resetLabel ? 'Resets ' + m.resetLabel : (u && words[u.status]) || '';
      return '<div class="ring' + (active.has(p.id) ? ' active' : '') + '"><div class="gauge" data-label="' + label + '" style="--p:' + (pct||0) + ';--c:' + (pct===null?'#2a2a31':color(pct)) + '"></div><b>' + p.name + '</b><small>' + sub + '</small></div>';
    }).join('');
    const list = s.agents.sessions;
    const byId = Object.fromEntries(s.providers.map(p => [p.id, p.name]));
    document.getElementById('sessions').innerHTML = list.length ? list.map(x => {
      const att = x.attention;
      const state = x.state === 'attention' ? (att.kind === 'finished' ? 'Finished' : att.kind === 'idle' ? 'Idle, waiting' : 'Needs your OK') : x.state === 'stopping' ? 'Stopping…' : 'Running';
      return '<div class="session"><div class="top"><span class="dot ' + x.state + '"></span><span class="name">' + (byId[x.providerId]||x.providerId) + ' · ' + (x.project || 'session') + '</span></div>' +
        '<div class="meta">' + state + (x.startedAt ? ' · ' + since(x.startedAt) : '') + (x.pid ? ' · pid ' + x.pid : '') + '</div>' +
        (att && att.message ? '<div class="msg">' + esc(att.message) + '</div>' : '') +
        (x.pid ? '<div class="row"><button class="stop" onclick="stop(\\'' + x.id + '\\')">Stop</button></div>' : '') + '</div>';
    }).join('') : '<div class="empty">No agent sessions running right now.</div>';
    const sel = document.getElementById('nudgeProvider');
    const agentProviders = s.providers.filter(p => p.agent);
    if (sel.options.length !== agentProviders.length) sel.innerHTML = agentProviders.map(p => '<option value="' + p.id + '">' + p.name + '</option>').join('');
    document.getElementById('status').textContent = 'live';
  }
  const esc = t => t.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  async function stop(id) { if (!confirm('Stop this agent? The conversation is saved and can be resumed.')) return; await api('stop', { id }); refresh(); }
  async function refresh() { try { render(await api('state')); } catch { document.getElementById('status').textContent = 'offline'; } }
  document.getElementById('nudgeSend').onclick = async () => {
    const text = document.getElementById('nudgeText').value.trim(); if (!text) return;
    const btn = document.getElementById('nudgeSend'); btn.disabled = true; btn.textContent = 'Sending…';
    const out = document.getElementById('nudgeReply'); out.hidden = false; out.textContent = 'Waiting for the reply…';
    try { const r = await api('nudge', { providerId: document.getElementById('nudgeProvider').value, text }); out.textContent = r.ok ? r.reply : ('Could not send: ' + r.error); if (r.ok) document.getElementById('nudgeText').value = ''; }
    catch (e) { out.textContent = 'Failed: ' + e; }
    btn.disabled = false; btn.textContent = 'Send';
  };
  refresh(); setInterval(refresh, 5000);
</script>
</body>
</html>`
}
