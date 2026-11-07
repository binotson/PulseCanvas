/**
 * Vitals data model shared by main and renderer, plus the pure function that
 * turns a decoded SmartSpectra `presage.smartspectra.Metrics` protobuf message
 * into a compact, JSON-safe `VitalsUpdate`.
 *
 * Field paths verified against @smartspectra/node-sdk 3.4.0
 * (js/messages/generated.d.ts):
 *   Metrics.cardio.pulseRate[]            MeasurementWithConfidence (bpm)
 *   Metrics.cardio.arterialPressureTrace[] MeasurementWithConfidence (unitless)
 *   Metrics.cardio.hrv[]                  Hrv { rmssd, sdnn, meanNn, baevsky, confidence, stable }
 *   Metrics.breathing.rate[]              MeasurementWithConfidence (breaths/min)
 *   Metrics.breathing.upperTrace[]        Measurement (chest movement, unitless)
 *   Metrics.breathing.inhaleExhaleRatio[] Measurement
 *   Metrics.breathing.apnea[]             DetectionStatus
 *
 * Timestamps are uint64 microseconds; protobufjs may surface them as `Long`.
 */

/** A rate measurement (pulse bpm or breathing rpm) with SDK confidence. */
export interface RateReading {
  value: number
  /** SDK confidence, 0–100. */
  confidence: number
  /** SDK verdict: confidence meets Presage's minimum accuracy standard. */
  stable: boolean
  timestampUs: number
}

export interface HrvReading {
  /** Root mean square of successive differences, ms. */
  rmssd: number
  /** Standard deviation of NN intervals, ms. */
  sdnn: number
  /** Mean NN interval, ms. */
  meanNn: number
  baevsky: number | null
  confidence: number
  stable: boolean
  timestampUs: number
}

export interface TraceSample {
  /** Microseconds since Unix epoch. */
  t: number
  v: number
}

/** One decoded metrics packet, reduced to what PulseCanvas uses. */
export interface VitalsUpdate {
  receivedAt: number
  pulse: RateReading | null
  breathing: RateReading | null
  hrv: HrvReading | null
  /** New arterial-pressure (pulse waveform) samples since the previous update. */
  pulseTrace: TraceSample[]
  /** New chest-breathing trace samples since the previous update. */
  breathingTrace: TraceSample[]
  inhaleExhaleRatio: number | null
  apneaDetected: boolean | null
}

/**
 * Ranges documented by Presage as the validated operating ranges
 * (https://smartspectra.presagetech.com/docs/). Readings outside these are
 * still displayed but flagged.
 */
export const PULSE_VALIDATED_RANGE = { min: 40, max: 110 } as const
export const BREATHING_VALIDATED_RANGE = { min: 5, max: 40 } as const

/**
 * Hard physiological plausibility bounds. Anything outside is treated as a
 * processing artefact and discarded rather than shown.
 */
export const PULSE_PLAUSIBLE_RANGE = { min: 25, max: 240 } as const
export const BREATHING_PLAUSIBLE_RANGE = { min: 1, max: 70 } as const
export const HRV_RMSSD_PLAUSIBLE_RANGE = { min: 1, max: 400 } as const

// ---------------------------------------------------------------------------
// Minimal structural typing of the protobuf message (so this module does not
// depend on the native SDK package and can run in the renderer and in tests).

type LongLike = number | { toNumber(): number } | string | null | undefined

interface PbMeasurement {
  value?: number | null
  stable?: boolean | null
  confidence?: number | null
  timestamp?: LongLike
}

interface PbHrv {
  rmssd?: number | null
  sdnn?: number | null
  meanNn?: number | null
  baevsky?: number | null
  confidence?: number | null
  stable?: boolean | null
  timestamp?: LongLike
}

interface PbDetection {
  detected?: boolean | null
  timestamp?: LongLike
}

export interface PbMetricsLike {
  cardio?: {
    pulseRate?: PbMeasurement[] | null
    arterialPressureTrace?: PbMeasurement[] | null
    hrv?: PbHrv[] | null
  } | null
  breathing?: {
    rate?: PbMeasurement[] | null
    upperTrace?: PbMeasurement[] | null
    inhaleExhaleRatio?: PbMeasurement[] | null
    apnea?: PbDetection[] | null
  } | null
}

export function toNumber(v: LongLike): number {
  if (v === null || v === undefined) return NaN
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Number(v)
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return NaN
}

function inRange(v: number, r: { min: number; max: number }): boolean {
  return Number.isFinite(v) && v >= r.min && v <= r.max
}

