import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type IpcMainInvokeEvent } from 'electron'
import { copyFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { IPC, isAllowedExternalUrl, type SdkEvent, type SdkInfo, type StorageReport, type WipeOptions } from '@shared/api'
import { apiKeyStatus, clearStoredApiKey, hasStoredApiKey, resolveApiKey, storeApiKey } from './apiKey'
import { resetStaleDeviceKeys } from './deviceKeyReset'
import { loadSdk } from './sdkLoader'
import {
  APP_ORIGIN,
  devServerUrl,
  hardenSession,
  hardenWebContents,
  isTrustedSender,
  registerAppProtocol,
  registerPrivilegedScheme
} from './security'
import * as store from './storage'
import { VitalsService, type SdkInstance } from './vitalsService'

registerPrivilegedScheme()

// Development/testing only: isolate user data (e.g. for smoke tests).
if (!app.isPackaged && process.env.PULSECANVAS_USER_DATA_DIR) {
  app.setPath('userData', process.env.PULSECANVAS_USER_DATA_DIR)
}

// Single instance: two processes must not both drive the camera/SDK.
if (!app.requestSingleInstanceLock()) app.quit()

let mainWindow: BrowserWindow | null = null

function emit(event: SdkEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.sdkEvent, event)
}

const vitals = new VitalsService({
  createSdk: ({ apiKey, enableTelemetry }) => {
    const { mod, error } = loadSdk()
    if (!mod) throw new Error(`SmartSpectra SDK failed to load: ${error}`)
    return new mod.SmartSpectraSDK({
      apiKey,
      requestedMetrics: [...mod.breathingMetrics, ...mod.cardioMetrics],
      enableTelemetry,
      logLevel: mod.SmartSpectraLogLevel.kWarning
    }) as unknown as SdkInstance
  },
  decodeMetrics: (buf) => {
    const { mod } = loadSdk()
    if (!mod) throw new Error('SDK not loaded')
    return mod.decodeMetrics(buf) as never
  },
  resolveApiKey,
  telemetryEnabled: () => store.getSettings().telemetryEnabled,
  emit,
  log: (level, msg) => console[level](`[pulsecanvas/sdk] ${msg}`)
})

/** SmartSpectra's default device-key cache dir (js/ffi.js defaultSdkDirectory). */
function sdkCacheDir(): string {
  const base =
    process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Caches')
      : process.platform === 'win32'
        ? process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
        : process.env.XDG_CACHE_HOME || join(homedir(), '.cache')
  return join(base, 'SmartSpectraSDK')
}

function sdkInfo(): SdkInfo {
  const { mod, error } = loadSdk()
  return {
    available: !!mod,
    version: mod ? mod.SmartSpectraSDK.version : null,
    loadError: error,
    platform: `${process.platform}-${process.arch}`,
    apiKey: apiKeyStatus(),
    status: vitals.currentStatus
  }
}

function storageReport(): StorageReport {
  const g = store.galleryStats()
  return {
    userDataPath: app.getPath('userData'),
    galleryCount: g.count,
    galleryBytes: g.bytes,
    historyCount: store.listHistory().length,
    hasStoredApiKey: hasStoredApiKey(),
    sdkCachePath: sdkCacheDir(),
    sdkCacheExists: existsSync(sdkCacheDir())
  }
}

/** Register an invoke handler that rejects untrusted senders. */
function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isTrustedSender(event.senderFrame)) throw new Error('Untrusted IPC sender')
    return fn(...(args as A))
  })
}

