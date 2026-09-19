import { defaultExtractRaw, defaultIsLoggedIn, type ProviderDefinition } from './types'
import { parseUsageText, type MetricSpec } from './parseHeuristics'

/**
 * Claude Code / Claude.ai usage lives under the account settings usage page,
 * which shows a rolling session limit plus weekly limits per model family.
 * If Anthropic reshapes this page, only this file (or parseHeuristics.ts if
 * the wording itself changes) needs to change — nothing else in the app.
 */
const metrics: MetricSpec[] = [
  { id: 'session', labels: ['Current session'], displayLabel: 'Current session' },
  { id: 'weekly-all', labels: ['All models'], displayLabel: 'All models' },
  { id: 'weekly-sonnet', labels: ['Sonnet only', 'Sonnet'], displayLabel: 'Sonnet only' },
  { id: 'weekly-opus', labels: ['Opus only', 'Opus'], displayLabel: 'Opus only' }
]

export const claudeProvider: ProviderDefinition = {
  id: 'claude',
  name: 'Claude',
  color: '#D97757',
  usageUrl: 'https://claude.ai/settings/usage',
  loginUrl: 'https://claude.ai/login',
  sessionPartition: 'persist:claude',
  metrics,
  activityPaths: ['.claude/projects'],
  freeTierNote:
    'Claude shows usage percentages on Pro, Max and Team plans. On the Free plan the app tells you when you reach the limit and when it resets.',
  isLoggedIn: defaultIsLoggedIn,
  extractRaw: defaultExtractRaw,
  parse: (raw) => parseUsageText(raw, metrics)
}
