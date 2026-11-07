import type { ArtSignals } from './driver'
import { COLORS, brand, heartColor, mix, rgba, rng, type RGB } from './palette'
import type { ArtEngine, EngineOptions } from './types'

interface Bloom {
  x: number
  y: number
  size: number
  petals: number
  rot: number
  color: RGB
  grow: number
}

/**
 * Breathing Garden — a central flower opens as you inhale and closes as you
 * exhale (driven by the SDK chest-motion trace). Every completed breath plants
 * a new bloom in the garden, sized by how deep that breath was, coloured by
 * heart rate at that moment. Heartbeats make pollen glow at the centre. The
 * garden accumulates over the session, so each exported image is a record of
 * the breaths that grew it.
 */
export class BreathingGarden implements ArtEngine {
  readonly mode = 'breathing-garden' as const
  private w = 1
  private h = 1
  private layer: OffscreenCanvas | null = null
  private lctx: OffscreenCanvasRenderingContext2D | null = null
  private blooms: Bloom[] = []
  private rand: () => number
  private lastBreathCount = 0
  private breathMin = 0
  private breathMax = 0
  private rot = 0

  constructor(private readonly opts: EngineOptions) {
    this.rand = rng(opts.seed)
  }

  resize(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    this.w = width
    this.h = height
    this.layer = new OffscreenCanvas(width, height)
    this.lctx = this.layer.getContext('2d')
    this.reset(ctx)
  }

  reset(_ctx: CanvasRenderingContext2D): void {
    this.blooms = []
    this.rand = rng(this.opts.seed)
    if (this.lctx) {
      const g = this.lctx.createRadialGradient(this.w / 2, this.h / 2, 0, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.7)
      g.addColorStop(0, rgba(COLORS.bg2, 1))
      g.addColorStop(1, rgba(COLORS.bg, 1))
      this.lctx.fillStyle = g
      this.lctx.fillRect(0, 0, this.w, this.h)
    }
  }

  describe(s: ArtSignals): string {
    if (!s.live) return 'Idle — start a session to grow a garden with your breath'
    const parts = [
      s.breathSource === 'trace' ? 'the flower follows your chest motion' : s.breathSource === 'rate' ? 'blooming at your breathing rate' : 'waiting for breathing',
      `${s.breathCount} breath${s.breathCount === 1 ? '' : 's'} planted`,
      s.pulseBpm !== null ? 'colour from your heart rate' : null
    ]
    return parts.filter(Boolean).join(' · ')
  }

  private drawFlower(
    c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    petals: number,
    open: number,
    rot: number,
    color: RGB,
    alpha: number
  ): void {
    c.save()
    c.translate(x, y)
    c.rotate(rot)
    for (let layer = 0; layer < 3; layer++) {
      const lr = radius * (1 - layer * 0.28)
      const lc = mix(color, layer === 1 ? COLORS.cyan : COLORS.pink, layer * 0.25)
      for (let p = 0; p < petals; p++) {
        const a = (p / petals) * Math.PI * 2 + layer * (Math.PI / petals)
        const len = lr * (0.35 + 0.65 * open)
        const wid = lr * (0.16 + 0.22 * open) * (1 - layer * 0.15)
        c.save()
        c.rotate(a)
        c.beginPath()
        c.moveTo(0, 0)
        c.bezierCurveTo(wid, len * 0.3, wid * 0.8, len * 0.85, 0, len)
        c.bezierCurveTo(-wid * 0.8, len * 0.85, -wid, len * 0.3, 0, 0)
        const g = c.createLinearGradient(0, 0, 0, len)
        g.addColorStop(0, rgba(lc, alpha * 0.9))
        g.addColorStop(1, rgba(lc, alpha * 0.15))
        c.fillStyle = g
        c.fill()
        c.restore()
      }
    }
    c.restore()
  }

  frame(ctx: CanvasRenderingContext2D, s: ArtSignals): void {
    const { w, h } = this
    const minDim = Math.min(w, h)
    if (!this.layer || !this.lctx) return

    // Track breath depth for the bloom that this breath will plant.
    this.breathMin = Math.min(this.breathMin, s.breathWave)
    this.breathMax = Math.max(this.breathMax, s.breathWave)

    if (s.breathCount !== this.lastBreathCount) {
      this.lastBreathCount = s.breathCount
      if (s.live) {
        const depth = Math.max(0.2, Math.min(1, (this.breathMax - this.breathMin) / 2))
        const angle = this.rand() * Math.PI * 2
        const dist = minDim * (0.22 + this.rand() * 0.55)
        const petals = s.breathRpm !== null ? Math.max(5, Math.min(13, Math.round(18 - s.breathRpm / 2))) : 7
        this.blooms.push({
          x: w / 2 + Math.cos(angle) * dist * (w / minDim) * 0.85,
          y: h / 2 + Math.sin(angle) * dist * 0.85,
          size: minDim * (0.03 + 0.06 * depth),
          petals,
          rot: this.rand() * Math.PI,
          color: mix(heartColor(s.pulseBpm), brand(this.rand()), 0.3),
          grow: 0
        })
      }
      this.breathMin = 0
      this.breathMax = 0
    }

    // Grow new blooms, then bake them permanently into the garden layer.
    for (const b of this.blooms) {
      b.grow = Math.min(1, b.grow + s.dt * 0.5)
    }
    const done = this.blooms.filter((b) => b.grow >= 1)
    for (const b of done) this.drawFlower(this.lctx, b.x, b.y, b.size, b.petals, 1, b.rot, b.color, 0.55)
    this.blooms = this.blooms.filter((b) => b.grow < 1)

    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(this.layer, 0, 0)
    for (const b of this.blooms) this.drawFlower(ctx, b.x, b.y, b.size * b.grow, b.petals, b.grow, b.rot, b.color, 0.55 * b.grow)

    // Central flower: open = inhale.
    const open = s.live ? (s.breathWave + 1) / 2 : 0.35 + 0.1 * Math.sin(s.time * 0.5)
    if (!this.opts.reducedMotion) this.rot += s.dt * (s.live ? 0.05 : 0.02)
    const petals = s.breathRpm !== null ? Math.max(6, Math.min(14, Math.round(20 - s.breathRpm / 1.5))) : 9
    const color = heartColor(s.pulseBpm)
    ctx.globalCompositeOperation = 'lighter'
    this.drawFlower(ctx, w / 2, h / 2, minDim * 0.26, petals, open, this.rot, color, s.live ? 0.5 : 0.25)

    // Pollen glow pulses with each heartbeat.
    const glowR = minDim * (0.035 + 0.035 * s.beat)
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, glowR * 3)
    g.addColorStop(0, rgba(COLORS.text, 0.55 + 0.4 * s.beat))
    g.addColorStop(0.3, rgba(COLORS.pink, 0.35 * (0.4 + s.beat)))
    g.addColorStop(1, rgba(COLORS.pink, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, glowR * 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }
}
