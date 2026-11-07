import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import type { ArtMode } from '@shared/settings'
import { createEngine } from '../art'
import { SignalDriver, type ArtSignals } from '../art/driver'
import type { ArtEngine } from '../art/types'
import { app, signalQuality, traces } from '../lib/session'

export interface ArtCanvasHandle {
  /** PNG data URL of the current artwork, optionally with a caption stamped in. */
  capture(caption: string | null): string | null
  reset(): void
}

const MAX_DPR = 1.5

/**
 * Hosts one art engine and runs it every animation frame from the live
 * SmartSpectra readings in the app store. Reads the store imperatively
 * (no React re-render per frame).
 */
export const ArtCanvas = forwardRef<
  ArtCanvasHandle,
  { mode: ArtMode; reducedMotion: boolean; onDescribe?: (text: string) => void }
>(function ArtCanvas({ mode, reducedMotion, onDescribe }, ref): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<ArtEngine | null>(null)
  const [seed] = useState(() => (Math.random() * 2 ** 31) | 0)
  const describeRef = useRef(onDescribe)
  describeRef.current = onDescribe

  useImperativeHandle(ref, () => ({
    capture(caption) {
      const c = canvasRef.current
      if (!c) return null
      const out = document.createElement('canvas')
      out.width = c.width
      out.height = c.height
      const ctx = out.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(c, 0, 0)
      const pad = Math.round(c.width * 0.02)
      const fs = Math.max(12, Math.round(c.width * 0.012))
      ctx.font = `600 ${fs}px "Segoe UI", Inter, sans-serif`
      ctx.textBaseline = 'bottom'
      ctx.fillStyle = 'rgba(248,250,252,0.55)'
      ctx.textAlign = 'right'
      ctx.fillText('PulseCanvas', c.width - pad, c.height - pad)
      if (caption) {
        ctx.textAlign = 'left'
        ctx.fillStyle = 'rgba(248,250,252,0.7)'
        ctx.fillText(caption, pad, c.height - pad)
      }
      return out.toDataURL('image/png')
    },
    reset() {
      const c = canvasRef.current
      const ctx = c?.getContext('2d')
      if (ctx) engineRef.current?.reset(ctx)
    }
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    const engine = createEngine(mode, { reducedMotion, seed })
    engineRef.current = engine
    const driver = new SignalDriver(traces.pulse, traces.breathing)
    let raf = 0
    let lastDescribe = 0
    let lastDescription = ''

    const fit = (): void => {
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
      const rect = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.round(rect.width * dpr))
      const h = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        engine.resize(ctx, w, h)
      }
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(canvas)

    const loop = (): void => {
      const s = app.get()
      const live = s.phase === 'running' || s.phase === 'starting'
      const signals: ArtSignals = driver.step({
        live: live && (s.pulse !== null || s.breathing !== null || traces.pulse.size > 1 || traces.breathing.size > 1),
        pulse: s.pulse?.reading ?? null,
        breathing: s.breathing?.reading ?? null,
        hrv: s.hrv?.reading ?? null,
        quality: signalQuality(s).score,
        reducedMotion
      })
      engine.frame(ctx, signals)
      const now = performance.now()
      if (now - lastDescribe > 500) {
        lastDescribe = now
        const d = engine.describe(signals)
        if (d !== lastDescription) {
          lastDescription = d
          describeRef.current?.(d)
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      engineRef.current = null
    }
  }, [mode, reducedMotion, seed])

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="Generative artwork" role="img" />
})
