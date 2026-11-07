import type { SdkEvent, SdkInfo, SessionSummary } from '@shared/api'
import { computeSignalQuality, type SignalQuality } from '@shared/quality'
import { validationInfo, type ProcessingStatusName, type ValidationInfo } from '@shared/sdkCodes'
import type { ArtMode, Settings } from '@shared/settings'
import type { HrvReading, RateReading } from '@shared/vitals'
import { CameraPump, describeCameraError } from './camera'
import { SessionRecorder } from './sessionStats'
import { TraceBuffer } from './signals'
import { createStore } from './store'

export type Route = 'studio' | 'gallery' | 'insights' | 'privacy' | 'settings'

export type SessionPhase = 'idle' | 'camera' | 'starting' | 'running' | 'stopping' | 'error'

export interface Timed<T> {
  reading: T
  at: number
}

export interface AppState {
  route: Route
  settings: Settings | null
  sdkInfo: SdkInfo | null
  mode: ArtMode
  phase: SessionPhase
  sdkStatus: ProcessingStatusName
  validation: (ValidationInfo & { at: number }) | null
  pulse: Timed<RateReading> | null
  breathing: Timed<RateReading> | null
  hrv: Timed<HrvReading> | null
  error: { title: string; message: string } | null
  cameraFps: number
  frames: { accepted: number; dropped: number }
  sessionStartedAt: number | null
  stream: MediaStream | null
  lastSummary: SessionSummary | null
  toast: { id: number; text: string; tone: 'ok' | 'warn' } | null
}

export const app = createStore<AppState>({
  route: 'studio',
  settings: null,
  sdkInfo: null,
  mode: 'pulse-waves',
  phase: 'idle',
  sdkStatus: 'idle',
  validation: null,
  pulse: null,
  breathing: null,
  hrv: null,
  error: null,
  cameraFps: 0,
  frames: { accepted: 0, dropped: 0 },
  sessionStartedAt: null,
  stream: null,
  lastSummary: null,
  toast: null
})

/** Live waveform buffers read by the artwork every animation frame. */
export const traces = {
  pulse: new TraceBuffer(),
  breathing: new TraceBuffer()
}

export const camera = new CameraPump()
let recorder: SessionRecorder | null = null
let fpsTimer: ReturnType<typeof setInterval> | null = null
let toastSeq = 0

export function getRecorder(): SessionRecorder | null {
  return recorder
}

export function toast(text: string, tone: 'ok' | 'warn' = 'ok'): void {
  const id = ++toastSeq
  app.set({ toast: { id, text, tone } })
  setTimeout(() => {
    if (app.get().toast?.id === id) app.set({ toast: null })
  }, 3500)
}

export function signalQuality(s: AppState, now = Date.now()): SignalQuality {
  return computeSignalQuality({
    validationOk: s.validation?.code === 0,
    pulse: s.pulse?.reading ?? null,
    breathing: s.breathing?.reading ?? null,
    pulseAgeMs: s.pulse ? now - s.pulse.at : Infinity,
    breathingAgeMs: s.breathing ? now - s.breathing.at : Infinity
  })
}

function handleEvent(e: SdkEvent): void {
  const s = app.get()
  switch (e.type) {
    case 'status':
      app.set({ sdkStatus: e.status })
      if (e.status === 'running') {
        camera.lockCameraParameters()
        if (s.phase === 'starting') app.set({ phase: 'running' })
      }
      if (e.status === 'error' && s.phase !== 'idle') {
        app.set({ phase: 'error' })
      }
      break
    case 'validation': {
      const info = validationInfo(e.code, e.hint)
      app.set({ validation: { ...info, at: Date.now() } })
      recorder?.validation(e.code === 0)
      break
    }
    case 'vitals': {
      const u = e.update
      const now = Date.now()
      const patch: Partial<AppState> = {}
      if (u.pulse) {
        patch.pulse = { reading: u.pulse, at: now }
        recorder?.addPulse(u.pulse)
      }
      if (u.breathing) {
        patch.breathing = { reading: u.breathing, at: now }
        recorder?.addBreathing(u.breathing)
      }
      if (u.hrv) {
        patch.hrv = { reading: u.hrv, at: now }
        recorder?.addHrv(u.hrv)
      }
      traces.pulse.push(u.pulseTrace)
      traces.breathing.push(u.breathingTrace)
      if (Object.keys(patch).length) app.set(patch)
      break
    }
    case 'error':
      app.set({ error: { title: `SmartSpectra: ${e.name}`, message: e.message } })
      if (!e.retryable && (s.phase === 'starting' || s.phase === 'running')) void stopSession()
      break
    case 'frames':
      app.set({ frames: { accepted: e.accepted, dropped: e.dropped } })
      break
  }
}

