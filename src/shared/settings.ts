export type ArtMode = 'pulse-waves' | 'breathing-garden' | 'living-particles'

export const ART_MODES: readonly ArtMode[] = ['pulse-waves', 'breathing-garden', 'living-particles'] as const

export type CaptureResolution = '720p' | '480p'

export interface Settings {
  /** User accepted the camera/data consent screen. ISO timestamp, or null. */
  consentAcceptedAt: string | null
  onboardingComplete: boolean
  /**
   * Forwarded to SmartSpectraSDK `enableTelemetry`. The SDK default is true;
   * PulseCanvas defaults to false (opt-in).
   */
  telemetryEnabled: boolean
  /** Persist session summaries (no raw signals) on this device. */
  saveSessionHistory: boolean
  /** Write numeric vitals into the corner of exported artworks. */
  includeVitalsInExports: boolean
  captureResolution: CaptureResolution
  showCameraPreview: boolean
  mirrorPreview: boolean
  reducedMotion: boolean
  defaultArtMode: ArtMode
}

export const DEFAULT_SETTINGS: Settings = {
  consentAcceptedAt: null,
  onboardingComplete: false,
  telemetryEnabled: false,
  saveSessionHistory: false,
  includeVitalsInExports: false,
  captureResolution: '720p',
  showCameraPreview: true,
  mirrorPreview: true,
  reducedMotion: false,
  defaultArtMode: 'pulse-waves'
}

/** Validate an untrusted partial settings object; unknown keys and bad types are dropped. */
export function sanitizeSettingsPatch(raw: unknown): Partial<Settings> {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: Partial<Settings> = {}
  const bools = [
    'onboardingComplete',
    'telemetryEnabled',
    'saveSessionHistory',
    'includeVitalsInExports',
    'showCameraPreview',
    'mirrorPreview',
    'reducedMotion'
  ] as const
  for (const k of bools) if (typeof r[k] === 'boolean') out[k] = r[k] as boolean
  if (r.consentAcceptedAt === null) out.consentAcceptedAt = null
  else if (typeof r.consentAcceptedAt === 'string' && !Number.isNaN(Date.parse(r.consentAcceptedAt)))
    out.consentAcceptedAt = new Date(r.consentAcceptedAt).toISOString()
  if (r.captureResolution === '720p' || r.captureResolution === '480p') out.captureResolution = r.captureResolution
  if (typeof r.defaultArtMode === 'string' && (ART_MODES as readonly string[]).includes(r.defaultArtMode))
    out.defaultArtMode = r.defaultArtMode as ArtMode
  return out
}

export function mergeSettings(base: Settings, patch: unknown): Settings {
  return { ...base, ...sanitizeSettingsPatch(patch) }
}
