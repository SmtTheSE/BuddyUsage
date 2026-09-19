import type { WebContents } from 'electron'
import type { MetricSpec, ParsedUsage } from './parseHeuristics'

/**
 * Everything needed to add a new AI assistant: implement this interface and
 * add one line to `registry.ts`. No other file needs to change — the
 * window, scheduler, store and UI all work off `ProviderMeta` + `UsageSnapshot`.
 */
export interface ProviderDefinition {
  id: string
  name: string
  color: string
  /** The account page that shows plan usage/limits. */
  usageUrl: string
  /** Where a user is sent to sign in when logged out. Defaults to usageUrl. */
  loginUrl?: string
  /** Isolated, persistent Electron session partition so cookies survive restarts. */
  sessionPartition: string
  /** The limit windows this provider's page is expected to show, in display order. */
  metrics: MetricSpec[]
  /** Inspect the loaded page and decide whether the user is signed in. */
  isLoggedIn: (contents: WebContents) => Promise<boolean>
  /** Pull raw visible text out of the loaded page for parsing. */
  extractRaw: (contents: WebContents) => Promise<string>
  /** Pure, unit-testable: turn raw text into structured usage data. */
  parse: (raw: string) => ParsedUsage | undefined
}

/** Default `isLoggedIn`: true unless the final URL looks like an auth/login page. */
export async function defaultIsLoggedIn(contents: WebContents): Promise<boolean> {
  const url = contents.getURL().toLowerCase()
  const loginMarkers = ['/login', '/signin', '/sign-in', 'accounts.google.com', '/auth']
  return !loginMarkers.some((marker) => url.includes(marker))
}

/** Default `extractRaw`: dump the page's visible text and let the regex heuristics do the work. */
export async function defaultExtractRaw(contents: WebContents): Promise<string> {
  return contents.executeJavaScript('document.body ? document.body.innerText : ""')
}
