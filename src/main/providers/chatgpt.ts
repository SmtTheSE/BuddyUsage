import { defaultExtractRaw, defaultIsLoggedIn, type ProviderDefinition } from './types'
import { parseUsageText, type MetricSpec } from './parseHeuristics'

/**
 * ChatGPT itself publishes no usage meter — OpenAI only tells you when
 * you've hit a limit. The one meter attached to a ChatGPT account is the
 * Codex one (rolling 5-hour and weekly windows, drawn from the same plan),
 * so that is what this provider reads.
 */
const metrics: MetricSpec[] = [
  { id: 'session', labels: ['5-hour limit', '5 hour limit', 'Current session'], displayLabel: '5-hour limit' },
  { id: 'weekly', labels: ['Weekly limit', 'Weekly'], displayLabel: 'Weekly limit' }
]

export const chatgptProvider: ProviderDefinition = {
  id: 'chatgpt',
  name: 'ChatGPT',
  color: '#10A37F',
  usageUrl: 'https://chatgpt.com/codex/settings/usage',
  loginUrl: 'https://chatgpt.com/auth/login',
  sessionPartition: 'persist:chatgpt',
  metrics,
  activityPaths: ['.codex/sessions'],
  freeTierNote:
    'ChatGPT does not publish a usage meter for chat — it tells you when a limit is reached. Codex limits appear here on plans that include Codex.',
  isLoggedIn: defaultIsLoggedIn,
  extractRaw: defaultExtractRaw,
  parse: (raw) => parseUsageText(raw, metrics)
}
