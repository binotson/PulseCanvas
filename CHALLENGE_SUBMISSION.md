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
| TypeScript, ESLint, unit tests (69), production build | ✅ Passing | `npm run verify` |
| App launches in real Electron 43; all screens render; SDK loads in the Electron main process | ✅ Verified on the dev machine | `npm run smoke` screenshots of onboarding, studio (all 3 styles, idle), insights, gallery, settings, privacy |
| Windows packaging (`electron-builder --dir`) | ✅ Verified | `release/win-unpacked` built; packaged runtime loaded the SDK from `resources/smartspectra` and discovered the camera; packaged app launched cleanly |
| NSIS installer (`npm run dist:win`) | ⏳ Not run | — |
| Live camera capture → SDK frame pipeline in the app | ✅ Verified on the dev machine (2026-11-07) | `npm run dev`: ~10 live sessions started and stopped; camera light, SDK quality hints, stop, Insights, save and PNG export all worked |
| Live pulse measurement | ⛔ **Blocked on the dev machine; not yet verified.** The SDK's pulse model (`phasic-bp-inference`) needs Vulkan, and the dev laptop (Intel i7-4600U, HD Graphics, Haswell) has no Vulkan driver on Windows. Needs a PC with Intel 6th-gen+ or a recent AMD/NVIDIA GPU | `npm run sdk:check -- --measure 60` → 0 pulse packets, `Vulkan is not available: vkCreateInstance failed with ErrorIncompatibleDriver` |
| Live breathing measurement | ✅ Verified on the dev machine (2026-11-07) | `evidence/sdk-check-measure-60.txt`: 14 BREATH readings, settling at 12–17 rpm with confidence 59–72 and `stable=true` |
| Live HRV | ⛔ Blocked with pulse (HRV comes from the pulse pipeline) | as above |
| Artwork responding to live signals | 🟡 Breathing verified; pulse-driven visuals pending | Breathing Garden followed live breathing in `npm run dev`. Pulse Waves and the pulse/HRV parts of Living Particles need a Vulkan-capable PC |
| SDK 3.4.0 Windows device-key bug | ✅ Worked around | After the first run, the SDK can't decrypt its own `device_keys.secure` (`NCryptDecrypt(size) failed: Invalid flags specified`) and every later start fails with `SmartSpectra configuration failed`. `src/main/deviceKeyReset.ts` and `sdk:check` delete the file at startup; no failures in ~10 app sessions afterwards. Worth reporting to Presage |

Do not publish claims about live accuracy or behaviour until the ⏳ rows are checked.

## 2. Pre-submission checklist

- [x] Get an API key at https://physiology.presagetech.com/auth/login
- [ ] `npm run sdk:check -- --measure 60`: confirm PULSE/BREATH lines (save the terminal output). BREATH done (`evidence/sdk-check-measure-60.txt`); PULSE needs a Vulkan-capable PC
- [x] `npm run dev`: complete onboarding and run live sessions (breathing verified)
- [ ] Capture **real** screenshots: Breathing Garden (mid-session and filled), Studio with a quality hint, Insights, Privacy Centre, Gallery
- [ ] Record the demo video (script below)
- [ ] Optional: `npm run dist:win` and test the installer on a clean Windows machine
- [ ] Update the status table above and the README
- [ ] Publish the DEV article with `#presagechallenge` and the repo link
- [ ] Submit before **Nov 22, 2026, 11:59 PM PST**

## 3. DEV Community article (draft)

> Replace the `[SCREENSHOT: …]` placeholders with your own captures, and the `[YOUR …]` placeholders with your own observations. Do not publish placeholder text.
>
> This draft centres on **breathing**, the signal verified live on the dev laptop. Pulse and HRV are implemented but were not measured on this hardware (see §1). Don't add pulse claims unless you verify them on a Vulkan-capable PC.

---

**Title:** PulseCanvas: I grew a garden out of my own breathing, with nothing but a webcam

**Tags:** `#presagechallenge` `#electron` `#generativeart` `#typescript`

**Cover image:** [SCREENSHOT: Breathing Garden after a few minutes of live breathing]

### What I built

