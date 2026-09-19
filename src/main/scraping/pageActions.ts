import type { WebContents } from 'electron'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Clicks the first clickable element whose accessible name or text matches
 * `pattern`, polling briefly for it to appear — SPAs render menus after a
 * beat. Used for usage views that live behind in-app navigation with no
 * deep link (e.g. Gemini's Settings → Usage limits).
 */
export async function clickByText(
  contents: WebContents,
  pattern: RegExp,
  timeoutMs = 6000
): Promise<boolean> {
  const script = `(() => {
    const re = new RegExp(${JSON.stringify(pattern.source)}, ${JSON.stringify(pattern.flags)})
    const candidates = document.querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="tab"], [aria-label]')
    for (const el of candidates) {
      const name = (el.getAttribute('aria-label') || '') + ' ' + (el.innerText || el.textContent || '')
      if (re.test(name.trim())) { el.click(); return true }
    }
    return false
  })()`

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await contents.executeJavaScript(script)) return true
    await wait(400)
  }
  return false
}

/** Reads the visible text of the most recently opened dialog, falling back to the whole page. */
export async function extractDialogOrBodyText(contents: WebContents): Promise<string> {
  return contents.executeJavaScript(`(() => {
    const dialogs = document.querySelectorAll('[role="dialog"], dialog[open]')
    const last = dialogs[dialogs.length - 1]
    const text = last ? last.innerText : ''
    return text && text.trim().length > 20 ? text : (document.body ? document.body.innerText : '')
  })()`)
}
