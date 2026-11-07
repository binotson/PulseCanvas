import type { ArtMode, Settings } from './settings'
import type { ProcessingStatusName } from './sdkCodes'
import type { VitalsUpdate } from './vitals'

/** IPC channel names. The preload bridge only ever uses these. */
export const IPC = {
  sdkInfo: 'pc:sdk:info',
  sdkStart: 'pc:sdk:start',
  sdkStop: 'pc:sdk:stop',
  sdkEvent: 'pc:sdk:event',
  framePort: 'pc:sdk:frame-port',
  settingsGet: 'pc:settings:get',
  settingsUpdate: 'pc:settings:update',
  apiKeyStatus: 'pc:apikey:status',
  apiKeySet: 'pc:apikey:set',
  apiKeyClear: 'pc:apikey:clear',
  galleryList: 'pc:gallery:list',
  galleryRead: 'pc:gallery:read',
  gallerySave: 'pc:gallery:save',
  galleryDelete: 'pc:gallery:delete',
  galleryExport: 'pc:gallery:export',
  historyList: 'pc:history:list',
  historyAppend: 'pc:history:append',
  historyClear: 'pc:history:clear',
  privacyReport: 'pc:privacy:report',
  privacyWipe: 'pc:privacy:wipe',
  openExternal: 'pc:app:open-external'
} as const

export type ApiKeySource = 'environment' | 'stored' | 'none'

export interface ApiKeyStatus {
  configured: boolean
  source: ApiKeySource
  /** Whether OS-level encryption (safeStorage) is available for storing a key. */
  canStoreSecurely: boolean
}

export interface SdkInfo {
  /** The native SDK loaded successfully in the main process. */
  available: boolean
  version: string | null
  loadError: string | null
  platform: string
  apiKey: ApiKeyStatus
  status: ProcessingStatusName
}

export interface StartResult {
  ok: boolean
  error?: { code: number; name: string; message: string; retryable: boolean }
}

export type SdkEvent =
  | { type: 'status'; status: ProcessingStatusName }
  | { type: 'validation'; code: number; hint: string }
  | { type: 'vitals'; update: VitalsUpdate }
  | { type: 'error'; code: number; name: string; message: string; retryable: boolean }
  | { type: 'frames'; accepted: number; dropped: number }

export interface GalleryItem {
  id: string
  createdAt: string
  mode: ArtMode
  title: string
  width: number
  height: number
  /** Optional caption, only if the user enabled vitals in exports. */
  caption: string | null
  bytes: number
}

export interface SaveArtworkRequest {
  dataUrl: string
  mode: ArtMode
  title: string
  caption: string | null
}

export interface SessionSummary {
  id: string
  startedAt: string
  endedAt: string
  durationSec: number
  mode: ArtMode
  pulse: { avg: number; min: number; max: number; samples: number } | null
  breathing: { avg: number; min: number; max: number; samples: number } | null
  hrv: { lastRmssd: number; lastSdnn: number; confidence: number } | null
  /** Fraction (0–1) of the session in which the SDK reported kOk validation. */
  validationOkRatio: number
}

export interface StorageReport {
  userDataPath: string
  galleryCount: number
  galleryBytes: number
  historyCount: number
  hasStoredApiKey: boolean
  sdkCachePath: string
  sdkCacheExists: boolean
}

export interface WipeOptions {
  gallery: boolean
  history: boolean
  settings: boolean
  apiKey: boolean
  sdkCache: boolean
}

export interface AppVersions {
  app: string
  electron: string
  chrome: string
  node: string
}

/** The object exposed on `window.pulse` by the preload script. */
export interface PulseApi {
  versions: AppVersions
  sdk: {
    info(): Promise<SdkInfo>
    start(): Promise<StartResult>
    stop(): Promise<void>
    /** Send one RGBA camera frame to the main process (fire-and-forget). */
    sendFrame(buffer: ArrayBuffer, width: number, height: number, timestampUs: number): void
    onEvent(listener: (e: SdkEvent) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    update(patch: Partial<Settings>): Promise<Settings>
  }
  apiKey: {
    status(): Promise<ApiKeyStatus>
    set(key: string): Promise<ApiKeyStatus>
    clear(): Promise<ApiKeyStatus>
  }
  gallery: {
    list(): Promise<GalleryItem[]>
    read(id: string): Promise<string | null>
    save(req: SaveArtworkRequest): Promise<GalleryItem>
    remove(id: string): Promise<void>
    exportPng(id: string): Promise<{ saved: boolean; path?: string }>
  }
  history: {
    list(): Promise<SessionSummary[]>
    append(summary: SessionSummary): Promise<void>
    clear(): Promise<void>
  }
  privacy: {
    report(): Promise<StorageReport>
    wipe(opts: WipeOptions): Promise<StorageReport>
  }
  openExternal(url: string): Promise<boolean>
}

/** External links the renderer may open in the system browser. */
export const EXTERNAL_LINK_ALLOWLIST = [
  'https://smartspectra.presagetech.com/',
  'https://physiology.presagetech.com/',
  'https://github.com/Presage-Security/SmartSpectra',
  'https://github.com/binotson/PulseCanvas',
  'https://vandv.presagetech.com/'
] as const

export function isAllowedExternalUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 2048) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  return EXTERNAL_LINK_ALLOWLIST.some((prefix) => parsed.href.startsWith(prefix))
}
