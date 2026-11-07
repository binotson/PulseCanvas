/** Limits applied by the main process to every frame from the renderer. */
export const MAX_FRAME_DIM = 4096

export interface FrameMessage {
  buffer: ArrayBuffer
  width: number
  height: number
  timestampUs: number
}

/** Validate an untrusted frame message. RGBA, tightly packed. */
export function validateFrameMessage(raw: unknown): FrameMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  const { width, height, timestampUs, buffer } = m
  if (typeof width !== 'number' || typeof height !== 'number' || typeof timestampUs !== 'number') return null
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null
  if (width <= 0 || height <= 0 || width > MAX_FRAME_DIM || height > MAX_FRAME_DIM) return null
  if (!Number.isFinite(timestampUs) || timestampUs <= 0) return null
  if (!(buffer instanceof ArrayBuffer)) return null
  if (buffer.byteLength !== width * height * 4) return null
  return { buffer, width, height, timestampUs }
}

/**
 * Anchors WebCodecs `VideoFrame.timestamp` (µs in an arbitrary media clock)
 * to Unix-epoch microseconds and guarantees strict monotonicity, which the
 * SDK requires (`kNonMonotonicTimestamp`). Same approach as the SDK's own
 * renderer helper (js/renderer/timestamp.js), re-implemented here because
 * PulseCanvas uses its own credential-free IPC bridge.
 */
export class FrameTimestampAnchor {
  private offsetUs: number | null = null
  private last = 0

  next(rawTimestampUs: number, nowMs: number = Date.now()): number {
    const raw = Number.isFinite(rawTimestampUs) ? Math.round(rawTimestampUs) : 0
    if (this.offsetUs === null) this.offsetUs = Math.round(nowMs * 1000) - raw
    let ts = raw + this.offsetUs
    if (ts <= this.last) ts = this.last + 1
    this.last = ts
    return ts
  }
}
