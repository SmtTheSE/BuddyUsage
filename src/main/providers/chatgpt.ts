import { defaultExtractRaw, defaultIsLoggedIn, type ProviderDefinition } from './types'
import { parseUsageText, type MetricSpec } from './parseHeuristics'

/**
 * ChatGPT itself publishes no usage meter — OpenAI only tells you when
 * you've hit a limit. The one meter attached to a ChatGPT account is the
 * Codex one (rolling 5-hour and weekly windows, drawn from the same plan),
 * so that is what this provider reads.
 */
// The page words each window as "5 hour usage limit" / "Weekly usage limit"
// and counts *down* ("84% left"); shorter variants cover older copy. The
// bare "Weekly" fallback is last so "Full reset (Weekly + 5 hr)" can't win.
const metrics: MetricSpec[] = [
  {
    id: 'session',
    labels: ['5-hour usage limit', '5-hour limit', 'Current session'],
    displayLabel: '5-hour limit'
  },
  { id: 'weekly', labels: ['Weekly usage limit', 'Weekly limit', 'Weekly'], displayLabel: 'Weekly limit' }
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
