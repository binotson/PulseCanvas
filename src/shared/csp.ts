/**
 * Content-Security-Policy for the packaged renderer (served from app://).
 *
 * - No remote origins at all: the renderer never talks to the network.
 *   (The SmartSpectra SDK's own network traffic happens in the main process.)
 * - `blob:` for workers/media is what the SmartSpectra docs require for
 *   Electron renderers that process camera frames.
 * - `data:` images are needed for canvas.toDataURL() previews.
 */
export const PRODUCTION_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'"
].join('; ')

/** Development CSP: Vite's dev server needs inline HMR scripts + websocket. */
export const DEVELOPMENT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "connect-src 'self' ws://localhost:* http://localhost:*",
  "worker-src 'self' blob:",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'"
].join('; ')
