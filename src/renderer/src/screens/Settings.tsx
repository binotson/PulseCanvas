import { CheckCircle2, KeyRound, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ART_MODES, type ArtMode, type CaptureResolution } from '@shared/settings'
import { ART_META } from '../art'
import { Badge, Button, Card, ExternalLink, PageHeader, Toggle } from '../components/ui'
import { app, refreshSdkInfo, toast, updateSettings } from '../lib/session'
import { useStore } from '../lib/store'

function ApiKeyCard(): ReactNode {
  const info = useStore(app, (s) => s.sdkInfo)
  const phase = useStore(app, (s) => s.phase)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const key = info?.apiKey

  const save = async (): Promise<void> => {
    setBusy(true)
    setErr(null)
    try {
      await window.pulse.apiKey.set(value)
      setValue('')
      await refreshSdkInfo()
      toast('API key saved and encrypted on this computer')
    } catch (e) {
      setErr((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2">
        <KeyRound size={18} className="text-violet" />
        <h2 className="text-base font-semibold">SmartSpectra API key</h2>
        <span className="ml-auto">
          {key?.configured ? (
            <Badge tone="ok">
              <CheckCircle2 size={12} /> Configured ({key.source === 'environment' ? 'environment / .env' : 'encrypted on this PC'})
            </Badge>
          ) : (
            <Badge tone="warn">
              <XCircle size={12} /> Not configured
            </Badge>
          )}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Get a free key from the{' '}
        <ExternalLink href="https://physiology.presagetech.com/auth/login">Presage Developer Portal</ExternalLink>. The key
        is kept in PulseCanvas’s main process — the interface never sees it again after you save it.
      </p>
      {key?.source === 'environment' ? (
        <p className="mt-3 text-sm text-muted">
          Using <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">SMARTSPECTRA_API_KEY</code> from the environment
          or the project’s <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">.env</code> file.
        </p>
      ) : (
        <div className="mt-4 flex gap-2">
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={key?.configured ? 'Enter a new key to replace the stored one' : 'Paste your API key'}
            className="min-w-0 flex-1 rounded-xl border border-line bg-ink px-3 py-2.5 text-sm outline-none focus:border-violet"
            aria-label="SmartSpectra API key"
          />
          <Button variant="primary" disabled={!value.trim() || busy || !key?.canStoreSecurely} onClick={() => void save()}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : null} Save key
          </Button>
          {key?.source === 'stored' && (
            <Button
              variant="danger"
              disabled={phase !== 'idle'}
              onClick={async () => {
                await window.pulse.apiKey.clear()
                await refreshSdkInfo()
                toast('Stored API key removed')
              }}
            >
              Remove
            </Button>
          )}
        </div>
      )}
      {key && !key.canStoreSecurely && key.source !== 'environment' && (
        <p className="mt-2 text-xs text-pink">
          OS encryption is unavailable, so the key can’t be stored safely. Set SMARTSPECTRA_API_KEY in your environment instead.
        </p>
      )}
      {err && <p className="mt-2 text-xs text-pink">{err}</p>}
      <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4 text-xs">
        <div>
          <dt className="text-faint">SDK</dt>
          <dd className="mt-0.5 font-medium">
            {info?.available ? `@smartspectra/node-sdk ${info.version}` : 'Not loaded'}
          </dd>
        </div>
        <div>
          <dt className="text-faint">Platform</dt>
          <dd className="mt-0.5 font-medium">{info?.platform}</dd>
        </div>
        <div>
          <dt className="text-faint">Metrics requested</dt>
          <dd className="mt-0.5 font-medium">Breathing + cardio (pulse, pressure trace, HRV)</dd>
        </div>
      </dl>
      {info?.loadError && <p className="mt-3 text-xs text-pink">SDK load error: {info.loadError}</p>}
    </Card>
  )
}

export function Settings(): ReactNode {
  const settings = useStore(app, (s) => s.settings)
  const phase = useStore(app, (s) => s.phase)
  if (!settings) return null
  const v = window.pulse.versions
  return (
    <div className="h-full overflow-y-auto p-10">
      <PageHeader title="Settings" />
      <div className="grid max-w-4xl gap-4">
        <ApiKeyCard />

        <Card>
          <h2 className="mb-1 text-base font-semibold">Camera</h2>
          <div className="flex items-center justify-between gap-6 py-3">
            <div>
              <div className="text-sm font-medium">Capture resolution</div>
              <div className="text-xs text-muted">720p matches the SmartSpectra default. 480p uses less CPU.</div>
            </div>
            <div className="flex rounded-xl border border-line p-1">
              {(['720p', '480p'] as CaptureResolution[]).map((r) => (
                <button
                  key={r}
                  disabled={phase !== 'idle'}
                  onClick={() => void updateSettings({ captureResolution: r })}
                  className={`rounded-lg px-3 py-1.5 text-sm ${settings.captureResolution === r ? 'bg-violet/25' : 'text-muted'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-line border-t border-line">
            <Toggle
              checked={settings.showCameraPreview}
              onChange={(x) => void updateSettings({ showCameraPreview: x })}
              label="Show camera preview in the studio"
            />
            <Toggle
              checked={settings.mirrorPreview}
              onChange={(x) => void updateSettings({ mirrorPreview: x })}
              label="Mirror preview"
              description="Only affects the preview — frames sent to the SDK are never mirrored."
            />
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 text-base font-semibold">Artwork</h2>
          <div className="flex items-center justify-between gap-6 py-3">
            <div className="text-sm font-medium">Default style</div>
            <select
              value={settings.defaultArtMode}
              onChange={(e) => void updateSettings({ defaultArtMode: e.target.value as ArtMode })}
              className="rounded-xl border border-line bg-ink px-3 py-2 text-sm"
            >
              {ART_MODES.map((m) => (
                <option key={m} value={m}>
                  {ART_META[m].name}
                </option>
              ))}
            </select>
          </div>
          <div className="divide-y divide-line border-t border-line">
            <Toggle
              checked={settings.reducedMotion}
              onChange={(x) => void updateSettings({ reducedMotion: x })}
              label="Reduced motion"
              description="Fewer particles and slower movement."
            />
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 text-base font-semibold">Privacy</h2>
          <div className="divide-y divide-line">
            <Toggle
              checked={settings.telemetryEnabled}
              onChange={(x) => void updateSettings({ telemetryEnabled: x })}
              label="Share aggregate SDK telemetry with Presage"
            />
            <Toggle
              checked={settings.saveSessionHistory}
              onChange={(x) => void updateSettings({ saveSessionHistory: x })}
              label="Keep session history"
            />
            <Toggle
              checked={settings.includeVitalsInExports}
              onChange={(x) => void updateSettings({ includeVitalsInExports: x })}
              label="Include vitals in saved artworks"
            />
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-base font-semibold">About</h2>
          <dl className="grid grid-cols-4 gap-4 text-xs">
            <div>
              <dt className="text-faint">PulseCanvas</dt>
              <dd className="mt-0.5 font-medium">{v.app}</dd>
            </div>
            <div>
              <dt className="text-faint">Electron</dt>
              <dd className="mt-0.5 font-medium">{v.electron}</dd>
            </div>
            <div>
              <dt className="text-faint">Chromium</dt>
              <dd className="mt-0.5 font-medium">{v.chrome}</dd>
            </div>
            <div>
              <dt className="text-faint">Node.js</dt>
              <dd className="mt-0.5 font-medium">{v.node}</dd>
            </div>
          </dl>
          <div className="mt-4 flex gap-2">
            <Button
              variant="ghost"
              onClick={() => void updateSettings({ onboardingComplete: false })}
              disabled={phase !== 'idle'}
            >
              <RotateCcw size={14} /> Replay onboarding
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
