import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/global.css'

if (import.meta.env.DEV && !window.buddyUsage) {
  const { installDevMock } = await import('./devMock')
  installDevMock()
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
