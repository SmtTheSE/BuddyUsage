import type { BuddyUsageApi } from './index'

declare global {
  interface Window {
    buddyUsage: BuddyUsageApi
  }
}
