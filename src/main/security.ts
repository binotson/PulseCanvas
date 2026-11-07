import { app, protocol, session, shell, type Session, type WebContents } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { isAllowedExternalUrl } from '@shared/api'
import { DEVELOPMENT_CSP, PRODUCTION_CSP } from '@shared/csp'

/** Custom scheme the packaged renderer is served from. */
export const APP_SCHEME = 'app'
export const APP_HOST = 'pulsecanvas'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

export function devServerUrl(): string | null {
  return !app.isPackaged && process.env.ELECTRON_RENDERER_URL ? process.env.ELECTRON_RENDERER_URL : null
}

export function trustedOrigin(): string {
  const dev = devServerUrl()
  return dev ? new URL(dev).origin : APP_ORIGIN
}

export function isTrustedUrl(url: string | undefined | null): boolean {
  if (!url) return false
  try {
    return new URL(url).origin === trustedOrigin()
  } catch {
    return false
  }
}

/** Must be called before `app.whenReady()`. */
export function registerPrivilegedScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      // `secure` makes app:// a secure context (required for getUserMedia).
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm'
}

/** Serve the built renderer from app://pulsecanvas/ with a strict CSP header. */
export function registerAppProtocol(rendererDir: string): void {
  const root = normalize(rendererDir)
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.host !== APP_HOST) return new Response('Not found', { status: 404 })
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === '/' || pathname === '') pathname = '/index.html'
    const full = normalize(join(root, pathname))
    if (!full.startsWith(root + sep)) return new Response('Forbidden', { status: 403 })
    try {
      const body = await readFile(full)
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': MIME[extname(full).toLowerCase()] ?? 'application/octet-stream',
          'content-security-policy': PRODUCTION_CSP,
          'x-content-type-options': 'nosniff',
          'cross-origin-opener-policy': 'same-origin',
          'referrer-policy': 'no-referrer'
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

/**
 * Camera permission: grant `media` (video only) to our own origin, deny
 * every other permission and every other origin.
 */
export function hardenSession(ses: Session = session.defaultSession): void {
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const requestingUrl = (details as { requestingUrl?: string }).requestingUrl ?? wc.getURL()
    if (permission !== 'media' || !isTrustedUrl(requestingUrl)) return callback(false)
    const types = (details as { mediaTypes?: string[] }).mediaTypes ?? []
    // Video only — PulseCanvas never asks for the microphone.
    callback(types.length > 0 && types.every((t) => t === 'video'))
  })

  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    return permission === 'media' && isTrustedUrl(requestingOrigin)
  })

  ses.setDevicePermissionHandler(() => false)

  // Dev server responses get the (relaxed) dev CSP as a header. Packaged
  // builds get the strict CSP from the app:// handler and the <meta> tag.
  if (devServerUrl()) {
    ses.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders }
      if (isTrustedUrl(details.url)) headers['Content-Security-Policy'] = [DEVELOPMENT_CSP]
      callback({ responseHeaders: headers })
    })
  }
}

/** Lock down every WebContents: no navigation, no popups, no <webview>. */
export function hardenWebContents(contents: WebContents): void {
  contents.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault()
  })
  contents.on('will-redirect', (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
}

/** Reject IPC from anything other than our own top-level page. */
export function isTrustedSender(frame: { url: string } | null | undefined): boolean {
  return !!frame && isTrustedUrl(frame.url)
}
