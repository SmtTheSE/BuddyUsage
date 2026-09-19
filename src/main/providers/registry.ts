import type { ProviderDefinition } from './types'
import { claudeProvider } from './claude'
import { codexProvider } from './codex'
import { geminiProvider } from './gemini'

/**
 * The single place that lists every supported assistant. Adding a new one:
 *   1. Create src/main/providers/<name>.ts implementing ProviderDefinition.
 *   2. Add it to this array.
 * Nothing else in the app (window, scheduler, store, IPC, UI) changes.
 */
export const providerRegistry: ProviderDefinition[] = [claudeProvider, codexProvider, geminiProvider]

export function getProvider(id: string): ProviderDefinition | undefined {
  return providerRegistry.find((p) => p.id === id)
}
