# PulseCanvas

**Live Human Signal Studio**: turn your pulse and breathing into generative art, measured contact-free from your webcam by the [Presage SmartSpectra SDK](https://smartspectra.presagetech.com/docs/nodejs/).

PulseCanvas is an Electron desktop app. You sit in front of your webcam, and the official `@smartspectra/node-sdk` measures your **pulse**, **breathing** and **heart-rate variability (HRV)** on your computer. Those live signals drive three generative artworks. You can save any moment to a local gallery and export it as a PNG.

> PulseCanvas is for creative and general-wellness use only. SmartSpectra metrics are not FDA-cleared and must not be used for medical diagnosis or treatment.

---

## Features

| Area | What it does |
| --- | --- |
| **Live Human Signal Studio** | Full-screen generative canvas with live pulse, breathing and HRV cards. Each card shows the SDK confidence and its *stable* flag. Also shows a camera preview, a session timer and an immersive mode. |
| **SmartSpectra integration** | Uses the real `@smartspectra/node-sdk` 3.4.0 in the Electron main process (`useCustomInput` + `sendFrame`). It requests the breathing and cardio metric bundles. |
| **Pulse Waves** | Ribbons that draw your measured pulse waveform (the SDK's arterial-pressure trace) as it scrolls across the canvas. Colour follows heart rate, every detected beat sends out a ripple, and HRV adds variation between the ribbons. |
| **Breathing Garden** | A central flower that opens as you inhale and closes as you exhale, following the SDK's chest-motion trace. Each completed breath plants a new bloom, sized by how deep the breath was. |
| **Living Particles** | A 2,200-particle flow field. Heart rate sets the speed, each beat sends a pulse through the swarm, breathing expands and contracts the cloud, and HRV sets the turbulence. |
| **Signal quality & validation** | Shows the SDK's live readiness codes (face position, lighting, motion, frame rate…) as plain-language guidance, plus a 4-step quality meter, a camera-FPS warning and a flag for values outside Presage's validated ranges. |
| **Consent & onboarding** | A 4-step first-run flow: what the app does, how it works, explicit camera/data consent (with a telemetry choice) and a camera check. |
| **Local gallery** | Save artworks, view them full-screen, export a full-resolution PNG or delete them. Everything stays on disk on your computer. |
| **Session insights** | Duration, average/min/max pulse and breathing (preferring SDK-*stable* readings), latest HRV (RMSSD/SDNN), charts and the share of the session with good measurement conditions. Optional local history. |
| **Privacy Centre** | Shows the data flow, a report of what is stored, the telemetry/history/export controls and selective deletion of local data. |
| **Settings** | API key (encrypted with the OS keychain), capture resolution, camera preview/mirroring, default art style, reduced motion and version info. |

Each art engine runs only on genuine SDK readings. With no live reading, the artwork goes into a clearly labelled *idle* state and no values are made up. Before the SDK has delivered its first waveform samples, beats are timed from the measured rate, and the legend says so.

## How it works

```
Webcam ─► Renderer (getUserMedia ─► Worker: VideoFrame → RGBA)
              │  window.pulse.sdk.sendFrame()   (contextBridge, no credentials)
              ▼
          Preload ─── MessagePort ───► Main process ─► SmartSpectraSDK (native, on-device)
                                          ▲                    │
                                          │ API key (env/.env  │ metrics protobuf
                                          │ or safeStorage)    ▼
          Renderer ◄── pc:sdk:event ───── decodeMetrics → extractVitals → VitalsUpdate (JSON)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design and [PRIVACY.md](PRIVACY.md) for data handling.

## Requirements

- **Windows 10/11 x64** (the platform tested here). The SDK also supports macOS Apple Silicon, Linux x64 and Linux arm64 (glibc ≥ 2.35).
- **Node.js ≥ 22.12** (tested with Node 22.23.4 and npm 12.2.1).
- A webcam that can deliver about 25–30 fps.
- A **SmartSpectra API key**, free from the [Presage Developer Portal](https://physiology.presagetech.com/auth/login).
- An internet connection: the SDK checks your API key and subscription with Presage.

## Install & run on Windows (development)

```powershell
git clone https://github.com/binotson/PulseCanvas.git
cd PulseCanvas
npm install
```

> **npm 11+/12 note:** newer npm versions block dependency install scripts by default. PulseCanvas does not need koffi's, esbuild's or protobufjs's scripts (they ship prebuilt binaries). It does need **Electron's** download step. If `node_modules\electron\dist` is missing after install, run:
>
> ```powershell
> node node_modules/electron/install.js
> ```

Configure your API key (development). Pick one:

```powershell
# Option A — .env file (git-ignored, read only by the main process at runtime)
Copy-Item .env.example .env
notepad .env          # set SMARTSPECTRA_API_KEY=...

# Option B — environment variable for this shell
$env:SMARTSPECTRA_API_KEY = "your-key"

# Option C — start the app and paste the key in Settings → SmartSpectra API key
#            (stored encrypted with Windows DPAPI via Electron safeStorage)
```

Start the app:

```powershell
npm run dev
```

On first launch, complete onboarding and accept the consent screen. Then press **Start live session**. Sit about an arm's length from the camera in soft, even light. Pulse appears after about 12 s, breathing after about 30 s and HRV after about 60 s of steady signal.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Electron + Vite with hot reload |
| `npm run typecheck` | TypeScript checks: main/preload, renderer and tests |
| `npm run lint` | ESLint (typescript-eslint, react-hooks) |
| `npm test` | Vitest unit tests |
| `npm run build` | Typecheck + production bundles into `out/` |
| `npm start` | Run the production bundles (`electron-vite preview`) |
| `npm run verify` | typecheck + lint + test + build |
| `npm run sdk:check` | **Real hardware check:** loads the native SDK and lists cameras (no key needed) |
| `npm run sdk:check -- --measure 60` | **Real live measurement** in the terminal for 60 s (needs `SMARTSPECTRA_API_KEY`) |
| `npm run pack` | Unpacked packaged app in `release/` (packaging check) |
| `npm run dist:win` | Windows NSIS installer in `release/` |

## Testing

- **Unit tests (`npm test`)** cover metric extraction, signal validation, quality scoring, trace playback, beat detection, frame validation, timestamps, storage sanitisation, settings, link allow-listing and UI primitives.
  - `tests/vitals.test.ts` encodes messages with the **SDK's own protobuf schema** (`@smartspectra/node-sdk/messages`) and decodes them with the SDK's `decodeMetrics`. The values in these messages are synthetic test inputs.
  - `tests/sdkCodes.test.ts` loads the **real native SDK** and checks that PulseCanvas's copies of its enums still match.
  - `tests/vitalsService.test.ts` uses a **mock SDK object** to test session lifecycle, teardown ordering and frame handling. It does not measure anything.
- **Hardware verification** needs a person, a camera and an API key. See the checklist below. Automated tests never stand in for it.

### Manual hardware checklist

1. `npm run sdk:check`: the SDK loads and lists your camera.
2. `npm run sdk:check -- --measure 60`: `PULSE`/`BREATH`/`HRV` lines appear while you sit still.
3. `npm run dev` → Start live session: the camera light comes on, the quality panel shows SDK validation hints, and the pulse card fills in with a confidence badge.
4. Pulse Waves ribbons follow your waveform. The legend reads "ribbons trace your pulse waveform".
5. Breathing Garden: the flower opens and closes with your breathing, and the "breaths planted" count goes up.
6. Stop the session: the camera light goes off and Insights shows the session.
7. Save an artwork, then export it as a PNG from the Gallery.

## Packaging

`electron-builder.yml` keeps the SmartSpectra per-platform native runtime out of the asar. It ships the runtime as `resources/smartspectra/` and unpacks `koffi`, following the SDK's packaging guidance. At runtime, `src/main/sdkLoader.ts` points `SMARTSPECTRA_CAPI_PATH` at that folder. For distribution on Windows, Authenticode-sign the app and the bundled DLLs.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Electron failed to install correctly` / no `electron.exe` | `node node_modules/electron/install.js` (npm blocked the install script) |
| Banner: *Add your SmartSpectra API key* | Set `SMARTSPECTRA_API_KEY` in `.env`, or paste a key in Settings |
| `kAuthenticationFailed` | The key was rejected. Check it on the Presage portal |
| `kCreditExhausted` | Your Presage plan has no credits left |
| `kNetworkError` | The SDK could not reach Presage to validate the key. Check your connection or proxy |
| *Camera access was blocked* | Windows Settings → Privacy & security → Camera → allow desktop apps |
| *Camera is in use* | Close Teams, Zoom, OBS or other apps that hold the webcam |
| Quality stuck on "Too dark"/"Too much motion" | Face a soft light source, rest your arms and keep your head still |
| *Camera is below ~25 fps* | Use 480p in Settings, close heavy apps or improve the lighting (low light lowers webcam fps) |
| SDK load error on start | Re-run `npm install`. The `@smartspectra/node-sdk-win32-x64` package must be present |

Set `SMARTSPECTRA_DIAGNOSTICS=1` for extra SDK logging.

## Project status

See [CHALLENGE_SUBMISSION.md](CHALLENGE_SUBMISSION.md) for what has been verified and what is still pending.

## License

PulseCanvas source: MIT. The SmartSpectra SDK is proprietary to Presage Technologies and is used under [Presage's Terms of Service](https://physiology.presagetech.com/tos). It is installed from npm and not redistributed in this repository.
