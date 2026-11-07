import type { HrvReading, RateReading } from '@shared/vitals'
import { BeatDetector, Playhead, TraceBuffer } from '../lib/signals'

/**
 * Everything an art engine may read on a given animation frame.
 * All physiological fields come from genuine SmartSpectra readings; when no
 * reading exists they are null/0 and `live` is false. Nothing is invented.
 */
export interface ArtSignals {
  /** Seconds since the engine started. */
  time: number
  dt: number
  /** A session is running and at least one recent reading exists. */
  live: boolean
  pulseBpm: number | null
  /** 0–1 */
  pulseConfidence: number
  /** Measured pulse waveform (arterial pressure trace), normalised to −1…1. */
  pulseWave: number
  /** 'trace' = SDK waveform, 'rate' = rhythm timed from measured bpm. */
  pulseSource: 'trace' | 'rate' | 'none'
  /** Envelope 1→0 after each detected beat. */
  beat: number
  beatCount: number
  breathRpm: number | null
  breathConfidence: number
  /** Measured chest-motion trace normalised to −1…1. */
  breathWave: number
  breathSource: 'trace' | 'rate' | 'none'
  /** Count of completed breath cycles (rising zero crossings). */
  breathCount: number
  hrvRmssd: number | null
  /** 0–1 combined signal quality. */
  quality: number
  /** Sample the pulse waveform `secondsAgo` behind the playhead (null if unavailable). */
  pulseHistory(secondsAgo: number): number | null
  breathHistory(secondsAgo: number): number | null
}

export interface DriverInputs {
  live: boolean
  pulse: RateReading | null
  breathing: RateReading | null
  hrv: HrvReading | null
  quality: number
  reducedMotion: boolean
}

const STALE_TRACE_MS = 6000

/** Converts buffered SDK data into per-frame ArtSignals. */
export class SignalDriver {
  private pulsePlay = new Playhead()
  private breathPlay = new Playhead(2_000_000, 6_000_000)
  private beats = new BeatDetector()
  private beatEnv = 0
  private beatCount = 0
  private ratePhase = 0
  private breathPhase = 0
  private prevBreath = 0
  private breathCount = 0
  private start = performance.now()
  private last = performance.now()

  constructor(
    private readonly pulseBuf: TraceBuffer,
    private readonly breathBuf: TraceBuffer
  ) {}

  reset(): void {
    this.pulsePlay.reset()
    this.breathPlay.reset()
    this.beats.reset()
    this.beatEnv = 0
    this.beatCount = 0
    this.breathCount = 0
  }

  step(inp: DriverInputs, nowMs = performance.now()): ArtSignals {
    const dt = Math.min(0.1, Math.max(0, (nowMs - this.last) / 1000))
    this.last = nowMs
    const time = (nowMs - this.start) / 1000

    const live = inp.live
    const bpm = live && inp.pulse ? inp.pulse.value : null
    const rpm = live && inp.breathing ? inp.breathing.value : null

    // ---- pulse
    let pulseWave = 0
    let pulseSource: ArtSignals['pulseSource'] = 'none'
    let beat = false
    const pPos = live ? this.pulsePlay.advance(this.pulseBuf, dt) : null
    const pulseFresh = pPos !== null && Date.now() - this.pulseBuf.lastPushAt < STALE_TRACE_MS
    if (pPos !== null && pulseFresh) {
      const v = this.pulseBuf.normalizedAt(pPos)
      if (v !== null) {
        pulseWave = v
        pulseSource = 'trace'
        beat = this.beats.update(v, time)
      }
    } else if (bpm) {
      // No waveform yet: time beats from the measured rate.
      pulseSource = 'rate'
      const prev = this.ratePhase
      this.ratePhase = (this.ratePhase + (dt * bpm) / 60) % 1
      pulseWave = Math.pow(Math.max(0, Math.cos(this.ratePhase * Math.PI * 2)), 6) * 2 - 1
      beat = this.ratePhase < prev
    }
    if (beat) {
      this.beatEnv = 1
      this.beatCount++
    }
    this.beatEnv = Math.max(0, this.beatEnv - dt * 2.2)

    // ---- breathing
    let breathWave = 0
    let breathSource: ArtSignals['breathSource'] = 'none'
    const bPos = live ? this.breathPlay.advance(this.breathBuf, dt) : null
    const breathFresh = bPos !== null && Date.now() - this.breathBuf.lastPushAt < STALE_TRACE_MS
    if (bPos !== null && breathFresh) {
      const v = this.breathBuf.normalizedAt(bPos)
      if (v !== null) {
        breathWave = v
        breathSource = 'trace'
      }
    } else if (rpm) {
      breathSource = 'rate'
      this.breathPhase = (this.breathPhase + (dt * rpm) / 60) % 1
      breathWave = Math.sin(this.breathPhase * Math.PI * 2)
    }
    if (this.prevBreath < 0 && breathWave >= 0 && breathSource !== 'none') this.breathCount++
    this.prevBreath = breathWave

    const pulseBuf = this.pulseBuf
    const breathBuf = this.breathBuf
    const pPlay = this.pulsePlay
    const bPlay = this.breathPlay

    return {
      time,
      dt,
      live,
      pulseBpm: bpm,
      pulseConfidence: live && inp.pulse ? inp.pulse.confidence / 100 : 0,
      pulseWave,
      pulseSource,
      beat: this.beatEnv,
      beatCount: this.beatCount,
      breathRpm: rpm,
      breathConfidence: live && inp.breathing ? inp.breathing.confidence / 100 : 0,
      breathWave,
      breathSource,
      breathCount: this.breathCount,
      hrvRmssd: live && inp.hrv ? inp.hrv.rmssd : null,
      quality: live ? inp.quality : 0,
      pulseHistory(secondsAgo) {
        if (pulseSource !== 'trace') return null
        return pulseBuf.normalizedAt(pPlay.position - secondsAgo * 1e6)
      },
      breathHistory(secondsAgo) {
        if (breathSource !== 'trace') return null
        return breathBuf.normalizedAt(bPlay.position - secondsAgo * 1e6)
      }
    }
  }
}
