import { defaultExtractRaw, defaultIsLoggedIn, type ProviderDefinition } from './types'
import { parseUsageText, type MetricSpec } from './parseHeuristics'

/**
 * The OpenAI Platform counterpart to the Console provider: month-to-date
 * spend against the monthly budget set on the organisation.
 */
const metrics: MetricSpec[] = [
  { id: 'spend', labels: ['Monthly budget', 'Usage this month', 'Current usage', 'Spend'], displayLabel: 'Spend this month' }
]

export const openaiApiProvider: ProviderDefinition = {
  id: 'openai-api',
  name: 'OpenAI API',
  color: '#0F9D76',
  usageUrl: 'https://platform.openai.com/settings/organization/limits',
  loginUrl: 'https://platform.openai.com/login',
  sessionPartition: 'persist:openai-api',
  metrics,
  defaultEnabled: false,
  freeTierNote:
    'The Platform shows spend against a budget once one is set under Limits. Without a budget there is no percentage to report.',
  isLoggedIn: defaultIsLoggedIn,
  extractRaw: defaultExtractRaw,
  parse: (raw) => parseUsageText(raw, metrics)
}