PulseCanvas is a desktop "Live Human Signal Studio". You sit in front of your webcam and the [Presage SmartSpectra SDK](https://smartspectra.presagetech.com/docs/nodejs/) measures your **breathing** contact-free, from the motion of your chest. No strap, no wearable. That breathing becomes the brush.

The centrepiece is **Breathing Garden**:

- A flower in the middle **opens as you inhale and closes as you exhale**, driven directly by the SDK's chest-motion waveform.
- Every breath you complete **plants a new bloom**, sized by how deep that breath was. A counter shows how many breaths you've planted.
- The garden builds up over the session, so after a few minutes the canvas is a record of every breath that grew it. Calm, deep breathing makes a sparse garden of big flowers; quick, shallow breathing makes a dense field of small ones.

Two more styles respond to breathing too: in **Living Particles**, a swarm of 2,200 particles expands and contracts with your chest; in **Pulse Waves**, the ribbons rise and fall as you breathe.

Any moment can be saved to a local gallery and exported as a full-resolution PNG.

[SCREENSHOT: Breathing Garden mid-inhale, flower open, "breaths planted" counter visible]

### How SmartSpectra is used

PulseCanvas uses the official `@smartspectra/node-sdk` (v3.4.0) in Electron's **main process**. It requests the breathing (and cardio) metric bundles and feeds camera frames in through the SDK's custom-input API:

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

The art is driven by the SDK's **waveform**, not just its numbers. PulseCanvas reads `breathing.upperTrace` (chest motion), buffers about 20 seconds, and replays it about 1.5 s behind real time so the flower moves smoothly with your body. Inhales and exhales are detected from that trace, and each completed breath plants a bloom. `breathing.rate` is shown alongside it.

In my test, the SDK's first breathing readings arrived with confidence 0 and `stable=false`. Within the 60-second run they settled at **12–17 breaths per minute**, confidence **59–72** and `stable=true`. [YOUR NOTES: add what you saw in the app, e.g. how long until the first stable reading.]

Quality matters, so the UI shows the SDK's own signals. Every reading carries its **confidence** and **stable** flag. The SDK's readiness codes turn into live guidance. In my sessions the most common hints were "Place more of the chest in view" and "Increase light on face", which makes sense for a signal that comes from your chest.

[SCREENSHOT: Studio with the quality panel showing an SDK hint]

### Privacy by design

- The API key never reaches the UI. The SDK's bundled Electron renderer helper takes the key in renderer code, so I used the custom-input path and kept the key in the main process (encrypted with Windows DPAPI via `safeStorage`, or read from an env var).
- Video is processed on the computer. Per Presage, the SDK contacts its backend only to validate the key and subscription.
- SDK telemetry is **opt-in** in PulseCanvas, even though the SDK defaults it on.
- Electron is locked down: `contextIsolation`, `sandbox`, no `nodeIntegration`, a strict CSP from a custom `app://` scheme, video-only camera permission for the app's own origin, and origin-checked IPC.
- A Privacy Centre shows exactly what's stored and lets you delete it.

[SCREENSHOT: Privacy Centre]

### What I learned

**Breathing is a forgiving signal to make art from.** It's slow and large, so it reads clearly even through a 2013 laptop webcam. [YOUR NOTES: what it felt like to watch the flower open with your own breath.]

**Framing matters more than I expected.** Breathing comes from chest motion, so sitting close with only my face in frame gave "Place more of the chest in view" most of the time. Sitting back about an arm's length with a light in front of me fixed it.

**Two real-world SDK gotchas on Windows**, in case they save you time:

1. **Device-key cache.** With SDK 3.4.0, the first run worked, and every run after that failed with `SmartSpectra configuration failed`. The log showed `NCryptDecrypt(size) failed: Invalid flags specified`: the SDK couldn't decrypt the device key it had saved in `%LOCALAPPDATA%\Presage\Physiology\…\emd\device_keys.secure` on the previous run. Deleting that file before each launch makes the SDK provision a fresh key. PulseCanvas now does this automatically at startup, Windows only.
2. **Pulse needs a Vulkan GPU.** On my laptop (Intel i7-4600U, Haswell integrated graphics) breathing worked but pulse never appeared. The SDK's pulse model failed with `Vulkan is not available: vkCreateInstance failed with ErrorIncompatibleDriver`, and Intel has no Windows Vulkan driver for that generation. PulseCanvas already has pulse-driven visuals (Pulse Waves ribbons, heartbeat ripples, HRV turbulence), but I couldn't verify them on this machine, so this post sticks to what I measured.

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

## 4. Demo video script (about 2½ minutes, breathing-first)

Recorded on the dev laptop, where pulse is unavailable. **Don't show or narrate pulse, heart-rate or HRV readings.** If the pulse card is visible it will show that it's waiting; leave it without comment.

| Time | On screen | Voice-over |
| --- | --- | --- |
| 0:00–0:12 | Title card → app launches to onboarding | "This is PulseCanvas. It turns your breathing into art, using nothing but a webcam." |
| 0:12–0:30 | Onboarding: How it works → Privacy & consent (show the telemetry toggle off) → Camera check | "It runs on Presage's SmartSpectra SDK. My video is processed on this computer. I give explicit consent, and SDK telemetry stays off unless I turn it on." |
| 0:30–0:55 | Studio → Start live session. Lean in close first so the quality panel shows "Place more of the chest in view", then sit back so it clears. Breathing card fills in with a confidence badge | "The SDK reads breathing from the motion of my chest, so it tells me when it can't see enough of it. If I sit back… that's better. And there's my breathing rate, with the SDK's confidence next to it." |
| 0:55–1:35 | Breathing Garden, full screen (immersive mode). Take slow, deep breaths, then a few quicker shallow ones | "In Breathing Garden, the flower opens as I breathe in… and closes as I breathe out. Every breath plants a new flower. A deep breath grows a big one. Quick, shallow breaths make small ones." |
| 1:35–1:55 | Let the garden fill. Point out the "breaths planted" counter | "After a minute or two, the garden is a picture of how I've been breathing." |
| 1:55–2:10 | Switch to Living Particles while breathing slowly, then back to the garden and Save artwork | "The particle swarm breathes with me too: it expands on every inhale. And I can save any moment." |
| 2:10–2:25 | Stop session → Insights → Gallery → Export PNG | "When I stop, Insights summarises the session using the readings the SDK marked as stable. My artworks stay on my computer, and I can export them as PNG." |
| 2:25–2:40 | Privacy Centre → Delete data | "Everything stored is visible and deletable right here. PulseCanvas: your breath is the brush. Link and code below." |

**Recording tips:** sit about an arm's length from the camera with your chest in frame. Use soft, even light in front of you, not a window behind you. Keep the camera steady (on a stand, not handheld). Wait for the "Stable" badge before the close-ups. Breathe a little slower and deeper than usual so the flower's movement reads on video. Record at 1080p. Show only real readings, and don't edit the numbers.
