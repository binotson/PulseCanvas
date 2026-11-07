# PulseCanvas Privacy

PulseCanvas handles camera video and physiological signals, so it is built to collect as little as possible and keep it local. This document describes what the code in this repository actually does. It also quotes or paraphrases what Presage documents about the SmartSpectra SDK, with links.

_Last reviewed: 7 November 2026, against `@smartspectra/node-sdk` 3.4.0._

## Summary

| Data | Where it goes | Stored? |
| --- | --- | --- |
| Camera frames | Renderer → preload → Electron main process → SmartSpectra SDK, all on your computer | **Never** written to disk or uploaded by PulseCanvas |
| Pulse / breathing / HRV readings | Computed on-device by the SDK, shown in the UI | Kept in memory during a session. Summary statistics are saved only if you turn on *Keep session history* |
| Pulse and breathing waveforms | Kept in memory (last ~20 s) to drive the artwork | Never |
| Saved artworks (PNG) | Your user-data folder | Yes, only when you click *Save artwork*. Delete them any time |
| Settings and consent timestamp | `settings.json` in your user-data folder | Yes |
| SmartSpectra API key | Main process only | Optional, encrypted with Electron `safeStorage` (Windows DPAPI) |
| SDK ↔ Presage traffic | Presage servers | See below |

On Windows, the user-data folder is `%APPDATA%\PulseCanvas`. The Privacy Centre in the app shows the exact path and what it contains.

## Camera

- The camera turns on only while a live session runs, or during the optional onboarding camera check (which turns itself off after 6 s). Your OS camera indicator shows when it is on.
- PulseCanvas asks for **video only**. The Electron permission handler rejects microphone requests, and any request from an origin other than the app.
- Frames are converted to RGBA in a Web Worker and sent to the main process over a dedicated `MessagePort`. The main process passes them to the SDK's `sendFrame()`. PulseCanvas never records, encodes, saves or transmits frames.
- Frames sent to the SDK are not mirrored. The mirroring setting only affects the on-screen preview.

## What the SmartSpectra SDK sends to Presage

From Presage's documentation:

- **Authentication.** *"All metric computation runs on-device inside the SDK; the backend is only contacted to authenticate the API key and validate the subscription."* ([SmartSpectra docs index](https://smartspectra.presagetech.com/llms.txt)). An internet connection is needed for this. Network or authentication failures show up as `kNetworkError` / `kAuthenticationFailed`.
- **Telemetry (`enableTelemetry`).** The SDK default is **on**. **PulseCanvas defaults it to off** and passes your choice to the SDK as `enableTelemetry`. When it is on, Presage documents that the SDK sends aggregate, once-per-session data: SDK version, platform/OS/device model/CPU architecture, input source kind, outcome, metric count, performance counters, validation-state counts, a coarse error code on failure, and a timestamp. Presage says it does **not** collect raw frames, measured values, file paths, prompts, free-text errors, or user or device identifiers. When it is off, *"the SDK starts no telemetry session and transmits nothing"* (telemetry only; authentication still happens). Source: [Telemetry & privacy](https://github.com/Presage-Security/SmartSpectra/blob/main/docs/telemetry-and-privacy.md).
- **LLM Insights.** The SDK has an optional `requestInsight()` feature that sends buffered metric values and your prompt text to Presage. **PulseCanvas does not use this feature.**
- **Device-key cache.** The SDK keeps a cache directory, which some of its models need (for example the arterial-pressure trace). On Windows this is `%LOCALAPPDATA%\SmartSpectraSDK`. The Privacy Centre can delete it.

PulseCanvas cannot inspect the SDK's encrypted traffic. These statements come from Presage's documentation, not from independent network analysis.

## What PulseCanvas itself sends

Nothing. The renderer's Content-Security-Policy allows no remote origins (`connect-src 'self'`). PulseCanvas has no analytics, crash reporting or update checks. External links (Presage docs, the portal, this repository) open in your default browser only when you click them, and only allow-listed `https://` URLs can be opened.

## Exports

Saved artworks contain only the artwork and a small "PulseCanvas" mark. Your vitals are written into the image only if you turn on **Include vitals in saved artworks** (off by default), so images you share don't reveal health data unless you choose that.

## Your controls

Privacy Centre → **Delete data** lets you remove any combination of: artworks, session history, settings and consent, the stored API key, and the SDK cache. Turning *Keep session history* off deletes any existing history. Uninstalling the app does not remove the user-data folder; delete `%APPDATA%\PulseCanvas` and `%LOCALAPPDATA%\SmartSpectraSDK` to remove everything.

## Medical disclaimer

*"SDK metrics are offered for general wellness and informational purposes only. SDK metrics have not been cleared by the FDA and may not be used for medical diagnosis or treatment."* ([Presage, Measurement quality](https://smartspectra.presagetech.com/docs/measurement-quality.md))
