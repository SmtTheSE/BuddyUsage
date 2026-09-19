import { defaultExtractRaw, defaultIsLoggedIn, type ProviderDefinition } from './types'
import { parseUsageText, type MetricSpec } from './parseHeuristics'

/**
 * Gemini CLI quota is tied to the Google account's AI usage, visible in
 * Google AI Studio's usage view. Google's wording varies by plan, so the
 * label list is deliberately broad and the generic fallback parse covers
 * pages that only show a single figure.
 */
const metrics: MetricSpec[] = [
  { id: 'daily', labels: ['Daily limit', 'Requests per day', 'Today'], displayLabel: 'Daily limit' },
  { id: 'minute', labels: ['Requests per minute', 'Per minute'], displayLabel: 'Per minute' },
  { id: 'monthly', labels: ['Monthly', 'This month'], displayLabel: 'Monthly' }
]

export const geminiProvider: ProviderDefinition = {
  id: 'gemini',
  name: 'Gemini',
  color: '#4285F4',
  usageUrl: 'https://aistudio.google.com/usage',
  loginUrl: 'https://accounts.google.com/signin',
  sessionPartition: 'persist:gemini',
  metrics,
  isLoggedIn: defaultIsLoggedIn,
  extractRaw: defaultExtractRaw,
  parse: (raw) => parseUsageText(raw, metrics)
}