function registerIpc(): void {
  handle(IPC.sdkInfo, () => sdkInfo())
  handle(IPC.sdkStart, () => vitals.start())
  handle(IPC.sdkStop, () => vitals.stop())

  // Frames arrive over a dedicated MessagePort (created by the preload) to
  // keep high-rate binary traffic off the invoke channels.
  ipcMain.on(IPC.framePort, (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || !isTrustedSender(event.senderFrame)) return
    const port = event.ports[0]
    if (!port) return
    port.on('message', (msg) => vitals.pushFrame(msg.data))
    port.start()
  })

  handle(IPC.settingsGet, () => store.getSettings())
  handle(IPC.settingsUpdate, (patch: unknown) => store.updateSettings(patch))

  handle(IPC.apiKeyStatus, () => apiKeyStatus())
  handle(IPC.apiKeySet, (key: unknown) => storeApiKey(key))
  handle(IPC.apiKeyClear, () => clearStoredApiKey())

  handle(IPC.galleryList, () => store.listArtworks())
  handle(IPC.galleryRead, (id: unknown) => store.readArtworkDataUrl(id))
  handle(IPC.gallerySave, (req: unknown) => store.saveArtwork(req as never))
  handle(IPC.galleryDelete, (id: unknown) => store.deleteArtwork(id))
  handle(IPC.galleryExport, async (id: unknown) => {
    const src = store.artworkPath(id)
    if (!src || !mainWindow) return { saved: false }
    const item = store.listArtworks().find((a) => a.id === id)
    const safeTitle = (item?.title ?? 'artwork').replace(/[^\w\- ]+/g, '').trim() || 'artwork'
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Export artwork as PNG',
      defaultPath: join(app.getPath('pictures'), `PulseCanvas - ${safeTitle}.png`),
      filters: [{ name: 'PNG image', extensions: ['png'] }]
    })
    if (res.canceled || !res.filePath) return { saved: false }
    await copyFile(src, res.filePath)
    return { saved: true, path: res.filePath }
  })

  handle(IPC.historyList, () => store.listHistory())
  handle(IPC.historyAppend, (s: unknown) => store.appendHistory(s))
  handle(IPC.historyClear, () => store.clearHistory())

  handle(IPC.privacyReport, () => storageReport())
  handle(IPC.privacyWipe, async (raw: unknown) => {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<WipeOptions>
    if (o.sdkCache || o.apiKey) await vitals.stop()
    if (o.gallery) store.wipeGallery()
    if (o.history) store.clearHistory()
    if (o.settings) store.resetSettings()
    if (o.apiKey) clearStoredApiKey()
    if (o.sdkCache) await rm(sdkCacheDir(), { recursive: true, force: true })
    return storageReport()
  })

  handle(IPC.openExternal, async (url: unknown) => {
    if (!isAllowedExternalUrl(url)) return false
    await shell.openExternal(url)
    return true
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#100D20',
    title: 'PulseCanvas',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
    void vitals.stop()
  })
  // A renderer reload drops its camera pump; make sure the SDK session goes too.
  mainWindow.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) void vitals.stop()
  })
  mainWindow.webContents.on('render-process-gone', () => void vitals.stop())

  // Development/testing only: capture a screenshot and quit (scripts/smoke.cjs).
  const shot = !app.isPackaged ? process.env.PULSECANVAS_SMOKE_SCREENSHOT : undefined
  if (shot) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await mainWindow?.webContents.capturePage()
        if (img) await writeFile(shot, img.toPNG())
        app.quit()
      }, Number(process.env.PULSECANVAS_SMOKE_DELAY_MS || 4000))
    })
  }

  const hash = !app.isPackaged && process.env.PULSECANVAS_SMOKE_ROUTE ? `#/${process.env.PULSECANVAS_SMOKE_ROUTE}` : ''
  const dev = devServerUrl()
  if (dev) void mainWindow.loadURL(dev + hash)
  else void mainWindow.loadURL(`${APP_ORIGIN}/index.html${hash}`)
}

app.on('web-contents-created', (_e, contents) => hardenWebContents(contents))

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  if (app.isPackaged) Menu.setApplicationMenu(null)
  // Before any SDK session in this process; see deviceKeyReset.ts.
  resetStaleDeviceKeys({ log: (msg) => console.warn(`[pulsecanvas/sdk] ${msg}`) })
  registerAppProtocol(join(__dirname, '../renderer'))
  hardenSession()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

let quitting = false
app.on('before-quit', (event) => {
  if (quitting || !vitals.isActive) return
  // Give the native SDK a chance to drain and release before exit.
  event.preventDefault()
  quitting = true
  const timeout = new Promise<void>((r) => setTimeout(r, 5000))
  void Promise.race([vitals.dispose(), timeout]).finally(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
