import { defaultExtractRaw, defaultIsLoggedIn, type ProviderDefinition } from './types'
import { parseUsageText, type MetricSpec } from './parseHeuristics'

/**
 * Cursor's dashboard reports monthly included usage per model pool
 * ("Cursor Models", "Other Models") in dollars against the plan's allowance,
 * plus any on-demand spend, resetting with the billing cycle.
 */
const metrics: MetricSpec[] = [
  { id: 'cursor-models', labels: ['Cursor Models', 'Included usage', 'Included'], displayLabel: 'Cursor models' },
  { id: 'other-models', labels: ['Other Models', 'API usage'], displayLabel: 'Other models' },
  { id: 'on-demand', labels: ['On-demand', 'On demand', 'Usage-based'], displayLabel: 'On-demand' }
]

export const cursorProvider: ProviderDefinition = {
  id: 'cursor',
  name: 'Cursor',
  color: '#8B5CF6',
  usageUrl: 'https://cursor.com/dashboard?tab=usage',
  loginUrl: 'https://cursor.com/api/auth/login',
  sessionPartition: 'persist:cursor',
  metrics,
  defaultEnabled: false,
  activityPaths: ['.cursor'],
  freeTierNote:
    "Cursor's Hobby plan shows its included usage on the dashboard once you've used something; upgrade to Pro for the full monthly allowance.",
  isLoggedIn: async (contents) => {
    const url = contents.getURL().toLowerCase()
    if (url.includes('authenticator.cursor.sh') || url.includes('/api/auth/')) return false
    return defaultIsLoggedIn(contents)
  },
  extractRaw: defaultExtractRaw,
  parse: (raw) => parseUsageText(raw, metrics)
}
