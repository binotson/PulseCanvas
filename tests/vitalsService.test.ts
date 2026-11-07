/**
 * Lifecycle tests for VitalsService using a FAKE SDK object.
 * These tests use mocks: they verify PulseCanvas's session/teardown/frame
 * logic, not SmartSpectra measurement. Real-SDK checks are in
 * `npm run sdk:check` and the manual hardware checklist in README.md.
 */
import { describe, expect, it, vi } from 'vitest'
import type { SdkEvent } from '@shared/api'
import { VitalsService, type SdkInstance, type VitalsServiceDeps } from '../src/main/vitalsService'

type Handler = (...args: never[]) => void

class FakeSdk implements SdkInstance {
  handlers: Record<string, Handler> = {}
  started = false
  destroyed = false
  stopped = false
  frames: { w: number; h: number; stride: number; fmt: number; ts: number; bytes: number }[] = []
  startError: Error | null = null
  stopDelay = 0
  log: string[]

  constructor(log: string[]) {
    this.log = log
  }
  on(event: string, cb: Handler): this {
    this.handlers[event] = cb
    return this
  }
  emit(event: string, ...args: unknown[]): void {
    ;(this.handlers[event] as (...a: unknown[]) => void)?.(...args)
  }
  useCustomInput(): this {
    this.log.push('useCustomInput')
    return this
  }
  start(): void {
    if (this.startError) throw this.startError
    this.started = true
    this.log.push('start')
  }
  async stopAsync(): Promise<void> {
    this.log.push('stop:begin')
    await new Promise((r) => setTimeout(r, this.stopDelay))
    this.stopped = true
    this.log.push('stop:end')
  }
  async destroy(): Promise<void> {
    this.destroyed = true
    this.log.push('destroy')
  }
  sendFrame(buf: Buffer, w: number, h: number, stride: number, fmt: number, ts: number): boolean {
    this.frames.push({ w, h, stride, fmt, ts, bytes: buf.length })
    return true
  }
}

function setup(overrides: Partial<VitalsServiceDeps> = {}) {
  const log: string[] = []
  const events: SdkEvent[] = []
  const sdks: FakeSdk[] = []
  const created: { apiKey: string; enableTelemetry: boolean }[] = []
  const deps: VitalsServiceDeps = {
    createSdk: (o) => {
      created.push(o)
      const s = new FakeSdk(log)
      sdks.push(s)
      return s
    },
    decodeMetrics: () => ({ cardio: { pulseRate: [{ value: 66, confidence: 70, stable: true, timestamp: 5 }] } }),
    resolveApiKey: () => 'test-key',
    telemetryEnabled: () => false,
    emit: (e) => events.push(e),
    ...overrides
  }
  return { svc: new VitalsService(deps), log, events, sdks, created }
}

function frame(w = 4, h = 2, ts = 1_000_000) {
  return { buffer: new ArrayBuffer(w * h * 4), width: w, height: h, timestampUs: ts }
}

describe('VitalsService (mock SDK)', () => {
  it('refuses to start without an API key', async () => {
    const { svc, sdks } = setup({ resolveApiKey: () => null })
    const res = await svc.start()
    expect(res.ok).toBe(false)
    expect(res.error?.name).toBe('MissingApiKey')
    expect(sdks).toHaveLength(0)
  })

  it('passes the key and telemetry preference to the SDK and uses custom input', async () => {
    const { svc, created, log } = setup({ telemetryEnabled: () => true })
    expect((await svc.start()).ok).toBe(true)
    expect(created[0]).toEqual({ apiKey: 'test-key', enableTelemetry: true })
    expect(log).toEqual(['useCustomInput', 'start'])
    expect(svc.isActive).toBe(true)
  })

  it('reports SDK start errors with their code', async () => {
    const err = Object.assign(new Error('bad key'), { code: 2, retryable: false })
    const { svc, sdks } = setup({
      createSdk: () => {
        const s = new FakeSdk([])
        s.startError = err
        sdks.push(s)
        return s
      }
    })
    const res = await svc.start()
    expect(res).toEqual({ ok: false, error: { code: 2, name: 'kAuthenticationFailed', message: 'bad key', retryable: false } })
    expect(svc.isActive).toBe(false)
    await svc.dispose()
    expect(sdks[0].destroyed).toBe(true)
  })

  it('forwards valid RGBA frames and drops malformed ones', async () => {
    const { svc, sdks } = setup()
    await svc.start()
    svc.pushFrame(frame(4, 2, 10))
    svc.pushFrame({ ...frame(4, 2, 11), width: 5 }) // size mismatch
    svc.pushFrame({ buffer: 'nope', width: 4, height: 2, timestampUs: 12 })
    svc.pushFrame(null)
    expect(sdks[0].frames).toEqual([{ w: 4, h: 2, stride: 16, fmt: 2, ts: 10, bytes: 32 }])
  })

  it('ignores frames when no session is running', () => {
    const { svc, sdks } = setup()
    svc.pushFrame(frame())
    expect(sdks).toHaveLength(0)
  })

  it('decodes metrics packets into vitals events', async () => {
    const { svc, sdks, events } = setup()
    await svc.start()
    sdks[0].emit('metrics', Buffer.alloc(0), 0)
    const v = events.find((e) => e.type === 'vitals')
    expect(v && v.type === 'vitals' && v.update.pulse?.value).toBe(66)
  })

  it('maps status, validation and error callbacks', async () => {
    const { svc, sdks, events } = setup()
    await svc.start()
    sdks[0].emit('processingStatus', 3)
    sdks[0].emit('validationStatus', 5, 0, 'Too dark')
    sdks[0].emit('error', 5, '', true)
    expect(events).toContainEqual({ type: 'status', status: 'running' })
    expect(events).toContainEqual({ type: 'validation', code: 5, hint: 'Too dark' })
    expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 5, name: 'kNetworkError', retryable: true }))
  })

  it('stops with stopAsync then destroy, and ignores late callbacks', async () => {
    const { svc, sdks, events, log } = setup()
    await svc.start()
    await svc.stop()
    expect(log.slice(-3)).toEqual(['stop:begin', 'stop:end', 'destroy'])
    const before = events.length
    sdks[0].emit('processingStatus', 3)
    expect(events.length).toBe(before)
    expect(svc.currentStatus).toBe('idle')
  })

  it('waits for the previous session teardown before starting a new one', async () => {
    const log: string[] = []
    let n = 0
    const { svc } = setup({
      createSdk: () => {
        const s = new FakeSdk(log)
        s.stopDelay = n++ === 0 ? 30 : 0
        return s
      }
    })
    await svc.start()
    await svc.start() // restarts: must fully tear down the first SDK first
    const firstDestroy = log.indexOf('destroy')
    const secondStart = log.lastIndexOf('start')
    expect(firstDestroy).toBeGreaterThan(-1)
    expect(firstDestroy).toBeLessThan(secondStart)
  })

  it('dispose is safe to call repeatedly', async () => {
    const { svc } = setup()
    await svc.start()
    const spy = vi.fn()
    await svc.dispose().then(spy)
    await svc.dispose().then(spy)
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
