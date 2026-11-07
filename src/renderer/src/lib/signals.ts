import type { TraceSample } from '@shared/vitals'

/**
 * Rolling buffer of SDK trace samples (pulse waveform / chest motion) with
 * normalised interpolation. Samples arrive in bursts with each metrics
 * packet; a `Playhead` replays them smoothly a little behind real time so the
 * artwork follows the *actual* measured waveform.
 */
export class TraceBuffer {
  private samples: TraceSample[] = []

  constructor(private readonly windowUs: number = 20_000_000) {}

  /** Wall-clock ms when new samples last arrived (0 = never). */
  lastPushAt = 0

  push(batch: TraceSample[], now = Date.now()): void {
    if (batch.length) this.lastPushAt = now
    for (const s of batch) {
      const last = this.samples[this.samples.length - 1]
      if (last && s.t <= last.t) continue
      this.samples.push(s)
    }
    const cutoff = this.lastT - this.windowUs
    let drop = 0
    while (drop < this.samples.length && this.samples[drop].t < cutoff) drop++
    if (drop) this.samples.splice(0, drop)
    this.min = Infinity
    this.max = -Infinity
    for (const s of this.samples) {
      if (s.v < this.min) this.min = s.v
      if (s.v > this.max) this.max = s.v
    }
  }

  private min = Infinity
  private max = -Infinity

  clear(): void {
    this.samples = []
    this.lastPushAt = 0
    this.min = Infinity
    this.max = -Infinity
  }

  get size(): number {
    return this.samples.length
  }

  get firstT(): number {
    return this.samples.length ? this.samples[0].t : NaN
  }

  get lastT(): number {
    return this.samples.length ? this.samples[this.samples.length - 1].t : NaN
  }

  /** Raw interpolated value at time `t` (µs), or null outside the buffer. */
  rawAt(t: number): number | null {
    const s = this.samples
    if (s.length === 0 || t < s[0].t || t > s[s.length - 1].t) return null
    let lo = 0
    let hi = s.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (s[mid].t <= t) lo = mid
      else hi = mid
    }
    const a = s[lo]
    const b = s[hi]
    if (b.t === a.t) return a.v
    const f = (t - a.t) / (b.t - a.t)
    return a.v + (b.v - a.v) * f
  }

  /** Value at `t` normalised to roughly [-1, 1] using the buffer's range. */
  normalizedAt(t: number): number | null {
    const v = this.rawAt(t)
    if (v === null) return null
    const span = this.max - this.min
    if (!(span > 1e-9)) return 0
    return ((v - this.min) / span) * 2 - 1
  }
}

/**
 * Replays a TraceBuffer at real-time speed, held `lagUs` behind the newest
 * sample (packets arrive in bursts). Stays within [lastT - maxLag, lastT].
 */
export class Playhead {
  private pos = NaN

  constructor(
    private readonly lagUs = 1_500_000,
    private readonly maxLagUs = 4_000_000
  ) {}

  reset(): void {
    this.pos = NaN
  }

  advance(buf: TraceBuffer, dtSec: number): number | null {
    if (buf.size < 2) return null
    const last = buf.lastT
    const target = last - this.lagUs
    if (Number.isNaN(this.pos)) this.pos = Math.max(buf.firstT, target)
    else this.pos += dtSec * 1e6
    if (this.pos > last) this.pos = last
    if (this.pos < last - this.maxLagUs) this.pos = last - this.maxLagUs
    if (this.pos < buf.firstT) this.pos = buf.firstT
    return this.pos
  }

  get position(): number {
    return this.pos
  }
}

/**
 * Detects heartbeats as local maxima of the replayed pulse waveform, with a
 * refractory period derived from the plausible maximum heart rate.
 */
export class BeatDetector {
  private prev: number | null = null
  private rising = false
  private lastBeatSec = -Infinity

  constructor(private readonly minIntervalSec = 60 / 200) {}

  reset(): void {
    this.prev = null
    this.rising = false
    this.lastBeatSec = -Infinity
  }

  /** Feed one normalised sample; returns true on a detected beat. */
  update(v: number, nowSec: number): boolean {
    let beat = false
    if (this.prev !== null) {
      if (v > this.prev) this.rising = true
      else if (this.rising && v < this.prev) {
        this.rising = false
        if (this.prev > 0.2 && nowSec - this.lastBeatSec >= this.minIntervalSec) {
          beat = true
          this.lastBeatSec = nowSec
        }
      }
    }
    this.prev = v
    return beat
  }
}
