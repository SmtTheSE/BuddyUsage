import { defaultExtractRaw, defaultIsLoggedIn, type ProviderDefinition } from './types'
import { parseUsageText, type MetricSpec } from './parseHeuristics'

/**
 * Windsurf (Codeium) meters plan usage as credits: "prompt credits" for
 * model calls and a separate pool for Cascade/flow actions, both resetting
 * with the billing month. The settings page reports them as used/total.
 */
const metrics: MetricSpec[] = [
  { id: 'prompt-credits', labels: ['Prompt credits', 'Premium model credits', 'User prompt credits'], displayLabel: 'Prompt credits' },
  { id: 'flow-credits', labels: ['Flow action credits', 'Cascade credits', 'Flex credits'], displayLabel: 'Flow credits' }
]

export const windsurfProvider: ProviderDefinition = {
  id: 'windsurf',
  name: 'Windsurf',
  color: '#09B6A2',
  usageUrl: 'https://windsurf.com/subscription/usage',
  loginUrl: 'https://windsurf.com/account/login',
  sessionPartition: 'persist:windsurf',
  metrics,
  defaultEnabled: false,
  activityPaths: ['.codeium/windsurf'],
  freeTierNote:
    'Windsurf shows credit usage once a plan is attached to the account; the free tier reports its smaller credit pool the same way.',
  isLoggedIn: async (contents) => {
    const url = contents.getURL().toLowerCase()
    if (url.includes('/login') || url.includes('/signin')) return false
    return defaultIsLoggedIn(contents)
  },
  extractRaw: defaultExtractRaw,
  parse: (raw) => parseUsageText(raw, metrics)
}
