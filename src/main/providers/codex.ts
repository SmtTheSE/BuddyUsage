import { defaultExtractRaw, defaultIsLoggedIn, type ProviderDefinition } from './types'
import { parseUsageText, type MetricSpec } from './parseHeuristics'

/**
 * The Codex CLI draws its quota from the connected ChatGPT plan. Codex has
 * its own settings area on chatgpt.com that reports the rolling 5-hour and
 * weekly limits the CLI counts against.
 */
const metrics: MetricSpec[] = [
  { id: 'session', labels: ['5-hour limit', '5 hour limit', 'Current session'], displayLabel: '5-hour limit' },
  { id: 'weekly', labels: ['Weekly limit', 'Weekly'], displayLabel: 'Weekly limit' }
]

export const codexProvider: ProviderDefinition = {
  id: 'codex',
  name: 'Codex',
  color: '#10A37F',
  usageUrl: 'https://chatgpt.com/codex/settings/usage',
  loginUrl: 'https://chatgpt.com/auth/login',
  sessionPartition: 'persist:codex',
  metrics,
  isLoggedIn: defaultIsLoggedIn,
  extractRaw: defaultExtractRaw,
  parse: (raw) => parseUsageText(raw, metrics)
}
