import type { Session } from 'electron'

/**
 * Makes the hidden provider windows present themselves as an ordinary
 * Chrome build. Google's sign-in ("This browser or app may not be secure")
 * rejects Electron on two signals in particular: the UA string carrying an
 * Electron token, and Chrome-branded requests that lack the Sec-CH-UA
 * client-hint headers a real Chrome always sends. The version is taken from
 * the Chromium actually embedded so the two stay consistent.
 */
const CHROME_MAJOR = (process.versions.chrome ?? '130.0.0.0').split('.')[0]

function osToken(): string {
  if (process.platform === 'win32') return 'Windows NT 10.0; Win64; x64'
  if (process.platform === 'linux') return 'X11; Linux x86_64'
  return 'Macintosh; Intel Mac OS X 10_15_7'
}

function platformHint(): string {
  if (process.platform === 'win32') return '"Windows"'
  if (process.platform === 'linux') return '"Linux"'
  return '"macOS"'
}

export const CHROME_USER_AGENT = `Mozilla/5.0 (${osToken()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`

export const ACCEPT_LANGUAGE = 'en-US,en;q=0.9'

// Same brand triple Chrome emits (order/GREASE brand vary per version; the
// exact permutation isn't validated by servers, the presence is).
const SEC_CH_UA = `"Chromium";v="${CHROME_MAJOR}", "Google Chrome";v="${CHROME_MAJOR}", "Not?A_Brand";v="99"`

export function applyChromeIdentity(session: Session): void {
  // Electron appends the q-values itself, so pass bare language tags here.
  session.setUserAgent(CHROME_USER_AGENT, 'en-US,en')

  session.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders }
    const has = (name: string): boolean =>
      Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase())

    if (!has('sec-ch-ua')) headers['sec-ch-ua'] = SEC_CH_UA
    if (!has('sec-ch-ua-mobile')) headers['sec-ch-ua-mobile'] = '?0'
    if (!has('sec-ch-ua-platform')) headers['sec-ch-ua-platform'] = platformHint()
    if (!has('accept-language')) headers['Accept-Language'] = ACCEPT_LANGUAGE

    callback({ requestHeaders: headers })
  })
}
