import type { WebContents } from 'electron'
import { defaultExtractRaw, type ProviderDefinition } from './types'
import { parseUsageText, type MetricSpec } from './parseHeuristics'

/**
 * GitHub Copilot bills through GitHub AI Credits (usage-based since June
 * 2026; legacy annual plans still show "Premium requests"). Both surface
 * under Settings → Billing → Metered usage → Copilot, as used-of-included.
 */
const metrics: MetricSpec[] = [
  { id: 'credits', labels: ['AI Credits', 'AI credits', 'Copilot'], displayLabel: 'AI credits' },
  { id: 'premium', labels: ['Premium requests', 'Premium request'], displayLabel: 'Premium requests' }
]

/** GitHub bounces signed-out visitors to its marketing homepage, not /login — look for the page's own sign-in link. */
async function githubIsLoggedIn(contents: WebContents): Promise<boolean> {
  const url = contents.getURL().toLowerCase()
  if (url.includes('/login') || url.includes('/session')) return false
  return contents.executeJavaScript(`(() => {
    if (document.querySelector('a[href^="/login"], a[href*="github.com/login"]')) return false
    return !!document.querySelector('meta[name="user-login"][content]:not([content=""])') || !/\bSign in\b/.test(document.body.innerText.slice(0, 2000))
  })()`)
}

export const copilotProvider: ProviderDefinition = {
  id: 'copilot',
  name: 'Copilot',
  color: '#6E7681',
  usageUrl: 'https://github.com/settings/billing/usage',
  loginUrl: 'https://github.com/login?return_to=%2Fsettings%2Fbilling%2Fusage',
  sessionPartition: 'persist:copilot',
  metrics,
  defaultEnabled: false,
  activityPaths: ['.config/github-copilot', 'Library/Application Support/Code/User/globalStorage/github.copilot-chat'],
  freeTierNote:
    'Copilot Free includes a small monthly allowance; GitHub shows metered usage under Settings → Billing once there is any.',
  isLoggedIn: githubIsLoggedIn,
  extractRaw: defaultExtractRaw,
  parse: (raw) => parseUsageText(raw, metrics)
}
