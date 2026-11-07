import { existsSync, readdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Workaround for a SmartSpectra SDK 3.4.0 bug on Windows.
 *
 * The first SDK session on a machine provisions an encrypted device key at
 * `%LOCALAPPDATA%\Presage\Physiology\<bundle>\emd\device_keys.secure`. In every
 * later *process* the SDK fails to decrypt it
 * (`NCryptDecrypt(size) failed: Invalid flags specified`), then refuses to
 * start (`SmartSpectra configuration failed`, code 3). Sessions within the
 * process that created the key are unaffected.
 *
 * Deleting the file before the first session of each process makes the SDK
 * provision a fresh key. Nothing of the user's is lost: the file is the SDK's
 * own device-identity cache and is recreated immediately.
 *
 * Set PULSECANVAS_KEEP_DEVICE_KEY=1 to disable (e.g. once Presage ships a fix).
 */
export function deviceKeyFiles(localAppData: string): string[] {
  const root = join(localAppData, 'Presage', 'Physiology')
  if (!existsSync(root)) return []
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const f = join(root, entry.name, 'emd', 'device_keys.secure')
    if (existsSync(f)) files.push(f)
  }
  return files
}

export function resetStaleDeviceKeys(opts: {
  platform?: NodeJS.Platform
  localAppData?: string
  env?: NodeJS.ProcessEnv
  log?: (msg: string) => void
} = {}): string[] {
  const platform = opts.platform ?? process.platform
  const env = opts.env ?? process.env
  if (platform !== 'win32' || env.PULSECANVAS_KEEP_DEVICE_KEY === '1') return []
  const base = opts.localAppData ?? env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  const removed: string[] = []
  for (const f of deviceKeyFiles(base)) {
    try {
      rmSync(f, { force: true })
      removed.push(f)
      opts.log?.(`reset SmartSpectra device key (SDK 3.4.0 Windows workaround): ${f}`)
    } catch (err) {
      opts.log?.(`could not reset SmartSpectra device key ${f}: ${String(err)}`)
    }
  }
  return removed
}
