import type { RateReading } from './vitals'

export type QualityLevel = 'none' | 'poor' | 'fair' | 'good'

export interface SignalQuality {
  level: QualityLevel
  /** 0–1 combined score. */
  score: number
  label: string
}

/**
 * Combine the SDK's readiness verdict with per-metric confidence into a single
 * user-facing quality indicator.
 *
 * - No validation `kOk` → at most "poor" (the SDK itself is saying conditions
 *   are not right).
 * - With `kOk`, quality follows the best available SDK confidence, using the
 *   SDK's own `stable` flag as the "good" gate.
 * - Readings older than `staleMs` do not count.
 */
export function computeSignalQuality(input: {
  validationOk: boolean
  pulse: RateReading | null
  breathing: RateReading | null
  pulseAgeMs: number
  breathingAgeMs: number
  staleMs?: number
}): SignalQuality {
  const staleMs = input.staleMs ?? 5000
  const pulse = input.pulse && input.pulseAgeMs <= staleMs ? input.pulse : null
  const breathing = input.breathing && input.breathingAgeMs <= staleMs ? input.breathing : null

  const confs = [pulse?.confidence ?? 0, breathing?.confidence ?? 0]
  const best = Math.max(...confs) / 100
  const anyStable = (pulse?.stable ?? false) || (breathing?.stable ?? false)

  if (!input.validationOk) {
    if (!pulse && !breathing) return { level: 'none', score: 0, label: 'Waiting for a clear view' }
    return { level: 'poor', score: Math.min(0.3, best), label: 'Adjust position' }
  }
  if (!pulse && !breathing) return { level: 'fair', score: 0.35, label: 'Acquiring signal…' }
  if (anyStable) return { level: 'good', score: Math.max(0.7, best), label: 'Stable signal' }
  if (best >= 0.2) return { level: 'fair', score: best, label: 'Stabilising…' }
  return { level: 'poor', score: best, label: 'Low confidence' }
}