function latest<T extends { timestamp?: LongLike }>(arr: T[] | null | undefined): T | null {
  if (!arr || arr.length === 0) return null
  let best: T | null = null
  let bestT = -Infinity
  for (const m of arr) {
    const t = toNumber(m.timestamp)
    // Entries without a timestamp keep array order (last wins).
    const key = Number.isFinite(t) ? t : bestT
    if (key >= bestT) {
      best = m
      bestT = key
    }
  }
  return best
}

function clampConfidence(c: number | null | undefined): number {
  if (typeof c !== 'number' || !Number.isFinite(c)) return 0
  return Math.max(0, Math.min(100, c))
}

function rateFrom(
  arr: PbMeasurement[] | null | undefined,
  plausible: { min: number; max: number }
): RateReading | null {
  const m = latest(arr)
  if (!m) return null
  const value = typeof m.value === 'number' ? m.value : NaN
  if (!inRange(value, plausible)) return null
  return {
    value,
    confidence: clampConfidence(m.confidence),
    stable: m.stable === true,
    timestampUs: toNumber(m.timestamp) || 0
  }
}

function traceFrom(arr: PbMeasurement[] | null | undefined, afterUs: number): TraceSample[] {
  if (!arr || arr.length === 0) return []
  const out: TraceSample[] = []
  for (const m of arr) {
    const t = toNumber(m.timestamp)
    const v = typeof m.value === 'number' ? m.value : NaN
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue
    if (t <= afterUs) continue
    out.push({ t, v })
  }
  out.sort((a, b) => a.t - b.t)
  // De-duplicate identical timestamps (keep last value).
  const dedup: TraceSample[] = []
  for (const s of out) {
    if (dedup.length && dedup[dedup.length - 1].t === s.t) dedup[dedup.length - 1] = s
    else dedup.push(s)
  }
  return dedup
}

/** Cursor so each trace sample is forwarded exactly once. */
export interface TraceCursor {
  pulseUs: number
  breathingUs: number
}

export function createTraceCursor(): TraceCursor {
  return { pulseUs: -Infinity, breathingUs: -Infinity }
}

/**
 * Extract a VitalsUpdate from a decoded Metrics message. Mutates `cursor`
 * so repeated trace samples (SDK packets can overlap) are not re-emitted.
 */
export function extractVitals(
  metrics: PbMetricsLike,
  cursor: TraceCursor,
  now: number = Date.now()
): VitalsUpdate {
  const cardio = metrics.cardio ?? null
  const breathing = metrics.breathing ?? null

  const pulseTrace = traceFrom(cardio?.arterialPressureTrace, cursor.pulseUs)
  if (pulseTrace.length) cursor.pulseUs = pulseTrace[pulseTrace.length - 1].t

  const breathingTrace = traceFrom(breathing?.upperTrace, cursor.breathingUs)
  if (breathingTrace.length) cursor.breathingUs = breathingTrace[breathingTrace.length - 1].t

  let hrv: HrvReading | null = null
  const h = latest(cardio?.hrv)
  if (h) {
    const rmssd = typeof h.rmssd === 'number' ? h.rmssd : NaN
    if (inRange(rmssd, HRV_RMSSD_PLAUSIBLE_RANGE)) {
      hrv = {
        rmssd,
        sdnn: typeof h.sdnn === 'number' && Number.isFinite(h.sdnn) ? h.sdnn : 0,
        meanNn: typeof h.meanNn === 'number' && Number.isFinite(h.meanNn) ? h.meanNn : 0,
        baevsky: typeof h.baevsky === 'number' && Number.isFinite(h.baevsky) ? h.baevsky : null,
        confidence: clampConfidence(h.confidence),
        stable: h.stable === true,
        timestampUs: toNumber(h.timestamp) || 0
      }
    }
  }

  const ie = latest(breathing?.inhaleExhaleRatio)
  const ieValue = ie && typeof ie.value === 'number' && Number.isFinite(ie.value) && ie.value > 0 ? ie.value : null

  const apnea = latest(breathing?.apnea)

  return {
    receivedAt: now,
    pulse: rateFrom(cardio?.pulseRate, PULSE_PLAUSIBLE_RANGE),
    breathing: rateFrom(breathing?.rate, BREATHING_PLAUSIBLE_RANGE),
    hrv,
    pulseTrace,
    breathingTrace,
    inhaleExhaleRatio: ieValue,
    apneaDetected: apnea ? apnea.detected === true : null
  }
}

export function isInValidatedRange(kind: 'pulse' | 'breathing', value: number): boolean {
  return inRange(value, kind === 'pulse' ? PULSE_VALIDATED_RANGE : BREATHING_VALIDATED_RANGE)
}
