import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { GalleryItem, SaveArtworkRequest, SessionSummary } from '@shared/api'
import { ART_MODES, DEFAULT_SETTINGS, mergeSettings, type ArtMode, type Settings } from '@shared/settings'

/**
 * Local-only persistence in Electron's userData directory
 * (Windows: %APPDATA%\PulseCanvas). Nothing here is ever uploaded.
 */

const ID_RE = /^[a-f0-9-]{36}$/
const MAX_PNG_BYTES = 40 * 1024 * 1024
const MAX_HISTORY = 200
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export function userDir(): string {
  return app.getPath('userData')
}
export function galleryDir(): string {
  return join(userDir(), 'gallery')
}
function settingsPath(): string {
  return join(userDir(), 'settings.json')
}
function historyPath(): string {
  return join(userDir(), 'sessions.json')
}

function atomicWrite(path: string, data: string | Buffer): void {
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, path)
}

function readJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

// ---------------------------------------------------------------- settings

let settingsCache: Settings | null = null

export function getSettings(): Settings {
  if (!settingsCache) settingsCache = mergeSettings(DEFAULT_SETTINGS, readJson<unknown>(settingsPath(), {}))
  return settingsCache
}

export function updateSettings(patch: unknown): Settings {
  const next = mergeSettings(getSettings(), patch)
  mkdirSync(userDir(), { recursive: true })
  atomicWrite(settingsPath(), JSON.stringify(next, null, 2))
  settingsCache = next
  if (!next.saveSessionHistory) clearHistory()
  return next
}

export function resetSettings(): void {
  rmSync(settingsPath(), { force: true })
  settingsCache = null
}

// ----------------------------------------------------------------- gallery

export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id)
}

export function decodePngDataUrl(dataUrl: unknown): Buffer {
  const prefix = 'data:image/png;base64,'
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)) throw new Error('Artwork must be a PNG data URL')
  if (dataUrl.length > Math.ceil((MAX_PNG_BYTES * 4) / 3) + prefix.length) throw new Error('Artwork is too large')
  const buf = Buffer.from(dataUrl.slice(prefix.length), 'base64')
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Artwork is not a valid PNG')
  return buf
}

/** Width/height from the PNG IHDR chunk. */
export function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

function sanitizeText(v: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : ''
}

export function saveArtwork(req: SaveArtworkRequest): GalleryItem {
  const png = decodePngDataUrl(req?.dataUrl)
  const mode: ArtMode = (ART_MODES as readonly string[]).includes(req?.mode) ? req.mode : 'pulse-waves'
  const { width, height } = pngSize(png)
  const id = randomUUID()
  const item: GalleryItem = {
    id,
    createdAt: new Date().toISOString(),
    mode,
    title: sanitizeText(req?.title, 80) || 'Untitled',
    width,
    height,
    caption: req?.caption ? sanitizeText(req.caption, 200) || null : null,
    bytes: png.length
  }
  mkdirSync(galleryDir(), { recursive: true })
  atomicWrite(join(galleryDir(), `${id}.png`), png)
  atomicWrite(join(galleryDir(), `${id}.json`), JSON.stringify(item, null, 2))
  return item
}

export function listArtworks(): GalleryItem[] {
  const dir = galleryDir()
  if (!existsSync(dir)) return []
  const items: GalleryItem[] = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    const id = f.slice(0, -5)
    if (!isValidId(id) || !existsSync(join(dir, `${id}.png`))) continue
    const meta = readJson<GalleryItem | null>(join(dir, f), null)
    if (meta && meta.id === id) items.push(meta)
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function artworkPath(id: unknown): string | null {
  if (!isValidId(id)) return null
  const p = join(galleryDir(), `${id}.png`)
  return existsSync(p) ? p : null
}

export function readArtworkDataUrl(id: unknown): string | null {
  const p = artworkPath(id)
  return p ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : null
}

export function deleteArtwork(id: unknown): void {
  if (!isValidId(id)) return
  rmSync(join(galleryDir(), `${id}.png`), { force: true })
  rmSync(join(galleryDir(), `${id}.json`), { force: true })
}

export function galleryStats(): { count: number; bytes: number } {
  const dir = galleryDir()
  if (!existsSync(dir)) return { count: 0, bytes: 0 }
  let count = 0
  let bytes = 0
  for (const f of readdirSync(dir)) {
    try {
      bytes += statSync(join(dir, f)).size
      if (f.endsWith('.png')) count++
    } catch {
      /* raced with delete */
    }
  }
  return { count, bytes }
}

export function wipeGallery(): void {
  rmSync(galleryDir(), { recursive: true, force: true })
}

// ----------------------------------------------------------------- history

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function stat(v: unknown): SessionSummary['pulse'] {
  if (!v || typeof v !== 'object') return null
  const s = v as Record<string, unknown>
  return { avg: num(s.avg), min: num(s.min), max: num(s.max), samples: Math.max(0, Math.round(num(s.samples))) }
}

export function sanitizeSummary(raw: unknown): SessionSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.startedAt !== 'string' || typeof r.endedAt !== 'string') return null
  if (Number.isNaN(Date.parse(r.startedAt)) || Number.isNaN(Date.parse(r.endedAt))) return null
  const hrv = r.hrv && typeof r.hrv === 'object' ? (r.hrv as Record<string, unknown>) : null
  return {
    id: isValidId(r.id) ? r.id : randomUUID(),
    startedAt: new Date(r.startedAt).toISOString(),
    endedAt: new Date(r.endedAt).toISOString(),
    durationSec: Math.max(0, Math.round(num(r.durationSec))),
    mode: (ART_MODES as readonly string[]).includes(r.mode as string) ? (r.mode as ArtMode) : 'pulse-waves',
    pulse: stat(r.pulse),
    breathing: stat(r.breathing),
    hrv: hrv ? { lastRmssd: num(hrv.lastRmssd), lastSdnn: num(hrv.lastSdnn), confidence: num(hrv.confidence) } : null,
    validationOkRatio: Math.max(0, Math.min(1, num(r.validationOkRatio)))
  }
}

export function listHistory(): SessionSummary[] {
  const arr = readJson<unknown[]>(historyPath(), [])
  return Array.isArray(arr) ? (arr.map(sanitizeSummary).filter(Boolean) as SessionSummary[]) : []
}

export function appendHistory(raw: unknown): void {
  if (!getSettings().saveSessionHistory) return
  const s = sanitizeSummary(raw)
  if (!s) throw new Error('Invalid session summary')
  const next = [s, ...listHistory().filter((h) => h.id !== s.id)].slice(0, MAX_HISTORY)
  mkdirSync(userDir(), { recursive: true })
  atomicWrite(historyPath(), JSON.stringify(next, null, 2))
}

export function clearHistory(): void {
  rmSync(historyPath(), { force: true })
}
