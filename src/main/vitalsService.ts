import type { SdkEvent, StartResult } from '@shared/api'
import { validateFrameMessage } from '@shared/frames'
import { errorInfo, processingStatusName, type ProcessingStatusName } from '@shared/sdkCodes'
import { createTraceCursor, extractVitals, type PbMetricsLike, type TraceCursor } from '@shared/vitals'

/**
 * Structural subset of `SmartSpectraSDK` (@smartspectra/node-sdk 3.4.0) that
 * PulseCanvas uses. Kept structural so the lifecycle logic is unit-testable.
 */
export interface SdkInstance {
  on(event: 'processingStatus', cb: (status: number) => void): unknown
  on(event: 'validationStatus', cb: (code: number, timestampUs: number, hint: string) => void): unknown
  on(event: 'metrics', cb: (buf: Buffer, timestampUs: number) => void): unknown
  on(event: 'error', cb: (code: number, message: string, retryable: boolean) => void): unknown
  useCustomInput(frameTransform?: number): unknown
  start(): void
  stopAsync(): Promise<void>
  destroy(): Promise<void>
  sendFrame(buffer: Buffer, width: number, height: number, stride: number, pixelFormat: number, timestampUs: number): boolean
}

export interface SdkFactoryOptions {
  apiKey: string
  enableTelemetry: boolean
}

export interface VitalsServiceDeps {
  createSdk(opts: SdkFactoryOptions): SdkInstance
  decodeMetrics(buf: Buffer): PbMetricsLike
  resolveApiKey(): string | null
  telemetryEnabled(): boolean
  emit(event: SdkEvent): void
  log?(level: 'info' | 'warn' | 'error', msg: string): void
}

const PIXEL_FORMAT_RGBA = 2 // PixelFormat.kRGBA
const FRAME_TRANSFORM_NONE = 0 // FrameTransform.kNone
const FRAME_STATS_INTERVAL_MS = 1000

function sdkErrorToResult(err: unknown): StartResult {
  const e = err as { code?: unknown; message?: unknown; retryable?: unknown }
  const code = typeof e?.code === 'number' ? e.code : -1
  const info = errorInfo(code)
  return {
    ok: false,
    error: {
      code,
      name: code === -1 ? 'Error' : info.name,
      message: (typeof e?.message === 'string' && e.message) || info.advice || String(err),
      retryable: e?.retryable === true
    }
  }
}

/**
 * Owns at most one SmartSpectra session. The SDK's native state is
 * process-global, so a new session always waits for the previous session's
 * teardown (stopAsync + destroy) to finish before starting.
 */
export class VitalsService {
  private sdk: SdkInstance | null = null
  private status: ProcessingStatusName = 'idle'
  private teardown: Promise<void> = Promise.resolve()
  private cursor: TraceCursor = createTraceCursor()
  private accepted = 0
  private dropped = 0
  private lastStatsAt = 0
  private generation = 0

  constructor(private readonly deps: VitalsServiceDeps) {}

  get currentStatus(): ProcessingStatusName {
    return this.status
  }

  get isActive(): boolean {
    return this.sdk !== null
  }

  private log(level: 'info' | 'warn' | 'error', msg: string): void {
    this.deps.log?.(level, msg)
  }

  private setStatus(s: ProcessingStatusName): void {
    this.status = s
    this.deps.emit({ type: 'status', status: s })
  }

  async start(): Promise<StartResult> {
    const apiKey = this.deps.resolveApiKey()
    if (!apiKey) {
      return {
        ok: false,
        error: {
          code: 2,
          name: 'MissingApiKey',
          message: 'No SmartSpectra API key is configured. Add one in Settings → SmartSpectra API key.',
          retryable: false
        }
      }
    }

    // Retire any running session and wait for native teardown.
    await this.stop()
    await this.teardown

    const gen = ++this.generation
    this.cursor = createTraceCursor()
    this.accepted = 0
    this.dropped = 0

    let sdk: SdkInstance
    try {
      sdk = this.deps.createSdk({ apiKey, enableTelemetry: this.deps.telemetryEnabled() })
    } catch (err) {
      this.log('error', `SDK construction failed: ${String(err)}`)
      return sdkErrorToResult(err)
    }

    // Ignore callbacks from a superseded session.
    const live = (): boolean => this.generation === gen && this.sdk === sdk

    sdk.on('processingStatus', (code) => {
      if (live()) this.setStatus(processingStatusName(code))
    })
    sdk.on('validationStatus', (code, _ts, hint) => {
      if (live()) this.deps.emit({ type: 'validation', code, hint: hint || '' })
    })
    sdk.on('metrics', (buf) => {
      if (!live()) return
      try {
        const decoded = this.deps.decodeMetrics(buf)
        const update = extractVitals(decoded, this.cursor)
        this.deps.emit({ type: 'vitals', update })
      } catch (err) {
        this.log('warn', `failed to decode metrics packet: ${String(err)}`)
      }
    })
    sdk.on('error', (code, message, retryable) => {
      if (!live()) return
      const info = errorInfo(code)
      this.deps.emit({ type: 'error', code, name: info.name, message: message || info.advice, retryable })
    })

    this.sdk = sdk
    this.setStatus('starting')
    try {
      sdk.useCustomInput(FRAME_TRANSFORM_NONE)
      sdk.start()
    } catch (err) {
      this.log('error', `SDK start failed: ${String((err as Error)?.message ?? err)}`)
      this.sdk = null
      this.retire(sdk, false)
      this.setStatus('error')
      return sdkErrorToResult(err)
    }
    return { ok: true }
  }

  /** Push one RGBA frame. Invalid or out-of-session frames are dropped. */
  pushFrame(raw: unknown): void {
    const sdk = this.sdk
    if (!sdk) return
    const frame = validateFrameMessage(raw)
    if (!frame) {
      this.dropped++
      return
    }
    try {
      const ok = sdk.sendFrame(
        Buffer.from(frame.buffer),
        frame.width,
        frame.height,
        frame.width * 4,
        PIXEL_FORMAT_RGBA,
        frame.timestampUs
      )
      if (ok) this.accepted++
      else this.dropped++
    } catch (err) {
      // Expected transiently during start/stop churn — count, don't spam.
      this.dropped++
      if (this.dropped === 1 || this.dropped % 60 === 0) this.log('warn', `frame dropped: ${String((err as Error)?.message ?? err)}`)
    }
    const now = Date.now()
    if (now - this.lastStatsAt >= FRAME_STATS_INTERVAL_MS) {
      this.lastStatsAt = now
      this.deps.emit({ type: 'frames', accepted: this.accepted, dropped: this.dropped })
    }
  }

  private retire(sdk: SdkInstance, stopFirst: boolean): Promise<void> {
    const run = async (): Promise<void> => {
      if (stopFirst) {
        try {
          await sdk.stopAsync()
        } catch (err) {
          this.log('warn', `stopAsync failed: ${String(err)}`)
        }
      }
      try {
        await sdk.destroy()
      } catch (err) {
        this.log('warn', `destroy failed: ${String(err)}`)
      }
    }
    const prev = this.teardown
    this.teardown = prev.then(run, run)
    return this.teardown
  }

  /** Stop the current session (if any) and release the native SDK. */
  async stop(): Promise<void> {
    const sdk = this.sdk
    if (!sdk) return
    this.sdk = null
    this.generation++
    this.setStatus('stopping')
    await this.retire(sdk, true)
    this.setStatus('idle')
  }

  /** App shutdown: stop and wait for teardown. */
  async dispose(): Promise<void> {
    await this.stop()
    await this.teardown
  }
}
