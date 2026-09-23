import { useEffect, useState } from 'react'
import { useAppStore } from './state/store'
import { Island } from './components/Island'
import { SettingsView } from './components/SettingsView'
import { ActivityView } from './components/ActivityView'
import { WelcomeView } from './components/WelcomeView'

type Route = 'island' | 'settings' | 'activity' | 'welcome'

function routeFromHash(): Route {
  if (window.location.hash === '#settings') return 'settings'
  if (window.location.hash === '#activity') return 'activity'
  if (window.location.hash === '#welcome') return 'welcome'
  return 'island'
}

/** One renderer bundle serves both windows; the URL hash picks the view. */
export function App(): JSX.Element {
  const init = useAppStore((s) => s.init)
  const theme = useAppStore((s) => s.settings?.theme ?? 'auto')
  const [route, setRoute] = useState<Route>(routeFromHash)

  useEffect(() => {
    void init()
    const onHash = (): void => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [init])

  useEffect(() => {
    document.body.dataset.route = route
  }, [route])

  // Resolve "auto" against the OS so CSS only ever sees light/dark.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      document.body.dataset.theme = theme === 'auto' ? (media.matches ? 'dark' : 'light') : theme
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  if (route === 'settings') return <SettingsView />
  if (route === 'activity') return <ActivityView />
  if (route === 'welcome') return <WelcomeView />
  return <Island />
}
