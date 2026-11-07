#!/usr/bin/env node
/**
 * PulseCanvas — SmartSpectra SDK hardware check (headless, no Electron).
 *
 * Step 1 (no API key needed): loads the real native SDK, prints its version,
 *          and lists cameras discovered by the SDK on this machine.
 * Step 2 (needs SMARTSPECTRA_API_KEY): opens the default camera natively,
 *          runs a real measurement session, and prints pulse / breathing / HRV
 *          readings as they arrive.
 *
 * Usage:
 *   npm run sdk:check                      # step 1 only
 *   npm run sdk:check -- --measure 60      # step 1 + 60-second live session
 *
 * The key is read from the environment or the project's .env file.
 * On Windows it deletes the SDK's stale device-key cache before measuring
 * (see src/main/deviceKeyReset.ts); nothing else is written to disk.
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

function readKey() {
  if (process.env.SMARTSPECTRA_API_KEY) return process.env.SMARTSPECTRA_API_KEY.trim()
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return ''
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*SMARTSPECTRA_API_KEY\s*=\s*(.*)\s*$/.exec(line)
    if (m) return m[1].replace(/^["']|["']$/g, '').trim()
  }
  return ''
}

const args = process.argv.slice(2)
const measureIdx = args.indexOf('--measure')
const measureSec = measureIdx >= 0 ? Number(args[measureIdx + 1] || 60) : 0

let sdkMod
try {
  sdkMod = require('@smartspectra/node-sdk')
} catch (err) {
  console.error('FAIL  could not load @smartspectra/node-sdk:', err.message)
  process.exit(1)
}

const { SmartSpectraSDK, CameraSelection, breathingMetrics, cardioMetrics, decodeMetrics } = sdkMod
console.log(`OK    SmartSpectra SDK loaded — version ${SmartSpectraSDK.version} on ${process.platform}-${process.arch}`)

try {
  const cams = SmartSpectraSDK.availableCameras()
  console.log(`OK    ${cams.length} camera(s) discovered by the SDK:`)
  for (const c of cams) console.log(`        - ${c.name ?? '(unnamed)'}  id=${c.id}  facing=${c.facing}`)
} catch (err) {
  console.log('WARN  camera discovery failed:', err.message)
}

if (!measureSec) {
  console.log('\nRun with `-- --measure 60` and SMARTSPECTRA_API_KEY set to test a live session.')
  process.exit(0)
}

const apiKey = readKey()
if (!apiKey) {
  console.error('FAIL  SMARTSPECTRA_API_KEY is not set (environment or .env).')
  process.exit(2)
}

// SDK 3.4.0 Windows bug: a device key provisioned by an earlier process can't be
// decrypted (NCryptDecrypt "Invalid flags") and start() fails. Same workaround
// as src/main/deviceKeyReset.ts; set PULSECANVAS_KEEP_DEVICE_KEY=1 to skip.
if (process.platform === 'win32' && process.env.PULSECANVAS_KEEP_DEVICE_KEY !== '1') {
  const root = path.join(process.env.LOCALAPPDATA || path.join(require('node:os').homedir(), 'AppData', 'Local'), 'Presage', 'Physiology')
  if (fs.existsSync(root)) {
    for (const d of fs.readdirSync(root)) {
      const f = path.join(root, d, 'emd', 'device_keys.secure')
      if (fs.existsSync(f)) {
        fs.rmSync(f, { force: true })
        console.log(`      reset stale SmartSpectra device key (Windows workaround): ${f}`)
      }
    }
  }
}

const sdk = new SmartSpectraSDK({
  apiKey,
  requestedMetrics: [...breathingMetrics, ...cardioMetrics],
  enableTelemetry: false
})

const seen = { pulse: 0, breathing: 0, hrv: 0 }
const last = (arr) => (arr && arr.length ? arr[arr.length - 1] : null)

sdk.on('processingStatus', (s) => console.log(`      status=${s}`))
sdk.on('validationStatus', (code, _ts, hint) => console.log(`      validation=${code} ${hint || ''}`))
sdk.on('error', (code, message, retryable) => console.error(`ERROR code=${code} retryable=${retryable} ${message}`))
sdk.on('metrics', (buf) => {
  const m = decodeMetrics(buf)
  const p = last(m.cardio && m.cardio.pulseRate)
  const b = last(m.breathing && m.breathing.rate)
  const h = last(m.cardio && m.cardio.hrv)
  if (p) {
    seen.pulse++
    console.log(`PULSE ${p.value.toFixed(1)} bpm  confidence=${(p.confidence || 0).toFixed(0)} stable=${!!p.stable}`)
  }
  if (b) {
    seen.breathing++
    console.log(`BREATH ${b.value.toFixed(1)} rpm  confidence=${(b.confidence || 0).toFixed(0)} stable=${!!b.stable}`)
  }
  if (h && h.rmssd) {
    seen.hrv++
    console.log(`HRV   rmssd=${h.rmssd.toFixed(1)} ms sdnn=${(h.sdnn || 0).toFixed(1)} ms confidence=${(h.confidence || 0).toFixed(0)}`)
  }
})

async function finish(code) {
  try {
    await sdk.stopAsync()
  } catch {
    /* ignore */
  }
  await sdk.destroy()
  console.log(`\nSummary: pulse packets=${seen.pulse} breathing packets=${seen.breathing} hrv packets=${seen.hrv}`)
  process.exit(code)
}

process.on('SIGINT', () => void finish(130))

try {
  sdk.useCamera(CameraSelection.default)
  sdk.start()
  console.log(`      measuring for ${measureSec}s from the default camera — sit still, face the camera…`)
} catch (err) {
  console.error(`FAIL  start failed code=${err.code} ${err.message}`)
  void finish(3)
}

setTimeout(() => void finish(seen.pulse || seen.breathing ? 0 : 4), measureSec * 1000)
