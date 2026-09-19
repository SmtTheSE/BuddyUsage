import { defaultIsLoggedIn, type ProviderDefinition } from './types'
import { parseUsageText, type MetricSpec } from './parseHeuristics'
import { clickByText, extractDialogOrBodyText } from '../scraping/pageActions'

/**
 * Google AI Plus / Pro / Ultra usage (which the Gemini CLI and app draw
 * from) is shown inside the Gemini app: Settings → Usage limits. The panel
 * reports a usage percentage with a countdown to the next 5-hour reset and
 * a weekly tracker — the same session/weekly shape as Claude. There is no
 * deep link, so extraction opens the panel through the app's own menu.
 *
 * Google's exact wording isn't published, so the label lists below are
 * deliberately broad; the generic fallback (first percentage on the panel)
 * still yields a gauge if none match. The captured text is kept in the
 * cache (`buddyusage --json`) so labels can be tightened from real output.
 */
const metrics: MetricSpec[] = [
  {
    id: 'session',
    labels: ['Current session', 'Session usage', '5-hour', '5 hour', 'Current usage', 'Usage limits', 'Usage'],
    displayLabel: 'Current session'
  },
  {
    id: 'weekly',
    labels: ['Weekly limit', 'Weekly usage', 'This week', 'Weekly'],
    displayLabel: 'Weekly limit'
  }
]

export const geminiProvider: ProviderDefinition = {
  id: 'gemini',
  name: 'Gemini',
  color: '#4285F4',
  usageUrl: 'https://gemini.google.com/app',
  sessionPartition: 'persist:gemini',
  metrics,
  isLoggedIn: defaultIsLoggedIn,
  extractRaw: async (contents) => {
    await wait(1500)
    // "Settings & help" lives in the sidebar; "Usage limits" is a menu item.
    await clickByText(contents, /settings/i)
    await wait(800)
    await clickByText(contents, /usage\s*limits?/i)
    await wait(1500)
    return extractDialogOrBodyText(contents)
  },
  parse: (raw) => parseUsageText(raw, metrics)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
