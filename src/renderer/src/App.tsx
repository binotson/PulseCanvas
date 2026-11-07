import { Loader2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Sidebar } from './components/Sidebar'
import { app, initApp } from './lib/session'
import { useStore } from './lib/store'
import { Gallery } from './screens/Gallery'
import { Insights } from './screens/Insights'
import { Onboarding } from './screens/Onboarding'
import { Privacy } from './screens/Privacy'
import { Settings } from './screens/Settings'
import { Studio } from './screens/Studio'

function Toast(): ReactNode {
  const toast = useStore(app, (s) => s.toast)
  if (!toast) return null
  return (
    <div
      role="status"
      className={`glass fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm shadow-xl ${
        toast.tone === 'warn' ? 'border-pink/40' : 'border-cyan/30'
      }`}
    >
      {toast.text}
    </div>
  )
}

export default function App(): ReactNode {
  const [ready, setReady] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const settings = useStore(app, (s) => s.settings)
  const route = useStore(app, (s) => s.route)

  useEffect(() => {
    if (!window.pulse) {
      setFatal('The PulseCanvas preload bridge is unavailable.')
      return
    }
    initApp()
      .then(() => setReady(true))
      .catch((e: Error) => setFatal(e.message))
  }, [])

  if (fatal) return <div className="flex h-full items-center justify-center p-10 text-pink">{fatal}</div>
  if (!ready || !settings)
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-violet" />
      </div>
    )

  if (!settings.onboardingComplete || !settings.consentAcceptedAt) return <Onboarding />

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="relative min-w-0 flex-1">
        {/* Studio stays mounted so the artwork keeps evolving while you browse. */}
        <div
          className={`absolute inset-0 ${route === 'studio' ? '' : 'invisible pointer-events-none'}`}
          aria-hidden={route !== 'studio'}
        >
          <Studio />
        </div>
        {route !== 'studio' && (
          <div className="absolute inset-0 bg-ink">
            {route === 'gallery' && <Gallery />}
            {route === 'insights' && <Insights />}
            {route === 'privacy' && <Privacy />}
            {route === 'settings' && <Settings />}
          </div>
        )}
      </main>
      <Toast />
    </div>
  )
}
