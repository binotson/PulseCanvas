import type { ArtMode } from '@shared/settings'
import type { ArtSignals } from './driver'

export interface ArtEngine {
  readonly mode: ArtMode
  /** Called on mount and whenever the canvas backing size changes. */
  resize(ctx: CanvasRenderingContext2D, width: number, height: number): void
  /** Draw one frame. Engines may keep persistent layers between frames. */
  frame(ctx: CanvasRenderingContext2D, s: ArtSignals): void
  /** Clear accumulated artwork and start a fresh composition. */
  reset(ctx: CanvasRenderingContext2D): void
  /** How the current signals are being used, for the on-canvas legend. */
  describe(s: ArtSignals): string
}

export interface EngineOptions {
  reducedMotion: boolean
  seed: number
}
