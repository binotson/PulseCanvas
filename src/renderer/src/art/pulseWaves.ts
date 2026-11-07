import type { ArtSignals } from './driver'
import { COLORS, brand, heartColor, mix, rgba, rng } from './palette'
import type { ArtEngine, EngineOptions } from './types'

interface Ripple {
  r: number
  life: number
  color: [number, number, number]
}

/**
 * Pulse Waves — flowing ribbons that literally draw your measured pulse
 * waveform (SDK arterial-pressure trace) scrolling across the canvas.
 * Ribbon colour follows heart rate; each detected beat sends a ripple out
 * from the centre; HRV adds organic variation between ribbons; breathing
 * gently lifts and lowers the whole composition.
 */
export class PulseWaves implements ArtEngine {
  readonly mode = 'pulse-waves' as const
  private w = 1
  private h = 1
  private ripples: Ripple[] = []
  private lastBeatCount = 0
  private offsets: number[]

  constructor(private readonly opts: EngineOptions) {
    const r = rng(opts.seed)
    this.offsets = Array.from({ length: 9 }, () => r() * Math.PI * 2)
  }

  resize(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    this.w = width
    this.h = height
    this.reset(ctx)
  }

  reset(ctx: CanvasRenderingContext2D): void {
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = rgba(COLORS.bg, 1)
    ctx.fillRect(0, 0, this.w, this.h)
    this.ripples = []
  }

  describe(s: ArtSignals): string {
    if (!s.live) return 'Idle — start a session to draw with your pulse'
    const parts = [
      s.pulseSource === 'trace' ? 'ribbons trace your pulse waveform' : s.pulseSource === 'rate' ? 'rhythm timed from your heart rate' : 'waiting for pulse',
      s.breathSource !== 'none' ? 'breathing lifts the waves' : null,
      s.hrvRmssd !== null ? 'HRV shapes their variation' : null
    ]
    return parts.filter(Boolean).join(' · ')
  }

  frame(ctx: CanvasRenderingContext2D, s: ArtSignals): void {
    const { w, h } = this
    const minDim = Math.min(w, h)

    // Trails: fade previous frame toward the background.
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = rgba(COLORS.bg, s.live ? 0.14 : 0.08)
    ctx.fillRect(0, 0, w, h)

    const base = heartColor(s.pulseBpm)
    const ribbons = this.opts.reducedMotion ? 5 : 9
    const hrvVar = s.hrvRmssd !== null ? Math.min(1, s.hrvRmssd / 80) : 0.25
    const breathLift = s.breathSource !== 'none' ? s.breathWave * h * 0.04 : 0
    const amp = s.live ? h * (0.05 + 0.07 * Math.max(0.3, s.pulseConfidence)) : h * 0.015
    const windowSec = 4 // seconds of waveform visible across the width
    const step = Math.max(4, Math.round(w / 220))

    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < ribbons; i++) {
      const k = i / (ribbons - 1)
      const y0 = h * (0.22 + 0.56 * k) + breathLift * (1 - Math.abs(k - 0.5))
      const lag = i * 0.06 * (1 + hrvVar)
      const color = mix(base, brand(k * 0.6 + s.time * 0.01), 0.35)
      const alpha = 0.18 + 0.5 * s.beat * (1 - Math.abs(k - 0.5) * 1.4) + (s.live ? 0.12 : 0)
      ctx.beginPath()
      for (let x = 0; x <= w; x += step) {
        const u = x / w
        // Rightmost point = newest sample.
        const secondsAgo = (1 - u) * windowSec + lag
        const sample = s.pulseHistory(secondsAgo)
        const idle = Math.sin(u * 6 + s.time * 0.6 + this.offsets[i]) * 0.5
        const v = sample ?? (s.pulseSource === 'rate' ? s.pulseWave * Math.sin(u * Math.PI) : idle)
        const drift = Math.sin(u * 3 + s.time * 0.3 + this.offsets[i]) * hrvVar * 0.35
        const envelope = Math.sin(u * Math.PI) ** 0.6
        const y = y0 + (v + drift) * amp * envelope
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = rgba(color, Math.min(0.9, alpha))
      ctx.lineWidth = (1.2 + 2.4 * s.beat) * (minDim / 900) + 0.6
      ctx.stroke()
      // Soft glow pass
      ctx.strokeStyle = rgba(color, Math.min(0.25, alpha * 0.3))
      ctx.lineWidth = (6 + 10 * s.beat) * (minDim / 900)
      ctx.stroke()
    }

    // Beat ripples from centre.
    if (s.beatCount !== this.lastBeatCount) {
      this.lastBeatCount = s.beatCount
      if (s.live) this.ripples.push({ r: minDim * 0.04, life: 1, color: base })
    }
    for (const rp of this.ripples) {
      rp.r += minDim * 0.45 * s.dt
      rp.life -= s.dt * 0.6
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, rp.r, 0, Math.PI * 2)
      ctx.strokeStyle = rgba(rp.color, rp.life * 0.35)
      ctx.lineWidth = 2 * rp.life * (minDim / 900) + 0.5
      ctx.stroke()
    }
    this.ripples = this.ripples.filter((r) => r.life > 0)
    ctx.globalCompositeOperation = 'source-over'
  }
}
