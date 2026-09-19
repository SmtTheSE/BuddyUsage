import { providerRegistry } from '../providers/registry'
import { getProvider } from '../providers/registry'
import { getSettings } from '../store/settings'
import { runProviderScrape } from './scrapeRunner'

const timers = new Map<string, NodeJS.Timeout>()
const staggerTimeouts = new Map<string, NodeJS.Timeout>()

function clearAll(): void {
  for (const t of timers.values()) clearInterval(t)
  for (const t of staggerTimeouts.values()) clearTimeout(t)
  timers.clear()
  staggerTimeouts.clear()
}

/**
 * Starts one repeating poll per enabled provider, with each provider's first
 * run staggered a few seconds apart so three providers never hit their sites
 * in the same instant.
 */
export function startScrapeScheduler(): void {
  clearAll()
  const settings = getSettings()
  const intervalMs = settings.refreshIntervalMinutes * 60 * 1000
  const enabled = providerRegistry.filter((p) => settings.enabledProviders[p.id] !== false)

  enabled.forEach((provider, index) => {
    const staggerMs = index * 4000
    const staggerTimer = setTimeout(() => {
      void runProviderScrape(provider)
      const interval = setInterval(() => void runProviderScrape(provider), intervalMs)
      timers.set(provider.id, interval)
    }, staggerMs)
    staggerTimeouts.set(provider.id, staggerTimer)
  })
}

export function stopScrapeScheduler(): void {
  clearAll()
}

export function restartScrapeScheduler(): void {
  startScrapeScheduler()
}

export async function refreshProviderNow(providerId?: string): Promise<void> {
  if (providerId) {
    const provider = getProvider(providerId)
    if (provider) await runProviderScrape(provider)
    return
  }
  await Promise.all(providerRegistry.map((p) => runProviderScrape(p)))
}
