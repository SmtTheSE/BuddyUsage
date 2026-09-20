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
  timeoutMs = 6000,
  exclude?: RegExp
): Promise<boolean> {
  // Menu items first: a "Learn more about usage limits" link must not win
  // over the "Usage limits" entry it sits next to.
  const script = `(() => {
    const re = new RegExp(${JSON.stringify(pattern.source)}, ${JSON.stringify(pattern.flags)})
    const skip = ${exclude ? `new RegExp(${JSON.stringify(exclude.source)}, ${JSON.stringify(exclude.flags)})` : 'null'}
    const candidates = [
      ...document.querySelectorAll('[role="menuitem"]'),
      ...document.querySelectorAll('button, a, [role="button"], [role="tab"], [aria-label]')
    ]
    for (const el of candidates) {
      const name = ((el.getAttribute('aria-label') || '') + ' ' + (el.innerText || el.textContent || '')).trim()
      if (!re.test(name)) continue
      if (skip && skip.test(name)) continue
      el.click()
      return true
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

/** Text of the most recently opened dialog, or "" when none is open. */
export async function openDialogText(contents: WebContents): Promise<string> {
  return contents.executeJavaScript(`(() => {
    const dialogs = document.querySelectorAll('[role="dialog"], dialog[open]')
    const last = dialogs[dialogs.length - 1]
    return last ? (last.innerText || '') : ''
  })()`)
}

/** Closes whatever dialog/menu is open: its Close button if it has one, then Escape. */
export async function closeDialogs(contents: WebContents): Promise<void> {
  await contents.executeJavaScript(`(() => {
    const dialogs = document.querySelectorAll('[role="dialog"], dialog[open]')
    const last = dialogs[dialogs.length - 1]
    const close = last && last.querySelector('[aria-label*="close" i], button[aria-label*="Close"]')
    if (close) close.click()
  })()`)
  contents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  contents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await wait(400)
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
