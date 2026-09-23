import { defaultExtractRaw, defaultIsLoggedIn, type ProviderDefinition } from './types'
import { parseUsageText, type MetricSpec } from './parseHeuristics'

/**
 * For people who build against the API rather than (or as well as) using a
 * plan: month-to-date spend against the organisation's configured limit,
 * from the Console's own billing page. No API key is involved — this is the
 * same signed-in page a human would open.
 */
const metrics: MetricSpec[] = [
  { id: 'spend', labels: ['Monthly spend limit', 'Usage this month', 'Current usage', 'Month to date'], displayLabel: 'Spend this month' }
]

export const anthropicApiProvider: ProviderDefinition = {
  id: 'anthropic-api',
  name: 'Anthropic API',
  color: '#D97757',
  usageUrl: 'https://console.anthropic.com/settings/billing',
  loginUrl: 'https://console.anthropic.com/login',
  sessionPartition: 'persist:anthropic-api',
  metrics,
  defaultEnabled: false,
  freeTierNote:
    'The Console shows spend once an organisation has billing set up. Credit balances without a configured limit have no percentage to report.',
  isLoggedIn: defaultIsLoggedIn,
  extractRaw: defaultExtractRaw,
  parse: (raw) => parseUsageText(raw, metrics)
}
