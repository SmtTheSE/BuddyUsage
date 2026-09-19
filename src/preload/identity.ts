/**
 * Runs inside the hidden provider windows, in the page's own world, before
 * any page script. Electron ships `window.chrome` as an empty object;
 * Chrome populates `app`, `csi` and `loadTimes`, and Google's sign-in
 * bot check keys on their absence to reject "insecure" embedded browsers.
 * This defines the same members with Chrome-shaped return values. It holds
 * no privileges (sandboxed, no IPC, nothing exposed) — it only shapes what
 * the page sees.
 */
type ChromeShape = Record<string, unknown>

const w = window as unknown as { chrome?: ChromeShape }
const chrome: ChromeShape = w.chrome ?? {}
w.chrome = chrome

if (!chrome.app) {
  chrome.app = {
    isInstalled: false,
    InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
    RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
    getDetails: () => null,
    getIsInstalled: () => false,
    runningState: () => 'cannot_run'
  }
}

if (!chrome.csi) {
  chrome.csi = () => ({
    startE: performance.timeOrigin,
    onloadT: performance.timeOrigin + performance.now(),
    pageT: performance.now(),
    tran: 15
  })
}

if (!chrome.loadTimes) {
  chrome.loadTimes = () => {
    const start = performance.timeOrigin / 1000
    const now = (performance.timeOrigin + performance.now()) / 1000
    return {
      requestTime: start,
      startLoadTime: start,
      commitLoadTime: start,
      finishDocumentLoadTime: now,
      finishLoadTime: now,
      firstPaintTime: now,
      firstPaintAfterLoadTime: 0,
      navigationType: 'Other',
      wasFetchedViaSpdy: true,
      wasNpnNegotiated: true,
      npnNegotiatedProtocol: 'h2',
      wasAlternateProtocolAvailable: false,
      connectionInfo: 'h2'
    }
  }
}
