import { FrameTimestampAnchor } from '@shared/frames'
import type { CaptureResolution } from '@shared/settings'

// MediaStreamTrackProcessor (mediacapture-transform) is available on the
// window in Electron's Chromium, but TypeScript only types it for workers.
type TrackProcessorCtor = new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> }

function trackProcessor(): TrackProcessorCtor | undefined {
  return (globalThis as unknown as { MediaStreamTrackProcessor?: TrackProcessorCtor }).MediaStreamTrackProcessor
}

export class CameraError extends Error {
  constructor(
    message: string,
    readonly kind: 'denied' | 'not-found' | 'busy' | 'unsupported' | 'unknown'
  ) {
    super(message)
  }
}

const RESOLUTIONS: Record<CaptureResolution, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '480p': { width: 640, height: 480 }
}

export function describeCameraError(err: unknown): CameraError {
  if (err instanceof CameraError) return err
  const name = (err as { name?: string })?.name
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CameraError(
        'Camera access was blocked. Allow camera access for PulseCanvas in Windows Settings → Privacy & security → Camera.',
        'denied'
      )
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new CameraError('No camera was found. Connect a webcam and try again.', 'not-found')
    case 'NotReadableError':
    case 'AbortError':
      return new CameraError('The camera is in use by another application. Close it and try again.', 'busy')
    default:
      return new CameraError(err instanceof Error ? err.message : 'The camera could not be opened.', 'unknown')
  }
}

export type FrameSink = (buffer: ArrayBuffer, width: number, height: number, timestampUs: number) => void

/**
 * Owns the webcam MediaStream and the frame pump that feeds the SDK.
 * Frames never leave this device: they go renderer → preload → main process
 * → SmartSpectra SDK (on-device processing).
 */
export class CameraPump {
  stream: MediaStream | null = null
  private worker: Worker | null = null
  private pumpTrack: MediaStreamTrack | null = null
  private anchor = new FrameTimestampAnchor()
  private frameTimes: number[] = []
  private locked = false
  onError: ((message: string) => void) | null = null

  async open(resolution: CaptureResolution): Promise<MediaStream> {
    if (this.stream) return this.stream
    if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('Camera APIs are unavailable.', 'unsupported')
    const { width, height } = RESOLUTIONS[resolution]
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: 30, min: 15 }, facingMode: 'user' }
      })
    } catch (err) {
      throw describeCameraError(err)
    }
    this.locked = false
    return this.stream
  }

  /** Start converting frames and handing them to `sink`. */
  startPump(sink: FrameSink): void {
    if (!this.stream) throw new CameraError('Camera is not open.', 'unknown')
    if (this.worker) return
    const Processor = trackProcessor()
    if (!Processor) {
      throw new CameraError('MediaStreamTrackProcessor is unavailable in this runtime.', 'unsupported')
    }
    const track = this.stream.getVideoTracks()[0]
    if (!track) throw new CameraError('The camera stream has no video track.', 'unknown')
    // Clone so the processor doesn't starve the preview <video>.
    this.pumpTrack = track.clone()
    const processor = new Processor({ track: this.pumpTrack })
    const worker = new Worker(new URL('./frameWorker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    this.frameTimes = []
    worker.onmessage = (ev: MessageEvent) => {
      const m = ev.data as
        | { type: 'frame'; buffer: ArrayBuffer; width: number; height: number; rawTimestampUs: number }
        | { type: 'error'; message: string }
        | { type: 'ended' }
      if (m.type === 'frame') {
        const now = performance.now()
        this.frameTimes.push(now)
        while (this.frameTimes.length && now - this.frameTimes[0] > 2000) this.frameTimes.shift()
        sink(m.buffer, m.width, m.height, this.anchor.next(m.rawTimestampUs))
      } else if (m.type === 'error') {
        this.onError?.(m.message)
      }
    }
    worker.postMessage({ type: 'start', readable: processor.readable }, [processor.readable as unknown as Transferable])
  }

  /** Frames per second over the last ~2 s. */
  get fps(): number {
    const n = this.frameTimes.length
    if (n < 2) return 0
    const span = this.frameTimes[n - 1] - this.frameTimes[0]
    return span > 0 ? ((n - 1) * 1000) / span : 0
  }

  /**
   * Lock exposure / white balance / focus once the SDK reports Running —
   * the same accuracy improvement the official SDK renderer applies. Only
   * modes the hardware advertises are requested; failures are harmless.
   */
  lockCameraParameters(): void {
    if (this.locked || !this.stream) return
    this.locked = true
    const track = this.stream.getVideoTracks()[0]
    if (!track?.getCapabilities) return
    const caps = track.getCapabilities() as Record<string, unknown>
    const advanced: Record<string, string>[] = []
    for (const key of ['exposureMode', 'whiteBalanceMode', 'focusMode']) {
      const modes = caps[key]
      if (Array.isArray(modes) && modes.includes('manual')) advanced.push({ [key]: 'manual' })
    }
    if (advanced.length) {
      track.applyConstraints({ advanced } as MediaTrackConstraints).catch(() => undefined)
    }
  }

  stopPump(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'stop' })
      const w = this.worker
      setTimeout(() => w.terminate(), 250)
      this.worker = null
    }
    this.pumpTrack?.stop()
    this.pumpTrack = null
    this.frameTimes = []
  }

  close(): void {
    this.stopPump()
    for (const t of this.stream?.getTracks() ?? []) t.stop()
    this.stream = null
    this.locked = false
  }
}
