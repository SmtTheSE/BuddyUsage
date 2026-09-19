import { useEffect, useState } from 'react'
import { useAppStore } from './state/store'
import { Island } from './components/Island'
import { SettingsView } from './components/SettingsView'

type Route = 'island' | 'settings'

function routeFromHash(): Route {
  return window.location.hash === '#settings' ? 'settings' : 'island'
}

/** One renderer bundle serves both windows; the URL hash picks the view. */
export function App(): JSX.Element {
  const init = useAppStore((s) => s.init)
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

  return route === 'settings' ? <SettingsView /> : <Island />
}
