/**
 * Frame extraction worker. Receives the transferred ReadableStream<VideoFrame>
 * from a MediaStreamTrackProcessor, converts each frame to tightly packed
 * RGBA via OffscreenCanvas, and transfers the pixels back to the page, which
 * forwards them to the main process (and the SmartSpectra SDK).
 *
 * Running this off the UI thread keeps the generative artwork smooth while
 * maintaining the ~25–30 fps the SDK needs.
 */

interface StartMsg {
  type: 'start'
  readable: ReadableStream<VideoFrame>
}
interface StopMsg {
  type: 'stop'
}

// Narrow typing of the dedicated-worker global (avoids pulling the whole
// WebWorker lib into the DOM-typed renderer program).
const ctx = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void
  onmessage: ((ev: MessageEvent<StartMsg | StopMsg>) => void) | null
}

let reader: ReadableStreamDefaultReader<VideoFrame> | null = null
let running = false

async function pump(readable: ReadableStream<VideoFrame>): Promise<void> {
  const canvas = new OffscreenCanvas(1, 1)
  const g = canvas.getContext('2d', { willReadFrequently: true, alpha: false })
  if (!g) {
    ctx.postMessage({ type: 'error', message: 'OffscreenCanvas 2D context unavailable' })
    return
  }
  reader = readable.getReader()
  running = true
  try {
    while (running) {
      const { value: vf, done } = await reader.read()
      if (done) break
      if (!vf) continue
      try {
        const w = vf.displayWidth
        const h = vf.displayHeight
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }
        g.drawImage(vf, 0, 0, w, h)
        const img = g.getImageData(0, 0, w, h)
        const buffer = img.data.buffer as ArrayBuffer
        ctx.postMessage({ type: 'frame', buffer, width: w, height: h, rawTimestampUs: vf.timestamp }, [buffer])
      } finally {
        vf.close()
      }
    }
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  } finally {
    running = false
    ctx.postMessage({ type: 'ended' })
  }
}

ctx.onmessage = (ev) => {
  const msg = ev.data
  if (msg.type === 'start') void pump(msg.readable)
  else if (msg.type === 'stop') {
    running = false
    void reader?.cancel().catch(() => undefined)
  }
}

export {}
