import { Activity, Heart, Wind } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isInValidatedRange } from '@shared/vitals'
import { app, signalQuality, type AppState } from '../lib/session'
import { useStore } from '../lib/store'
import { Badge } from './ui'

/** Re-render periodically so "stale" states age out without new events. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

const STALE_MS = 8000

function ConfidenceBadge({ confidence, stable }: { confidence: number; stable: boolean }): ReactNode {
  if (stable) return <Badge tone="ok">Stable · {confidence.toFixed(0)}%</Badge>
  if (confidence > 0) return <Badge tone="info">Stabilising · {confidence.toFixed(0)}%</Badge>
  return <Badge tone="muted">Measuring…</Badge>
}

function VitalCard({
  icon,
  label,
  value,
  unit,
  accent,
  footer,
  empty
}: {
  icon: ReactNode
  label: string
  value: string | null
  unit: string
  accent: string
  footer: ReactNode
  empty: string
}): ReactNode {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
        <span className={accent}>{icon}</span>
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        {value !== null ? (
          <>
            <span className="font-display text-4xl font-semibold tabular-nums tracking-tight">{value}</span>
            <span className="text-sm text-muted">{unit}</span>
          </>
        ) : (
          <span className="py-2 text-sm text-faint">{empty}</span>
        )}
      </div>
      <div className="mt-2 min-h-[22px]">{footer}</div>
    </div>
  )
}

export function VitalsPanel(): ReactNode {
  const pulse = useStore(app, (s) => s.pulse)
  const breathing = useStore(app, (s) => s.breathing)
  const hrv = useStore(app, (s) => s.hrv)
  const phase = useStore(app, (s) => s.phase)
  const now = useNow()
  const active = phase === 'running' || phase === 'starting'
  const fresh = <T,>(r: { at: number; reading: T } | null): T | null => (r && active && now - r.at < STALE_MS ? r.reading : null)

  const p = fresh(pulse)
  const b = fresh(breathing)
  const h = fresh(hrv)

  return (
    <div className="flex flex-col gap-3">
      <VitalCard
        icon={<Heart size={14} />}
        label="Pulse"
        accent="text-pink"
        value={p ? p.value.toFixed(0) : null}
        unit="bpm"
        empty={active ? 'Acquiring — ~12 s window' : 'No live signal'}
        footer={
          p && (
            <div className="flex flex-wrap gap-1.5">
              <ConfidenceBadge confidence={p.confidence} stable={p.stable} />
              {!isInValidatedRange('pulse', p.value) && <Badge tone="warn">Outside validated range</Badge>}
            </div>
          )
        }
      />
      <VitalCard
        icon={<Wind size={14} />}
        label="Breathing"
        accent="text-cyan"
        value={b ? b.value.toFixed(1) : null}
        unit="breaths/min"
        empty={active ? 'Acquiring — ~30 s window' : 'No live signal'}
        footer={
          b && (
            <div className="flex flex-wrap gap-1.5">
              <ConfidenceBadge confidence={b.confidence} stable={b.stable} />
              {!isInValidatedRange('breathing', b.value) && <Badge tone="warn">Outside validated range</Badge>}
            </div>
          )
        }
      />
      <VitalCard
        icon={<Activity size={14} />}
        label="HRV (RMSSD)"
        accent="text-violet"
        value={h ? h.rmssd.toFixed(0) : null}
        unit="ms"
        empty={active ? 'Needs ~60 s of steady pulse' : 'No live signal'}
        footer={
          h && (
            <div className="flex flex-wrap items-center gap-1.5">
              <ConfidenceBadge confidence={h.confidence} stable={h.stable} />
              {h.sdnn > 0 && <span className="text-[11px] text-faint">SDNN {h.sdnn.toFixed(0)} ms</span>}
            </div>
          )
        }
      />
    </div>
  )
}

const LEVEL_COLOR = { none: 'bg-white/20', poor: 'bg-pink', fair: 'bg-violet', good: 'bg-cyan' } as const

export function QualityPanel(): ReactNode {
  const s = useStore(app, (st) => st)
  const now = useNow(500)
  const q = signalQuality(s as AppState, now)
  const v = s.validation
  const active = s.phase === 'running' || s.phase === 'starting'
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted">
        <span>Signal quality</span>
        <span className="normal-case tracking-normal text-faint">
          {active ? `${s.cameraFps.toFixed(0)} fps` : '—'}
        </span>
      </div>
      <div className="mt-3 flex gap-1" aria-label={`Signal quality: ${q.label}`}>
        {[0.15, 0.4, 0.65, 0.85].map((th) => (
          <span key={th} className={`h-1.5 flex-1 rounded-full ${active && q.score >= th ? LEVEL_COLOR[q.level] : 'bg-white/10'}`} />
        ))}
      </div>
      <div className="mt-3 text-sm font-medium">{active ? (v ? v.title : q.label) : 'Not measuring'}</div>
      <div className="mt-0.5 text-xs leading-relaxed text-muted">
        {active ? (v ? v.guidance : 'Waiting for the SDK readiness check…') : 'Start a session to see live guidance.'}
      </div>
      {active && s.cameraFps > 0 && s.cameraFps < 24 && (
        <div className="mt-2 text-xs text-pink">Camera is below the ~25 fps SmartSpectra recommends.</div>
      )}
    </div>
  )
}

export function CameraPreview({ mirror }: { mirror: boolean }): ReactNode {
  const stream = useStore(app, (s) => s.stream)
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  if (!stream) return null
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <video
        ref={ref}
        autoPlay
        muted
        playsInline
        className="aspect-video w-full object-cover"
        style={{ transform: mirror ? 'scaleX(-1)' : undefined }}
        aria-label="Camera preview (stays on this device)"
      />
      <div className="px-3 py-1.5 text-[10px] text-faint">Preview · processed on this device</div>
    </div>
  )
}

/** Small SVG line chart. */
export function Sparkline({
  points,
  color,
  height = 64
}: {
  points: { t: number; v: number }[]
  color: string
  height?: number
}): ReactNode {
  if (points.length < 2) return <div className="flex h-16 items-center text-xs text-faint">Not enough readings yet</div>
  const w = 300
  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  let min = Infinity
  let max = -Infinity
  for (const p of points) {
    min = Math.min(min, p.v)
    max = Math.max(max, p.v)
  }
  const pad = (max - min) * 0.15 || 1
  min -= pad
  max += pad
  const d = points
    .map((p, i) => {
      const x = ((p.t - t0) / (t1 - t0 || 1)) * w
      const y = height - ((p.v - min) / (max - min)) * height
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}
