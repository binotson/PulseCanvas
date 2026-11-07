import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'pulsecanvas-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => dir, isPackaged: false, getAppPath: () => dir },
  safeStorage: { isEncryptionAvailable: () => false }
}))

const store = await import('../src/main/storage')
const { parseDotEnv } = await import('../src/main/apiKey')
const { isAllowedExternalUrl } = await import('@shared/api')
const { sanitizeSettingsPatch, DEFAULT_SETTINGS } = await import('@shared/settings')

// 1×1 transparent PNG
const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('gallery storage', () => {
  beforeEach(() => store.wipeGallery())

  it('saves, lists, reads and deletes artworks', () => {
    const item = store.saveArtwork({ dataUrl: PNG_1x1, mode: 'breathing-garden', title: '  My\u0000 garden ', caption: null })
    expect(item).toMatchObject({ mode: 'breathing-garden', title: 'My  garden', width: 1, height: 1, caption: null })
    expect(store.listArtworks().map((a) => a.id)).toEqual([item.id])
    expect(store.readArtworkDataUrl(item.id)).toBe(PNG_1x1)
    expect(store.galleryStats().count).toBe(1)
    store.deleteArtwork(item.id)
    expect(store.listArtworks()).toEqual([])
  })

  it('rejects non-PNG payloads and path-traversal ids', () => {
    expect(() => store.decodePngDataUrl('data:image/jpeg;base64,AAAA')).toThrow()
    expect(() => store.decodePngDataUrl('data:image/png;base64,' + Buffer.from('not a png at all, really').toString('base64'))).toThrow()
    expect(store.artworkPath('../../secrets')).toBeNull()
    expect(store.readArtworkDataUrl('..\\..\\x')).toBeNull()
  })

  it('falls back to a valid art mode', () => {
    const item = store.saveArtwork({ dataUrl: PNG_1x1, mode: 'evil' as never, title: '', caption: null })
    expect(item.mode).toBe('pulse-waves')
    expect(item.title).toBe('Untitled')
  })
})

describe('session history', () => {
  const summary = {
    id: '00000000-0000-4000-8000-000000000000',
    startedAt: '2026-11-07T10:00:00.000Z',
    endedAt: '2026-11-07T10:05:00.000Z',
    durationSec: 300,
    mode: 'pulse-waves',
    pulse: { avg: 70, min: 65, max: 75, samples: 40 },
    breathing: null,
    hrv: null,
    validationOkRatio: 0.9
  }

  it('is not written unless the user opted in', () => {
    store.updateSettings({ saveSessionHistory: false })
    store.appendHistory(summary)
    expect(store.listHistory()).toEqual([])
  })

  it('stores sanitised summaries when enabled, and clears when disabled', () => {
    store.updateSettings({ saveSessionHistory: true })
    store.appendHistory({ ...summary, validationOkRatio: 7, extra: 'dropped' })
    const [h] = store.listHistory()
    expect(h.validationOkRatio).toBe(1)
    expect(h).not.toHaveProperty('extra')
    store.updateSettings({ saveSessionHistory: false })
    expect(store.listHistory()).toEqual([])
  })

  it('rejects malformed summaries', () => {
    expect(store.sanitizeSummary({ startedAt: 'yesterday' })).toBeNull()
  })
})

describe('settings', () => {
  it('drops unknown keys and wrong types', () => {
    expect(
      sanitizeSettingsPatch({ telemetryEnabled: 'yes', reducedMotion: true, defaultArtMode: 'x', captureResolution: '480p', hack: 1 })
    ).toEqual({ reducedMotion: true, captureResolution: '480p' })
  })
  it('defaults are privacy-preserving', () => {
    expect(DEFAULT_SETTINGS.telemetryEnabled).toBe(false)
    expect(DEFAULT_SETTINGS.saveSessionHistory).toBe(false)
    expect(DEFAULT_SETTINGS.includeVitalsInExports).toBe(false)
    expect(DEFAULT_SETTINGS.consentAcceptedAt).toBeNull()
  })
})

describe('config helpers', () => {
  it('parses .env files', () => {
    expect(parseDotEnv('# c\nSMARTSPECTRA_API_KEY="abc123"\n\nOTHER = x \nbad')).toEqual({ SMARTSPECTRA_API_KEY: 'abc123', OTHER: 'x' })
  })
  it('allow-lists external links', () => {
    expect(isAllowedExternalUrl('https://smartspectra.presagetech.com/docs/')).toBe(true)
    expect(isAllowedExternalUrl('http://smartspectra.presagetech.com/')).toBe(false)
    expect(isAllowedExternalUrl('https://smartspectra.presagetech.com.evil.example/')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
  })
})
