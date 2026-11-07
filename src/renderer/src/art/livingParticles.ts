import type { ArtSignals } from './driver'
import { COLORS, brand, flow, heartColor, mix, rgba, rng } from './palette'
import type { ArtEngine, EngineOptions } from './types'

/**
 * Living Particles — a field of particles drifting through a flow field.
 * Heart rate sets their speed, each heartbeat sends an outward pulse through
 * the swarm, breathing expands (inhale) and contracts (exhale) the whole
 * cloud, and HRV controls how turbulent the flow is.
 */
export class LivingParticles implements ArtEngine {
  readonly mode = 'living-particles' as const
  private w = 1
  private h = 1
  private n: number
  private x: Float32Array
  private y: Float32Array
  private vx: Float32Array
  private vy: Float32Array
  private hue: Float32Array
  private lastBeat = 0

  constructor(private readonly opts: EngineOptions) {
    this.n = opts.reducedMotion ? 700 : 2200
    this.x = new Float32Array(this.n)
    this.y = new Float32Array(this.n)
    this.vx = new Float32Array(this.n)
    this.vy = new Float32Array(this.n)
    this.hue = new Float32Array(this.n)
  }

  private seed(): void {
    const r = rng(this.opts.seed)
    for (let i = 0; i < this.n; i++) {
      const a = r() * Math.PI * 2
      const d = Math.sqrt(r()) * Math.min(this.w, this.h) * 0.45
      this.x[i] = this.w / 2 + Math.cos(a) * d
      this.y[i] = this.h / 2 + Math.sin(a) * d
      this.vx[i] = 0
      this.vy[i] = 0
      this.hue[i] = r()
    }
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
    this.seed()
  }

  describe(s: ArtSignals): string {
    if (!s.live) return 'Idle — start a session to bring the particles to life'
    return [
      s.pulseBpm !== null ? 'speed from your heart rate' : 'waiting for pulse',
      s.pulseSource !== 'none' ? 'beats pulse through the swarm' : null,
      s.breathSource !== 'none' ? 'breathing expands the cloud' : null,
      s.hrvRmssd !== null ? 'HRV sets the turbulence' : null
    ]
      .filter(Boolean)
      .join(' · ')
  }

  frame(ctx: CanvasRenderingContext2D, s: ArtSignals): void {
    const { w, h, n } = this
    const cx = w / 2
    const cy = h / 2
    const minDim = Math.min(w, h)
    const dt = Math.min(0.05, s.dt) * 60 // normalise to ~60 fps steps

    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = rgba(COLORS.bg, 0.09)
    ctx.fillRect(0, 0, w, h)

    const speed = s.pulseBpm !== null ? 0.35 + (s.pulseBpm / 70) * 0.6 : 0.25
    const turbulence = s.hrvRmssd !== null ? 0.4 + Math.min(1.2, s.hrvRmssd / 50) : 0.6
    // Target radius of the cloud breathes with the chest trace.
    const target = minDim * (0.28 + (s.live ? 0.1 * s.breathWave : 0.02 * Math.sin(s.time * 0.4)))
    const beatKick = s.beatCount !== this.lastBeat && s.live
    this.lastBeat = s.beatCount
    const base = heartColor(s.pulseBpm)
    const scale = 3 / minDim
    const t = s.time * 0.25 * turbulence

    ctx.globalCompositeOperation = 'lighter'
    const size = Math.max(1, minDim / 700)
    for (let i = 0; i < n; i++) {
      const px = this.x[i]
      const py = this.y[i]
      const dx = px - cx
      const dy = py - cy
      const d = Math.hypot(dx, dy) || 1
      const ang = flow(px * scale, py * scale, t) * Math.PI * turbulence
      let ax = Math.cos(ang) * 0.06 * speed
      let ay = Math.sin(ang) * 0.06 * speed
      // Radial spring toward the breathing radius.
      const pull = ((target - d) / minDim) * 0.25
      ax += (dx / d) * pull
      ay += (dy / d) * pull
      // Gentle orbit.
      ax += (-dy / d) * 0.02 * speed
      ay += (dx / d) * 0.02 * speed
      if (beatKick) {
        const k = 1.6 * (1 - Math.min(1, d / (minDim * 0.6)))
        ax += (dx / d) * k
        ay += (dy / d) * k
      }
      this.vx[i] = (this.vx[i] + ax * dt) * 0.94
      this.vy[i] = (this.vy[i] + ay * dt) * 0.94
      this.x[i] = px + this.vx[i] * dt * 2
      this.y[i] = py + this.vy[i] * dt * 2
      if (this.x[i] < -20 || this.x[i] > w + 20 || this.y[i] < -20 || this.y[i] > h + 20) {
        this.x[i] = cx + (Math.random() - 0.5) * 10
        this.y[i] = cy + (Math.random() - 0.5) * 10
      }
      const v = Math.min(1, Math.hypot(this.vx[i], this.vy[i]) / 3)
      const c = mix(brand(this.hue[i] + s.time * 0.01), base, 0.45)
      ctx.fillStyle = rgba(c, 0.25 + 0.5 * v + 0.25 * s.beat)
      ctx.fillRect(this.x[i], this.y[i], size + v * size, size + v * size)
    }
    ctx.globalCompositeOperation = 'source-over'
  }
}
