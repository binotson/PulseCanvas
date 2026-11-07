# PulseCanvas Architecture

## Stack

| Layer | Choice | Version |
| --- | --- | --- |
| Desktop shell | Electron | 43.8.7 (same major as Presage's `electron-quickstart`, which pins 43.2.0) |
| Build | electron-vite + Vite | 6.0.0 + 7.3.7 |
| UI | React + TypeScript + Tailwind CSS v4 + lucide-react | 19.x + 5.9.3 + 4.3.x |
| Art | Canvas 2D (custom engines, no WebGL dependency) | — |
| Vitals | `@smartspectra/node-sdk` (koffi FFI, prebuilt native runtime) | 3.4.0 (pinned exactly) |
| Tests | Vitest + Testing Library + jsdom | 4.1.x |
| Packaging | electron-builder | 26.x |

Compatibility: the SDK needs Node ≥ 20 and Electron ≥ 28. Electron 43 ships its own Node runtime, and the SDK loads through koffi, so there is no native rebuild and no `electron-rebuild`.

## Process model

```
┌──────────────────────── Renderer (sandboxed, contextIsolation) ───────────────────────┐
│ React UI · Art engines · CameraPump                                                   │
│   getUserMedia(video only) → MediaStreamTrackProcessor → [transfer ReadableStream]    │
│   frameWorker.ts: VideoFrame → OffscreenCanvas → RGBA ArrayBuffer → page              │
│   FrameTimestampAnchor: epoch-µs, strictly monotonic                                  │
│   window.pulse (typed PulseApi) ── no Node, no ipcRenderer, no credentials            │
└───────────────────────────────┬───────────────────────────────────────────────────────┘
                                │ contextBridge
┌───────────────────────────────▼──── Preload (src/preload/index.ts) ──────────────────┐
│ Fixed channel names only (IPC.*). Frames → private MessagePort (structured clone).   │
└───────────────────────────────┬───────────────────────────────────────────────────────┘
                                │ ipcRenderer.invoke / MessagePort
┌───────────────────────────────▼──── Main process ────────────────────────────────────┐
│ security.ts   app:// protocol + CSP headers, permission handlers, navigation locks   │
│ index.ts      IPC handlers (sender-origin checked), window lifecycle, quit drain     │
│ apiKey.ts     env / dev .env / safeStorage key resolution (never sent to renderer)   │
│ sdkLoader.ts  guarded require of the native SDK, packaged runtime path               │
│ vitalsService.ts  one SmartSpectraSDK session: useCustomInput → start → sendFrame    │
│                   metrics → decodeMetrics → extractVitals → 'pc:sdk:event'           │
│                   stopAsync → destroy, serialised teardown barrier                   │
│ storage.ts    settings / gallery PNGs / optional session summaries in userData       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Why not the SDK's bundled renderer helper?

`@smartspectra/node-sdk` ships `/main`, `/preload` and `/renderer` helpers. With these, the **renderer** constructs `SmartSpectraSDK({ apiKey })`, so the API key would sit in front-end code. That conflicts with PulseCanvas's rule that credentials never reach the renderer. PulseCanvas instead uses the SDK's documented **custom-input** path in the main process (`useCustomInput()` + `sendFrame()`), where the key is resolved. It also reimplements the parts of the official renderer pipeline that matter for accuracy:

- 1280×720 at about 30 fps by default (the SDK's own default),
- an epoch-anchored, strictly monotonic frame timestamp (otherwise `kNonMonotonicTimestamp`),
- locking exposure, white balance and focus once the SDK reports `kRunning`, when the camera supports it.

Frame conversion runs in a Web Worker, so the art loop never competes with the ~25–30 fps the SDK needs.

## Data model

`src/shared/vitals.ts` maps the protobuf `presage.smartspectra.Metrics` (field paths checked against the SDK's `generated.d.ts`) to a compact JSON `VitalsUpdate`:

| PulseCanvas | SDK field | Notes |
| --- | --- | --- |
| `pulse` | `cardio.pulseRate[]` (latest) | bpm, confidence 0–100, `stable` (≥40 per Presage) |
| `pulseTrace` | `cardio.arterialPressureTrace[]` | Unitless waveform. Only new samples are forwarded |
| `hrv` | `cardio.hrv[]` (latest) | RMSSD, SDNN, mean NN, Baevsky, confidence, `stable` |
| `breathing` | `breathing.rate[]` (latest) | breaths/min, `stable` (≥45 per Presage) |
| `breathingTrace` | `breathing.upperTrace[]` | Chest-motion waveform |
| `inhaleExhaleRatio`, `apneaDetected` | `breathing.inhaleExhaleRatio[]`, `breathing.apnea[]` | Kept for future use |

Validation applied before display:

- Values outside hard plausibility bounds are dropped (pulse 25–240 bpm, breathing 1–70 rpm, RMSSD 1–400 ms).
- Values outside Presage's validated ranges (pulse 40–110 bpm, breathing 5–40 rpm) are shown with a warning badge.
- Confidence is clamped to 0–100. Readings older than 8 s are treated as stale in the UI.
- Signal quality (`src/shared/quality.ts`) combines the SDK's readiness code (`kOk` or not) with confidence. "Good" requires the SDK's own `stable` flag.

## Signal → art pipeline

1. `TraceBuffer` keeps about 20 s of waveform samples with cached min/max for normalisation.
2. `Playhead` replays the buffer in real time about 1.5 s (pulse) or 2 s (breath) behind the newest sample. Packets arrive in bursts, so this smooths them out and the art follows the *measured* waveform.
3. `BeatDetector` finds local maxima in the replayed pulse waveform, with a 300 ms refractory period.
4. `SignalDriver` builds the per-frame `ArtSignals` used by each engine. If no waveform has arrived yet but a rate has, beat and breath timing come from the measured rate (`pulseSource: 'rate'`, shown in the legend). With no readings, every physiological field is null and the engines draw an idle state.

## Security controls

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webviewTag: false`, `webSecurity: true`.
- Production renderer served from the privileged `app://pulsecanvas` scheme (a secure context). It sends a strict CSP header (`default-src 'none'`, `script-src 'self'`, `connect-src 'self'`, `worker-src 'self' blob:`…) and the same policy as a `<meta>` tag. Path traversal outside `out/renderer` is rejected.
- Permission handler: only `media` with `mediaTypes === ['video']` from the app origin. Everything else is denied, including device permissions.
- Navigation and redirects away from the app origin are blocked. `window.open` is denied. External links open in the system browser only if they are on the allow-list.
- Every `ipcMain.handle` checks `event.senderFrame.url` against the trusted origin. The frame port accepts only the main window. All payloads are validated: frame shape and size, PNG signature and size limit, UUID ids, settings schema, session-summary schema, API-key length.
- A single-instance lock stops two processes from driving the camera or SDK at once.
- SDK lifecycle: one session at a time. Teardown (`stopAsync` → `destroy`) is serialised before any new `start`. Sessions stop on window close, reload, renderer crash and app quit (bounded 5 s drain).

## Directory layout

```
src/
  shared/      pure TS used by main, renderer and tests (api contract, vitals, codes, quality, settings, csp, frames)
  main/        Electron main process
  preload/     contextBridge API
  renderer/    React app (index.html, src/{art,components,lib,screens})
scripts/       sdk-check.cjs (real-hardware CLI), smoke.cjs (screenshot smoke test)
tests/         Vitest suites
```
