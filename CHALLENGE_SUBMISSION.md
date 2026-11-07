# PulseCanvas: Presage Challenge Submission Kit

- **Repository:** https://github.com/binotson/PulseCanvas
- **Deadline:** November 22, 2026, 11:59 PM Pacific Standard Time
- **Tag:** `#presagechallenge`

## 1. Verification status

This section separates what has been verified from what has not. **Update it after you run the live checks.**

| Item | Status | How it was verified |
| --- | --- | --- |
| Native SDK loads on Windows x64 | ✅ Verified on the dev machine | `npm run sdk:check` → `SmartSpectra SDK loaded — version 3.4.0 on win32-x64` |
| SDK camera discovery | ✅ Verified on the dev machine | `npm run sdk:check` listed the built-in "Integrated Camera" |
| Enum values match the installed SDK | ✅ Automated (real SDK) | `tests/sdkCodes.test.ts` |
| Metric field paths match the SDK protobuf schema | ✅ Automated (real schema, synthetic values) | `tests/vitals.test.ts` |
| Session lifecycle / teardown / frame validation | ✅ Automated (**mock SDK**) | `tests/vitalsService.test.ts` |
| TypeScript, ESLint, unit tests, production build | ✅ See README → Testing | `npm run verify` |
| Live pulse measurement | ⏳ **Not yet verified.** Needs an API key and a person at the camera | `npm run sdk:check -- --measure 60`, then the in-app checklist |
| Live breathing measurement | ⏳ Not yet verified | as above |
| Live HRV | ⏳ Not yet verified (the SDK needs about 60 s of steady pulse) | as above |
| Artwork responding to live signals | ⏳ Not yet verified with live data | README → Manual hardware checklist |

Do not publish claims about live accuracy or behaviour until the ⏳ rows are checked.

## 2. Pre-submission checklist

- [ ] Get an API key at https://physiology.presagetech.com/auth/login
- [ ] `npm run sdk:check -- --measure 60`: confirm PULSE/BREATH lines (save the terminal output)
- [ ] `npm run dev`: complete onboarding, run a 2-minute session in each art style
- [ ] Capture **real** screenshots: Studio (each style), Insights, Privacy Centre, Gallery
- [ ] Record the demo video (script below)
- [ ] Optional: `npm run dist:win` and test the installer on a clean Windows machine
- [ ] Update the status table above and the README
- [ ] Publish the DEV article with `#presagechallenge` and the repo link
- [ ] Submit before **Nov 22, 2026, 11:59 PM PST**

## 3. DEV Community article (draft)

> Replace the `[SCREENSHOT: …]` placeholders with your own captures, and the `[YOUR …]` placeholders with your own observations. Do not publish placeholder text.

---

**Title:** PulseCanvas: I turned my heartbeat and breathing into generative art with a webcam

**Tags:** `#presagechallenge` `#electron` `#generativeart` `#typescript`

**Cover image:** [SCREENSHOT: Pulse Waves during a live session]

### What I built

