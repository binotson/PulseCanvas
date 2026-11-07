import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Type-only import: erased at compile time, so the native SDK is only loaded
// by the guarded require() below.
import type * as SmartSpectra from '@smartspectra/node-sdk'

export type SdkModule = typeof SmartSpectra

let cached: { mod: SdkModule | null; error: string | null } | null = null

/**
 * In packaged builds electron-builder copies the platform runtime
 * (`@smartspectra/node-sdk-win32-x64/`) to `resources/smartspectra/`
 * (see electron-builder.yml), and the SDK's resolver honours
 * `SMARTSPECTRA_CAPI_PATH` (js/resolve-native.js).
 */
function configurePackagedRuntimePath(): void {
  if (!app.isPackaged || process.env.SMARTSPECTRA_CAPI_PATH) return
  const lib =
    process.platform === 'win32'
      ? 'smartspectra_capi.dll'
      : process.platform === 'darwin'
        ? 'libsmartspectra_capi.dylib'
        : 'libsmartspectra_capi.so'
  const candidate = join(process.resourcesPath, 'smartspectra', lib)
  if (existsSync(candidate)) process.env.SMARTSPECTRA_CAPI_PATH = candidate
}

/** Load the native SDK once. Never throws; returns the load error instead. */
export function loadSdk(): { mod: SdkModule | null; error: string | null } {
  if (cached) return cached
  try {
    configurePackagedRuntimePath()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@smartspectra/node-sdk') as SdkModule
    cached = { mod, error: null }
  } catch (err) {
    cached = { mod: null, error: err instanceof Error ? err.message : String(err) }
  }
  return cached
}
