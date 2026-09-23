import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ProviderMeta } from '@shared/types'
import { useAppStore } from '../state/store'
import { ProviderIcon } from './ProviderIcon'
import { Switch } from './Switch'

const SPRING = { type: 'spring', stiffness: 260, damping: 28 } as const

/** How a provider's current state reads on the sign-in step. */
function signInState(status: string | undefined): { label: string; done: boolean } {
  switch (status) {
    case 'ok':
    case 'stale':
      return { label: 'Connected', done: true }
    case 'no_meter':
      return { label: 'Connected · no meter on this plan', done: true }
    case 'error':
      return { label: "Couldn't read the page", done: false }
    case 'loading':
      return { label: 'Checking…', done: false }
    default:
      return { label: 'Not signed in', done: false }
  }
}

/**
 * First run. Three steps, each one thing: which assistants, sign in to
 * them, and where the island lives. Nothing here is required — every step
 * can be skipped and redone from Settings — but going through it once is
 * the difference between "five grey rings" and a working island.
 */
export function WelcomeView(): JSX.Element | null {
  const { providers, settings, usageByProvider, updateSettings, openLogin } = useAppStore()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Welcome to BuddyUsage'
  }, [])

  if (!settings) return null
  const enabled = (p: ProviderMeta): boolean => settings.enabledProviders[p.id] !== false
  const chosen = providers.filter(enabled)
  const connected = chosen.filter((p) => signInState(usageByProvider[p.id]?.status).done)

  async function signIn(providerId: string): Promise<void> {
    setBusy(providerId)
    try {
      await openLogin(providerId)
    } finally {
      setBusy(null)
    }
  }

  function finish(): void {
    void updateSettings({ onboardingSeen: true })
    void window.buddyUsage.closeWelcome()
  }

  const steps = [
    {
      title: 'Know where you stand',
      body: 'BuddyUsage keeps one ring per assistant on the edge of your screen: how much of your plan you have used, when each limit resets, and whether your current pace makes it to the reset.',
      content: (
        <ul className="welcome__points">
          <li>
            <span className="welcome__dot" /> Reads each provider's own usage page. Nothing is uploaded.
          </li>
          <li>
            <span className="welcome__dot" /> Warns you before a limit runs out, not after.
          </li>
          <li>
            <span className="welcome__dot" /> Shows which project and model spent the tokens.
          </li>
        </ul>
      ),
      cta: 'Get started'
    },
    {
      title: 'Which assistants do you use?',
      body: 'Each one you switch on becomes a ring. You can change this any time in Settings.',
      content: (
        <div className="welcome__list">
          {providers.map((provider) => (
            <label className="welcome__row" key={provider.id}>
              <ProviderIcon providerId={provider.id} name={provider.name} size={20} />
              <span className="welcome__name">{provider.name}</span>
              <Switch
                checked={enabled(provider)}
                label={provider.name}
                onChange={(on) =>
                  void updateSettings({ enabledProviders: { ...settings.enabledProviders, [provider.id]: on } })
                }
              />
            </label>
          ))}
        </div>
      ),
      cta: chosen.length > 0 ? 'Next' : 'Skip for now'
    },
    {
      title: 'Sign in once per assistant',
      body: 'A normal browser window opens on that provider’s own login page. BuddyUsage never sees your password; the session stays on this computer.',
      content: (
        <div className="welcome__list">
          {chosen.map((provider) => {
            const state = signInState(usageByProvider[provider.id]?.status)
            return (
              <div className="welcome__row" key={provider.id}>
                <ProviderIcon providerId={provider.id} name={provider.name} size={20} />
                <span className="welcome__name">
                  {provider.name}
                  <span className={state.done ? 'welcome__state welcome__state--ok' : 'welcome__state'}>{state.label}</span>
                </span>
                <button
                  className={state.done ? 'link' : 'button button--small button--tinted'}
                  disabled={busy === provider.id}
                  onClick={() => void signIn(provider.id)}
                >
                  {busy === provider.id ? 'Waiting…' : state.done ? 'Redo' : 'Sign in'}
                </button>
              </div>
            )
          })}
          {chosen.length === 0 && <p className="welcome__muted">No assistants selected. You can add them in Settings later.</p>}
        </div>
      ),
      cta: connected.length > 0 ? 'Next' : 'Skip for now'
    },
    {
      title: "You're set",
      body: 'The island is docked to the right edge of your screen.',
      content: (
        <ul className="welcome__points">
          <li>
            <span className="welcome__dot" /> <span className="welcome__key">Hover</span> a ring for limits, pace and any running agent. <span className="welcome__key">Click</span> to pin it.
          </li>
          <li>
            <span className="welcome__dot" /> <span className="welcome__key">Drag</span> the island anywhere; it snaps to the nearest edge and remembers.
          </li>
          <li>
            <span className="welcome__dot" /> <span className="welcome__key">Right-click</span> a ring, or use the menu bar icon, for refresh, activity and settings.
          </li>
        </ul>
      ),
      cta: 'Done'
    }
  ]

  const current = steps[step]
  const last = step === steps.length - 1

  return (
    <div className="welcome">
      <div className="welcome__progress" aria-hidden="true">
        {steps.map((_, index) => (
          <span key={index} className={index <= step ? 'welcome__tick welcome__tick--on' : 'welcome__tick'} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          className="welcome__body"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={SPRING}
        >
          <h1 className="welcome__title">{current.title}</h1>
          <p className="welcome__lede">{current.body}</p>
          {current.content}
        </motion.div>
      </AnimatePresence>

      <footer className="welcome__foot">
        {step > 0 ? (
          <button className="link" onClick={() => setStep(step - 1)}>
            Back
          </button>
        ) : (
          <button className="link" onClick={finish}>
            Skip
          </button>
        )}
        <button className="button button--primary" onClick={() => (last ? finish() : setStep(step + 1))}>
          {current.cta}
        </button>
      </footer>
    </div>
  )
}
