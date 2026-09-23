import { defaultExtractRaw, defaultIsLoggedIn, type ProviderDefinition } from './types'
import { parseUsageText, type MetricSpec } from './parseHeuristics'

/**
 * OpenRouter is pay-as-you-go rather than a plan, so the meaningful number
 * is credits: what is left of what was bought. The credits page states it
 * as a dollar balance and month-to-date spend.
 */
const metrics: MetricSpec[] = [
  { id: 'credits', labels: ['Credits used', 'Usage this month', 'Spent'], displayLabel: 'Credits used' }
]

export const openrouterProvider: ProviderDefinition = {
  id: 'openrouter',
  name: 'OpenRouter',
  color: '#6467F2',
  usageUrl: 'https://openrouter.ai/credits',
  loginUrl: 'https://openrouter.ai/sign-in',
  sessionPartition: 'persist:openrouter',
  metrics,
  defaultEnabled: false,
  freeTierNote:
    'OpenRouter bills per request rather than by plan, so there is no percentage until credits are purchased; the balance appears here once there is one.',
  isLoggedIn: async (contents) => {
    const url = contents.getURL().toLowerCase()
    if (url.includes('/sign-in') || url.includes('/sign-up')) return false
    return defaultIsLoggedIn(contents)
  },
  extractRaw: defaultExtractRaw,
  parse: (raw) => parseUsageText(raw, metrics)
}
