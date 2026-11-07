#!/usr/bin/env node
/**
 * Launches the BUILT app (out/) in real Electron with an isolated, temporary
 * user-data directory, captures a screenshot of the window, and exits.
 *
 *   npm run build:only && node scripts/smoke.cjs <screen> <output.png>
 *
 * <screen> = onboarding | studio[:pulse-waves|breathing-garden|living-particles]
 *            | settings | privacy | gallery | insights
 *
 * For screens past onboarding, settings are pre-seeded with consent so the
 * app opens straight to the studio. This exercises the real main process,
 * preload, CSP and app:// protocol — but not a live measurement.
 */
'use strict'
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const [screen, artMode = 'pulse-waves'] = (process.argv[2] || 'onboarding').split(':')
const out = path.resolve(process.argv[3] || `smoke-${screen}.png`)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsecanvas-smoke-'))

if (screen !== 'onboarding') {
  fs.writeFileSync(
    path.join(dir, 'settings.json'),
    JSON.stringify({ onboardingComplete: true, consentAcceptedAt: new Date().toISOString(), defaultArtMode: artMode })
  )
}

const electron = require('electron')
const env = {
  ...process.env,
  PULSECANVAS_USER_DATA_DIR: dir,
  PULSECANVAS_SMOKE_SCREENSHOT: out,
  PULSECANVAS_SMOKE_ROUTE: screen,
  ELECTRON_RENDERER_URL: ''
}
const res = spawnSync(electron, [path.join(__dirname, '..')], { env, stdio: 'inherit', timeout: 60000 })
fs.rmSync(dir, { recursive: true, force: true })
if (!fs.existsSync(out)) {
  console.error('smoke: no screenshot produced', res.error || res.status)
  process.exit(1)
}
console.log(`smoke: wrote ${out}`)
