import { Camera, Download, Eraser, Loader2, Maximize2, Minimize2, Play, Square, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ART_MODES, type ArtMode } from '@shared/settings'
import { ART_META } from '../art'
import { ArtCanvas, type ArtCanvasHandle } from '../components/ArtCanvas'
import { CameraPreview, QualityPanel, VitalsPanel } from '../components/Vitals'
import { Button } from '../components/ui'
import { app, navigate, startSession, stopSession, toast } from '../lib/session'
import { useStore } from '../lib/store'

function SessionTimer({ startedAt }: { startedAt: number }): ReactNode {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000))
  return (
    <span className="tabular-nums">
      {Math.floor(sec / 60)}:{(sec % 60).toString().padStart(2, '0')}
    </span>
  )
}

export function Studio(): ReactNode {
  const settings = useStore(app, (s) => s.settings)
  const sdkInfo = useStore(app, (s) => s.sdkInfo)
  const mode = useStore(app, (s) => s.mode)
  const phase = useStore(app, (s) => s.phase)
  const error = useStore(app, (s) => s.error)
  const startedAt = useStore(app, (s) => s.sessionStartedAt)
  const pulse = useStore(app, (s) => s.pulse)
  const breathing = useStore(app, (s) => s.breathing)
  const hrv = useStore(app, (s) => s.hrv)
  const canvasRef = useRef<ArtCanvasHandle>(null)
  const [describe, setDescribe] = useState('')
  const [immersive, setImmersive] = useState(false)
  const [saving, setSaving] = useState(false)

  const busy = phase === 'camera' || phase === 'starting' || phase === 'stopping'
  const active = phase === 'running' || phase === 'starting'
  const keyMissing = sdkInfo && !sdkInfo.apiKey.configured
  const sdkMissing = sdkInfo && !sdkInfo.available

  const setMode = (m: ArtMode): void => app.set({ mode: m })

  const caption = (): string | null => {
    if (!settings?.includeVitalsInExports) return null
    const parts: string[] = []
    if (pulse) parts.push(`${pulse.reading.value.toFixed(0)} bpm`)
    if (breathing) parts.push(`${breathing.reading.value.toFixed(1)} breaths/min`)
    if (hrv) parts.push(`HRV ${hrv.reading.rmssd.toFixed(0)} ms`)
    return parts.length ? `${ART_META[mode].name} · ${parts.join(' · ')}` : null
  }

  const save = async (): Promise<void> => {
    const dataUrl = canvasRef.current?.capture(caption())
    if (!dataUrl) return
    setSaving(true)
    try {
      const stamp = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      await window.pulse.gallery.save({ dataUrl, mode, title: `${ART_META[mode].name} — ${stamp}`, caption: caption() })
      toast('Artwork saved to your local gallery')
    } catch (err) {
      toast(`Could not save: ${(err as Error).message}`, 'warn')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <ArtCanvas ref={canvasRef} mode={mode} reducedMotion={!!settings?.reducedMotion} onDescribe={setDescribe} />

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-5">
        <div className="glass pointer-events-auto flex rounded-2xl p-1" role="tablist" aria-label="Artwork style">
          {ART_MODES.map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={m === mode}
              onClick={() => setMode(m)}
              className={`rounded-xl px-4 py-2 text-sm transition ${
                m === mode ? 'bg-violet/25 text-text shadow-inner' : 'text-muted hover:text-text'
              }`}
            >
              {ART_META[m].name}
            </button>
          ))}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {active && startedAt && (
            <div className="glass flex items-center gap-2 rounded-xl px-3 py-2 text-sm">
              <span className="pc-live-dot h-2 w-2 rounded-full bg-pink" />
              Live · <SessionTimer startedAt={startedAt} />
            </div>
          )}
          <Button variant="ghost" className="glass" onClick={() => setImmersive((v) => !v)} title="Toggle panels">
            {immersive ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </Button>
          {active || phase === 'stopping' ? (
            <Button variant="danger" disabled={busy && phase !== 'starting'} onClick={() => void stopSession()}>
              {phase === 'stopping' ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} />}
              Stop session
            </Button>
          ) : (
            <Button variant="primary" disabled={busy || !!keyMissing || !!sdkMissing} onClick={() => void startSession()}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              {phase === 'camera' ? 'Opening camera…' : 'Start live session'}
            </Button>
          )}
        </div>
      </div>

      {/* Setup / error banners */}
      <div className="pointer-events-none absolute inset-x-0 top-20 flex flex-col items-center gap-2 px-5">
        {sdkMissing && (
          <Banner tone="warn">
            The SmartSpectra SDK could not load on this machine: {sdkInfo?.loadError}
          </Banner>
        )}
        {!sdkMissing && keyMissing && (
          <Banner tone="info">
            Add your SmartSpectra API key to start measuring.{' '}
            <button className="pointer-events-auto font-medium text-cyan underline" onClick={() => navigate('settings')}>
              Open Settings
            </button>
          </Banner>
        )}
        {error && (
          <Banner tone="warn" onClose={() => app.set({ error: null })}>
            <strong className="font-semibold">{error.title}.</strong> {error.message}
          </Banner>
        )}
      </div>

      {/* Right column */}
      {!immersive && (
        <aside className="absolute bottom-5 right-5 top-24 flex w-[272px] flex-col gap-3 overflow-y-auto pb-1">
          <VitalsPanel />
          <QualityPanel />
          {settings?.showCameraPreview && <CameraPreview mirror={settings.mirrorPreview} />}
        </aside>
      )}

      {/* Bottom-left legend + actions */}
      <div className="pointer-events-none absolute bottom-5 left-5 right-[300px] flex items-end justify-between gap-4">
        {!immersive && (
          <div className="glass pointer-events-auto max-w-xl rounded-2xl px-4 py-3">
            <div className="font-display text-lg font-semibold">{ART_META[mode].name}</div>
            <div className="text-xs text-muted">{describe || ART_META[mode].tagline}</div>
          </div>
        )}
        <div className="pointer-events-auto ml-auto flex gap-2">
          <Button variant="secondary" className="glass" onClick={() => canvasRef.current?.reset()} title="Clear canvas">
            <Eraser size={16} /> Clear
          </Button>
          <Button variant="secondary" className="glass" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Save artwork
          </Button>
        </div>
      </div>

      {phase === 'idle' && !keyMissing && !sdkMissing && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="glass pointer-events-auto max-w-md rounded-3xl p-7 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet/20 text-violet">
              <Camera size={22} />
            </div>
            <h2 className="font-display text-xl font-semibold">Your body is the brush</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Sit about an arm’s length from the camera in soft, even light. Your pulse and breathing — measured on this
              device by Presage SmartSpectra — will paint the canvas in real time.
            </p>
            <Button variant="primary" className="mt-5" onClick={() => void startSession()}>
              <Play size={16} /> Start live session
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Banner({ tone, children, onClose }: { tone: 'warn' | 'info'; children: ReactNode; onClose?: () => void }): ReactNode {
  return (
    <div
      role={tone === 'warn' ? 'alert' : 'status'}
      className={`glass pointer-events-auto flex max-w-2xl items-start gap-3 rounded-2xl px-4 py-3 text-sm ${
        tone === 'warn' ? 'border-pink/30' : 'border-violet/30'
      }`}
    >
      <TriangleAlert size={16} className={`mt-0.5 shrink-0 ${tone === 'warn' ? 'text-pink' : 'text-violet'}`} />
      <div className="leading-relaxed">{children}</div>
      {onClose && (
        <button onClick={onClose} className="ml-2 text-muted hover:text-text" aria-label="Dismiss">
          <X size={16} />
        </button>
      )}
    </div>
  )
}
