import { describe, expect, it } from 'vitest'
import { FrameTimestampAnchor, validateFrameMessage } from '@shared/frames'
import { computeSignalQuality } from '@shared/quality'
import { BeatDetector, Playhead, TraceBuffer } from '../src/renderer/src/lib/signals'
import { SignalDriver } from '../src/renderer/src/art/driver'

describe('TraceBuffer', () => {
  it('interpolates and normalises', () => {
    const b = new TraceBuffer()
    b.push([
      { t: 0, v: 0 },
      { t: 100, v: 10 },
      { t: 200, v: 0 }
    ])
    expect(b.rawAt(50)).toBe(5)
    expect(b.normalizedAt(100)).toBe(1)
    expect(b.normalizedAt(0)).toBe(-1)
    expect(b.rawAt(300)).toBeNull()
  })
  it('ignores out-of-order samples and trims to its window', () => {
    const b = new TraceBuffer(1000)
    b.push([{ t: 0, v: 1 }, { t: 500, v: 2 }])
    b.push([{ t: 400, v: 99 }, { t: 2000, v: 3 }])
    expect(b.size).toBe(1)
    expect(b.firstT).toBe(2000)
  })
  it('records when samples last arrived', () => {
    const b = new TraceBuffer()
    b.push([], 5)
    expect(b.lastPushAt).toBe(0)
    b.push([{ t: 1, v: 1 }], 7)
    expect(b.lastPushAt).toBe(7)
  })
})

describe('Playhead', () => {
  it('stays behind the newest sample within the lag window', () => {
    const b = new TraceBuffer()
    b.push(Array.from({ length: 50 }, (_, i) => ({ t: i * 100_000, v: Math.sin(i) })))
    const p = new Playhead(1_000_000, 3_000_000)
    const first = p.advance(b, 0)!
    expect(first).toBe(b.lastT - 1_000_000)
    const later = p.advance(b, 10)! // a long stall
    expect(later).toBe(b.lastT)
  })
  it('returns null without data', () => {
    expect(new Playhead().advance(new TraceBuffer(), 0.016)).toBeNull()
  })
})

describe('BeatDetector', () => {
  it('detects peaks with a refractory period', () => {
    const d = new BeatDetector(0.3)
    let beats = 0
    // 1 Hz sine sampled at 60 Hz for 5 s → 5 peaks
    for (let i = 0; i < 300; i++) if (d.update(Math.sin((i / 60) * Math.PI * 2), i / 60)) beats++
    expect(beats).toBe(5)
  })
})

describe('FrameTimestampAnchor', () => {
  it('anchors to epoch microseconds and is strictly monotonic', () => {
    const a = new FrameTimestampAnchor()
    const t1 = a.next(1000, 1_700_000_000_000)
    expect(t1).toBe(1_700_000_000_000_000)
    expect(a.next(2000)).toBe(t1 + 1000)
    expect(a.next(500)).toBe(t1 + 1001) // went backwards → ratchet
    expect(a.next(500)).toBe(t1 + 1002)
  })
})

describe('validateFrameMessage', () => {
  it('accepts tightly packed RGBA', () => {
    expect(validateFrameMessage({ buffer: new ArrayBuffer(16), width: 2, height: 2, timestampUs: 1 })).not.toBeNull()
  })
  it.each([
    [{ buffer: new ArrayBuffer(15), width: 2, height: 2, timestampUs: 1 }],
    [{ buffer: new ArrayBuffer(16), width: 2.5, height: 2, timestampUs: 1 }],
    [{ buffer: new ArrayBuffer(16), width: 2, height: 2, timestampUs: -1 }],
    [{ buffer: new ArrayBuffer(16), width: 9000, height: 2, timestampUs: 1 }],
    [{ buffer: new Uint8Array(16), width: 2, height: 2, timestampUs: 1 }],
    ['frame']
  ])('rejects %j', (m) => {
    expect(validateFrameMessage(m)).toBeNull()
  })
})

describe('computeSignalQuality', () => {
  const r = (confidence: number, stable: boolean) => ({ value: 70, confidence, stable, timestampUs: 1 })
  it('is "none" with no readiness and no readings', () => {
    expect(computeSignalQuality({ validationOk: false, pulse: null, breathing: null, pulseAgeMs: 0, breathingAgeMs: 0 }).level).toBe('none')
  })
  it('is "good" only when the SDK marks a reading stable', () => {
    expect(computeSignalQuality({ validationOk: true, pulse: r(90, true), breathing: null, pulseAgeMs: 0, breathingAgeMs: 0 }).level).toBe('good')
    expect(computeSignalQuality({ validationOk: true, pulse: r(90, false), breathing: null, pulseAgeMs: 0, breathingAgeMs: 0 }).level).toBe('fair')
  })
  it('caps quality when validation is not OK', () => {
    const q = computeSignalQuality({ validationOk: false, pulse: r(95, true), breathing: null, pulseAgeMs: 0, breathingAgeMs: 0 })
    expect(q.level).toBe('poor')
    expect(q.score).toBeLessThanOrEqual(0.3)
  })
  it('ignores stale readings', () => {
    const q = computeSignalQuality({ validationOk: true, pulse: r(95, true), breathing: null, pulseAgeMs: 60_000, breathingAgeMs: 0 })
    expect(q.label).toMatch(/Acquiring/)
  })
})

describe('SignalDriver', () => {
  it('reports no physiological values when not live', () => {
    const d = new SignalDriver(new TraceBuffer(), new TraceBuffer())
    const s = d.step({ live: false, pulse: { value: 80, confidence: 90, stable: true, timestampUs: 1 }, breathing: null, hrv: null, quality: 1, reducedMotion: false })
    expect(s.pulseBpm).toBeNull()
    expect(s.pulseSource).toBe('none')
    expect(s.quality).toBe(0)
    expect(s.pulseHistory(0)).toBeNull()
  })
  it('uses the SDK waveform when fresh trace samples exist', () => {
    const pulse = new TraceBuffer()
    const now = Date.now()
    pulse.push(Array.from({ length: 60 }, (_, i) => ({ t: i * 50_000, v: Math.sin(i / 3) })), now)
    const d = new SignalDriver(pulse, new TraceBuffer())
    const s = d.step({ live: true, pulse: { value: 70, confidence: 80, stable: true, timestampUs: 1 }, breathing: null, hrv: null, quality: 0.8, reducedMotion: false })
    expect(s.pulseSource).toBe('trace')
    expect(s.pulseBpm).toBe(70)
    expect(s.pulseHistory(0.2)).not.toBeNull()
  })
  it('falls back to measured-rate timing without a waveform', () => {
    const d = new SignalDriver(new TraceBuffer(), new TraceBuffer())
    const s = d.step({ live: true, pulse: { value: 60, confidence: 50, stable: false, timestampUs: 1 }, breathing: { value: 12, confidence: 50, stable: true, timestampUs: 1 }, hrv: null, quality: 0.5, reducedMotion: false })
    expect(s.pulseSource).toBe('rate')
    expect(s.breathSource).toBe('rate')
  })
})