PulseCanvas is a desktop "Live Human Signal Studio". You sit in front of your webcam and the [Presage SmartSpectra SDK](https://smartspectra.presagetech.com/docs/nodejs/) measures your **pulse**, **breathing** and **heart-rate variability** with no contact and no wearable. Those signals then become the brush for three generative artworks:

- **Pulse Waves.** Glowing ribbons draw your actual pulse waveform as it scrolls across the screen. Each detected heartbeat sends a ripple out from the centre, and the colour moves from cyan to violet to pink as your heart rate rises.
- **Breathing Garden.** A flower opens when you inhale and closes when you exhale. Each breath you complete plants a new bloom, sized by how deep that breath was. After a few minutes you have a garden grown from your own breathing.
- **Living Particles.** A swarm of 2,200 particles. Heart rate sets their speed, every beat pulses through them, breathing expands and contracts the cloud, and HRV controls how turbulent the flow is.

Any moment can be saved to a local gallery and exported as a full-resolution PNG.

[SCREENSHOT: Breathing Garden after a few minutes]

### How SmartSpectra is used

PulseCanvas uses the official `@smartspectra/node-sdk` (v3.4.0) in Electron's **main process**. It requests the breathing and cardio metric bundles and feeds camera frames in through the SDK's custom-input API:

```ts
const sdk = new SmartSpectraSDK({
  apiKey,                                   // resolved in the main process only
  requestedMetrics: [...breathingMetrics, ...cardioMetrics],
  enableTelemetry: settings.telemetryEnabled // off by default in PulseCanvas
})
sdk.on('metrics', (buf) => emit(extractVitals(decodeMetrics(buf), cursor)))
sdk.on('validationStatus', (code, _ts, hint) => emit({ type: 'validation', code, hint }))
sdk.useCustomInput(FrameTransform.kNone)
sdk.start()
// …for every camera frame:
sdk.sendFrame(rgba, width, height, width * 4, PixelFormat.kRGBA, timestampUs)
```

The art is driven by the SDK's **waveforms**, not just its numbers. PulseCanvas reads `cardio.arterialPressureTrace` (pulse shape) and `breathing.upperTrace` (chest motion), buffers about 20 seconds, and replays them about 1.5 s behind real time so the visuals move smoothly with your body. Beats are detected from the waveform. The rates and HRV (`cardio.pulseRate`, `breathing.rate`, `cardio.hrv`) set colour, speed and turbulence.

Quality matters, so the UI shows the SDK's own signals: every reading carries its **confidence** and **stable** flag, the SDK's readiness codes (face not centred, too dark, too much motion, low frame rate…) become live guidance, and values outside Presage's validated ranges get a badge.

### Privacy by design

- The API key never reaches the UI. The SDK's bundled Electron renderer helper takes the key in renderer code, so I used the custom-input path and kept the key in the main process (encrypted with Windows DPAPI via `safeStorage`, or read from an env var).
- Video is processed on the computer. Per Presage, the SDK contacts its backend only to validate the key and subscription.
- SDK telemetry is **opt-in** in PulseCanvas, even though the SDK defaults it on.
- Electron is locked down: `contextIsolation`, `sandbox`, no `nodeIntegration`, a strict CSP from a custom `app://` scheme, video-only camera permission for the app's own origin, and origin-checked IPC.
- A Privacy Centre shows exactly what's stored and lets you delete it.

[SCREENSHOT: Privacy Centre]

### What I learned

[YOUR NOTES: e.g. how long it took for readings to stabilise, how lighting affected confidence, what surprised you about seeing your own pulse waveform.]

### Try it

```bash
git clone https://github.com/binotson/PulseCanvas.git
cd PulseCanvas && npm install
copy .env.example .env   # add your SmartSpectra API key
npm run dev
```

Repo: https://github.com/binotson/PulseCanvas

*PulseCanvas is for creative and wellness use only. SmartSpectra metrics are not FDA-cleared and are not for medical use.*

---

## 4. Demo video script (2–3 minutes)

| Time | On screen | Voice-over |
| --- | --- | --- |
| 0:00–0:12 | Title card → app launches to onboarding | "This is PulseCanvas. It turns your heartbeat and your breathing into art, using nothing but a webcam." |
| 0:12–0:30 | Onboarding: How it works → Privacy & consent (show the telemetry toggle off) → Camera check | "It runs on Presage's SmartSpectra SDK. My video is processed on this computer. I give explicit consent, and SDK telemetry stays off unless I turn it on." |
| 0:30–0:55 | Studio → Start live session. Show the quality panel guidance changing as you adjust position. Pulse card fills in with a confidence badge | "When I start a session, the SDK tells me if I'm centred, if the light's right, if I'm moving too much. About twelve seconds in, there's my pulse, with the SDK's confidence next to it." |
| 0:55–1:25 | Pulse Waves full screen (immersive mode). Point out the ripple on each beat | "These ribbons are drawing my actual pulse waveform from the SDK, live. Every ripple is a heartbeat it detected." |
| 1:25–1:55 | Switch to Breathing Garden. Take slow, deep breaths | "In Breathing Garden, the flower opens when I breathe in. Every breath plants a new flower, and a deep breath grows a bigger one." |
| 1:55–2:15 | Switch to Living Particles, then Save artwork | "And Living Particles: my heart rate sets their speed, and HRV, once it arrives, sets the turbulence. I can save any moment." |
| 2:15–2:35 | Stop session → Insights → Gallery → Export PNG | "When I stop, Insights summarises the session using the readings the SDK marked as stable. My artworks stay on my computer, and I can export them as PNG." |
| 2:35–2:50 | Privacy Centre → Delete data | "And everything stored is visible and deletable right here. PulseCanvas: your body is the brush. Link and code below." |

**Recording tips:** use soft, even front lighting. Keep the camera steady (on a stand, not handheld). Wait for "Stable" badges before the close-ups. Record at 1080p. Show only real readings, and don't edit the numbers.
