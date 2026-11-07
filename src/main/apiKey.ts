import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ApiKeyStatus } from '@shared/api'

/**
 * API key resolution — main process only. The key is never sent to the
 * renderer; the renderer only ever sees `ApiKeyStatus`.
 *
 * Priority:
 *  1. `SMARTSPECTRA_API_KEY` from the process environment.
 *  2. `SMARTSPECTRA_API_KEY` from `.env` in the project root — development
 *     (unpackaged) builds only, read at runtime, never bundled.
 *  3. A key the user entered in Settings, encrypted with Electron
 *     `safeStorage` (DPAPI on Windows, Keychain on macOS, libsecret on Linux).
 */

const KEY_FILE = 'smartspectra-key.bin'
const MAX_KEY_LENGTH = 1024

function keyFilePath(): string {
  return join(app.getPath('userData'), KEY_FILE)
}

export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const k = line.slice(0, eq).trim()
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}

let dotEnvCache: Record<string, string> | null = null

function readDotEnv(): Record<string, string> {
  if (app.isPackaged) return {}
  if (dotEnvCache) return dotEnvCache
  try {
    const p = join(app.getAppPath(), '.env')
    dotEnvCache = existsSync(p) ? parseDotEnv(readFileSync(p, 'utf8')) : {}
  } catch {
    dotEnvCache = {}
  }
  return dotEnvCache
}

function envKey(): string | null {
  const v = process.env.SMARTSPECTRA_API_KEY?.trim() || readDotEnv().SMARTSPECTRA_API_KEY?.trim()
  return v ? v : null
}

function storedKey(): string | null {
  const p = keyFilePath()
  if (!existsSync(p) || !safeStorage.isEncryptionAvailable()) return null
  try {
    const v = safeStorage.decryptString(readFileSync(p)).trim()
    return v || null
  } catch {
    return null
  }
}

export function resolveApiKey(): string | null {
  return envKey() ?? storedKey()
}

export function apiKeyStatus(): ApiKeyStatus {
  const canStoreSecurely = safeStorage.isEncryptionAvailable()
  if (envKey()) return { configured: true, source: 'environment', canStoreSecurely }
  if (storedKey()) return { configured: true, source: 'stored', canStoreSecurely }
  return { configured: false, source: 'none', canStoreSecurely }
}

export function hasStoredApiKey(): boolean {
  return existsSync(keyFilePath())
}

export function storeApiKey(raw: unknown): ApiKeyStatus {
  if (typeof raw !== 'string') throw new TypeError('API key must be a string')
  const key = raw.trim()
  if (!key || key.length > MAX_KEY_LENGTH || /\s/.test(key)) throw new Error('That does not look like a valid API key.')
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'OS-level encryption is unavailable, so the key cannot be stored safely. Set SMARTSPECTRA_API_KEY in the environment instead.'
    )
  }
  writeFileSync(keyFilePath(), safeStorage.encryptString(key), { mode: 0o600 })
  return apiKeyStatus()
}

export function clearStoredApiKey(): ApiKeyStatus {
  rmSync(keyFilePath(), { force: true })
  return apiKeyStatus()
}