let unsubscribe: (() => void) | null = null

export async function initApp(): Promise<void> {
  unsubscribe?.()
  unsubscribe = window.pulse.sdk.onEvent(handleEvent)
  const [settings, sdkInfo] = await Promise.all([window.pulse.settings.get(), window.pulse.sdk.info()])
  const ROUTES: Route[] = ['studio', 'gallery', 'insights', 'privacy', 'settings']
  const fromHash = location.hash.replace(/^#\//, '') as Route
  app.set({ settings, sdkInfo, mode: settings.defaultArtMode, ...(ROUTES.includes(fromHash) ? { route: fromHash } : {}) })
  camera.onError = (message) => app.set({ error: { title: 'Camera', message } })
}

export async function refreshSdkInfo(): Promise<void> {
  app.set({ sdkInfo: await window.pulse.sdk.info() })
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const settings = await window.pulse.settings.update(patch)
  app.set({ settings })
  return settings
}

function resetLive(): void {
  traces.pulse.clear()
  traces.breathing.clear()
  app.set({
    validation: null,
    pulse: null,
    breathing: null,
    hrv: null,
    error: null,
    frames: { accepted: 0, dropped: 0 },
    cameraFps: 0
  })
}

export async function startSession(): Promise<void> {
  const s = app.get()
  if (!s.settings?.consentAcceptedAt) {
    app.set({ error: { title: 'Consent required', message: 'Review and accept the camera consent first.' } })
    return
  }
  if (s.phase !== 'idle' && s.phase !== 'error') return
  if (s.phase === 'error') await stopSession()
  resetLive()
  app.set({ phase: 'camera' })

  let stream: MediaStream
  try {
    stream = await camera.open(s.settings.captureResolution)
  } catch (err) {
    const ce = describeCameraError(err)
    app.set({ phase: 'error', error: { title: 'Camera unavailable', message: ce.message } })
    return
  }
  app.set({ stream, phase: 'starting' })

  const res = await window.pulse.sdk.start()
  if (!res.ok) {
    camera.close()
    app.set({
      phase: 'error',
      stream: null,
      error: { title: `Could not start SmartSpectra (${res.error?.name ?? 'error'})`, message: res.error?.message ?? 'Unknown error' }
    })
    return
  }

  recorder = new SessionRecorder()
  try {
    camera.startPump((buf, w, h, ts) => window.pulse.sdk.sendFrame(buf, w, h, ts))
  } catch (err) {
    await window.pulse.sdk.stop()
    camera.close()
    recorder = null
    app.set({ phase: 'error', stream: null, error: { title: 'Camera pipeline', message: describeCameraError(err).message } })
    return
  }
  app.set({ sessionStartedAt: Date.now() })
  fpsTimer = setInterval(() => app.set({ cameraFps: camera.fps }), 1000)
}

export async function stopSession(): Promise<SessionSummary | null> {
  const s = app.get()
  if (s.phase === 'idle' || s.phase === 'stopping') return null
  app.set({ phase: 'stopping' })
  if (fpsTimer) clearInterval(fpsTimer)
  fpsTimer = null
  camera.stopPump()
  try {
    await window.pulse.sdk.stop()
  } finally {
    camera.close()
  }
  let summary: SessionSummary | null = null
  if (recorder) {
    summary = recorder.summarize(app.get().mode)
    if (app.get().settings?.saveSessionHistory && (summary.pulse || summary.breathing)) {
      await window.pulse.history.append(summary).catch(() => undefined)
    }
  }
  app.set({ phase: 'idle', stream: null, sessionStartedAt: null, lastSummary: summary ?? s.lastSummary, cameraFps: 0 })
  return summary
}

export function navigate(route: Route): void {
  app.set({ route })
}
