/// <reference lib="dom" />
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type PulseApi, type SdkEvent } from '../shared/api'
import pkg from '../../package.json'

/**
 * The only surface the renderer gets. No Node, no raw ipcRenderer, no
 * credentials: every call maps to one fixed channel validated in main.
 */

let framePort: MessagePort | null = null

function ensureFramePort(): MessagePort {
  if (framePort) return framePort
  const channel = new MessageChannel()
  framePort = channel.port1
  ipcRenderer.postMessage(IPC.framePort, null, [channel.port2])
  framePort.start()
  return framePort
}

const api: PulseApi = {
  versions: {
    app: pkg.version,
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? ''
  },
  sdk: {
    info: () => ipcRenderer.invoke(IPC.sdkInfo),
    start: () => ipcRenderer.invoke(IPC.sdkStart),
    stop: () => ipcRenderer.invoke(IPC.sdkStop),
    sendFrame(buffer, width, height, timestampUs) {
      // Structured clone (not transfer): Electron's MessagePortMain drops
      // messages whose transfer list contains ArrayBuffers.
      ensureFramePort().postMessage({ buffer, width, height, timestampUs })
    },
    onEvent(listener) {
      const wrapped = (_e: IpcRendererEvent, ev: SdkEvent): void => listener(ev)
      ipcRenderer.on(IPC.sdkEvent, wrapped)
      return () => {
        ipcRenderer.removeListener(IPC.sdkEvent, wrapped)
      }
    }
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch)
  },
  apiKey: {
    status: () => ipcRenderer.invoke(IPC.apiKeyStatus),
    set: (key) => ipcRenderer.invoke(IPC.apiKeySet, key),
    clear: () => ipcRenderer.invoke(IPC.apiKeyClear)
  },
  gallery: {
    list: () => ipcRenderer.invoke(IPC.galleryList),
    read: (id) => ipcRenderer.invoke(IPC.galleryRead, id),
    save: (req) => ipcRenderer.invoke(IPC.gallerySave, req),
    remove: (id) => ipcRenderer.invoke(IPC.galleryDelete, id),
    exportPng: (id) => ipcRenderer.invoke(IPC.galleryExport, id)
  },
  history: {
    list: () => ipcRenderer.invoke(IPC.historyList),
    append: (s) => ipcRenderer.invoke(IPC.historyAppend, s),
    clear: () => ipcRenderer.invoke(IPC.historyClear)
  },
  privacy: {
    report: () => ipcRenderer.invoke(IPC.privacyReport),
    wipe: (opts) => ipcRenderer.invoke(IPC.privacyWipe, opts)
  },
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url)
}

contextBridge.exposeInMainWorld('pulse', api)
