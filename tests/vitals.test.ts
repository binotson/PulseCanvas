/**
 * Schema tests: build real protobuf messages with the SDK's own generated
 * `presage.smartspectra.Metrics` class, round-trip them through the SDK's
 * real `decodeMetrics`, and check `extractVitals` reads the right fields.
 *
 * The numeric values are synthetic test inputs — these tests verify parsing
 * against the official schema, not physiological measurement.
 */
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { createTraceCursor, extractVitals, isInValidatedRange, toNumber, type PbMetricsLike } from '@shared/vitals'

const require = createRequire(import.meta.url)
const messages = require('@smartspectra/node-sdk/messages') as typeof import('@smartspectra/node-sdk/messages')
const { Metrics, decodeMetrics } = messages

const T0 = 1_762_500_000_000_000 // µs since epoch

function roundTrip(obj: Record<string, unknown>): PbMetricsLike {
  const bytes = Metrics.encode(Metrics.fromObject(obj)).finish()
  return decodeMetrics(bytes) as unknown as PbMetricsLike
}

describe('extractVitals with the real SmartSpectra protobuf schema', () => {
  it('reads pulse, breathing and HRV from their documented paths', () => {
    const decoded = roundTrip({
      cardio: {
        pulseRate: [
          { value: 70, confidence: 30, stable: false, timestamp: T0 },
          { value: 72.5, confidence: 88, stable: true, timestamp: T0 + 1_000_000 }
        ],
        arterialPressureTrace: [
          { value: 0.1, timestamp: T0 + 10 },
          { value: 0.4, timestamp: T0 + 20 }
        ],
        hrv: [{ rmssd: 42, sdnn: 55, meanNn: 830, baevsky: 120, confidence: 64, stable: true, timestamp: T0 }]
      },
      breathing: {
        rate: [{ value: 14.2, confidence: 51, stable: true, timestamp: T0 }],
        upperTrace: [
          { value: -0.2, timestamp: T0 + 5 },
          { value: 0.3, timestamp: T0 + 15 }
        ],
        inhaleExhaleRatio: [{ value: 0.8, timestamp: T0 }],
        apnea: [{ detected: false, timestamp: T0 }]
      }
    })
    const u = extractVitals(decoded, createTraceCursor(), 1234)
    expect(u.receivedAt).toBe(1234)
    expect(u.pulse).toEqual({ value: 72.5, confidence: 88, stable: true, timestampUs: T0 + 1_000_000 })
    expect(u.breathing?.value).toBeCloseTo(14.2, 5)
    expect(u.breathing?.stable).toBe(true)
    expect(u.hrv).toMatchObject({ rmssd: 42, sdnn: 55, meanNn: 830, baevsky: 120, confidence: 64, stable: true })
    expect(u.pulseTrace.map((s) => s.v)).toEqual([expect.closeTo(0.1, 5), expect.closeTo(0.4, 5)])
    expect(u.breathingTrace).toHaveLength(2)
    expect(u.inhaleExhaleRatio).toBeCloseTo(0.8, 5)
    expect(u.apneaDetected).toBe(false)
  })

  it('handles an empty Metrics message', () => {
    const u = extractVitals(roundTrip({}), createTraceCursor())
    expect(u.pulse).toBeNull()
    expect(u.breathing).toBeNull()
    expect(u.hrv).toBeNull()
    expect(u.pulseTrace).toEqual([])
    expect(u.apneaDetected).toBeNull()
  })

  it('handles uint64 timestamps decoded as Long objects', () => {
    const decoded = roundTrip({ cardio: { pulseRate: [{ value: 60, confidence: 50, stable: true, timestamp: T0 }] } })
    const ts = decoded.cardio?.pulseRate?.[0]?.timestamp
    expect(toNumber(ts)).toBe(T0)
  })
})

describe('extractVitals validation', () => {
  it('discards physiologically implausible values', () => {
    const u = extractVitals(
      {
        cardio: { pulseRate: [{ value: 400, confidence: 99, stable: true, timestamp: 1 }], hrv: [{ rmssd: 0, timestamp: 1 }] },
        breathing: { rate: [{ value: Number.NaN, timestamp: 1 }] }
      },
      createTraceCursor()
    )
    expect(u.pulse).toBeNull()
    expect(u.breathing).toBeNull()
    expect(u.hrv).toBeNull()
  })

  it('clamps confidence into 0–100', () => {
    const u = extractVitals({ cardio: { pulseRate: [{ value: 80, confidence: 140, timestamp: 1 }] } }, createTraceCursor())
    expect(u.pulse?.confidence).toBe(100)
    expect(u.pulse?.stable).toBe(false)
  })

  it('does not re-emit trace samples already forwarded', () => {
    const cursor = createTraceCursor()
    const a = extractVitals({ cardio: { arterialPressureTrace: [{ value: 1, timestamp: 10 }, { value: 2, timestamp: 20 }] } }, cursor)
    const b = extractVitals(
      { cardio: { arterialPressureTrace: [{ value: 2, timestamp: 20 }, { value: 3, timestamp: 30 }] } },
      cursor
    )
    expect(a.pulseTrace.map((s) => s.t)).toEqual([10, 20])
    expect(b.pulseTrace.map((s) => s.t)).toEqual([30])
  })

  it('sorts and de-duplicates trace samples', () => {
    const u = extractVitals(
      { breathing: { upperTrace: [{ value: 3, timestamp: 30 }, { value: 1, timestamp: 10 }, { value: 9, timestamp: 30 }] } },
      createTraceCursor()
    )
    expect(u.breathingTrace).toEqual([
      { t: 10, v: 1 },
      { t: 30, v: 9 }
    ])
  })

  it('flags values outside the Presage-validated range', () => {
    expect(isInValidatedRange('pulse', 72)).toBe(true)
    expect(isInValidatedRange('pulse', 130)).toBe(false)
    expect(isInValidatedRange('breathing', 3)).toBe(false)
  })
})
