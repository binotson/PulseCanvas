import type { SessionSummary } from '@shared/api'
import type { ArtMode } from '@shared/settings'
import type { HrvReading, RateReading } from '@shared/vitals'

export interface SeriesPoint {
  t: number
  v: number
  confidence: number
  stable: boolean
}

/**
 * Accumulates genuine SDK readings over one session for Session Insights.
 * Only rate readings are kept (not raw waveforms, never frames), and only in
 * memory unless the user opts into session history — which stores just the
 * summary statistics.
 */
export class SessionRecorder {
  readonly startedAt = Date.now()
  readonly pulse: SeriesPoint[] = []
  readonly breathing: SeriesPoint[] = []
  lastHrv: HrvReading | null = null
  private okMs = 0
  private trackedMs = 0
  private lastValidationAt = this.startedAt
  private lastValidationOk = false
  private lastPulseT = -1
  private lastBreathT = -1

  addPulse(r: RateReading): void {
    if (r.timestampUs === this.lastPulseT) return
    this.lastPulseT = r.timestampUs
    this.pulse.push({ t: Date.now(), v: r.value, confidence: r.confidence, stable: r.stable })
  }

  addBreathing(r: RateReading): void {
    if (r.timestampUs === this.lastBreathT) return
    this.lastBreathT = r.timestampUs
    this.breathing.push({ t: Date.now(), v: r.value, confidence: r.confidence, stable: r.stable })
  }

  addHrv(h: HrvReading): void {
    this.lastHrv = h
  }

  /** Track how long the SDK reported kOk validation. */
  validation(ok: boolean, now = Date.now()): void {
    const dt = now - this.lastValidationAt
    if (dt > 0) {
      this.trackedMs += dt
      if (this.lastValidationOk) this.okMs += dt
    }
    this.lastValidationAt = now
    this.lastValidationOk = ok
  }

  get validationOkRatio(): number {
    return this.trackedMs > 0 ? this.okMs / this.trackedMs : 0
  }

  summarize(mode: ArtMode, endedAt = Date.now()): SessionSummary {
    this.validation(this.lastValidationOk, endedAt)
    return {
      id: crypto.randomUUID(),
      startedAt: new Date(this.startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationSec: Math.round((endedAt - this.startedAt) / 1000),
      mode,
      pulse: summarizeSeries(this.pulse),
      breathing: summarizeSeries(this.breathing),
      hrv: this.lastHrv
        ? { lastRmssd: this.lastHrv.rmssd, lastSdnn: this.lastHrv.sdnn, confidence: this.lastHrv.confidence }
        : null,
      validationOkRatio: this.validationOkRatio
    }
  }
}

/**
 * Stats over a series. Prefers SDK-`stable` readings; falls back to all
 * readings if none were stable (and the UI labels them as such).
 */
export function summarizeSeries(series: SeriesPoint[]): SessionSummary['pulse'] {
  if (!series.length) return null
  const stable = series.filter((p) => p.stable)
  const use = stable.length ? stable : series
  let sum = 0
  let min = Infinity
  let max = -Infinity
  for (const p of use) {
    sum += p.v
    if (p.v < min) min = p.v
    if (p.v > max) max = p.v
  }
  return { avg: sum / use.length, min, max, samples: use.length }
}
