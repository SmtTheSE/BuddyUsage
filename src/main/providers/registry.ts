import type { ProviderDefinition } from './types'
import { claudeProvider } from './claude'
import { chatgptProvider } from './chatgpt'
import { geminiProvider } from './gemini'
import { cursorProvider } from './cursor'
import { copilotProvider } from './copilot'

/**
 * The single place that lists every supported assistant. Adding a new one:
 *   1. Create src/main/providers/<name>.ts implementing ProviderDefinition.
 *   2. Add it to this array.
 * Nothing else in the app (window, scheduler, store, IPC, UI) changes.
 */
export const providerRegistry: ProviderDefinition[] = [
  claudeProvider,
  chatgptProvider,
  geminiProvider,
  cursorProvider,
  copilotProvider
]

export function getProvider(id: string): ProviderDefinition | undefined {
  return providerRegistry.find((p) => p.id === id)
}
