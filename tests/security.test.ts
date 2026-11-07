import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: true },
  protocol: {},
  session: {},
  shell: {}
}))

const sec = await import('../src/main/security')

afterEach(() => {
  delete process.env.ELECTRON_RENDERER_URL
})

describe('isTrustedUrl', () => {
  // Regression: WHATWG URL.origin is "null" for custom schemes like app://,
  // which previously made every IPC call from the packaged UI "untrusted".
  it('trusts the packaged app:// origin', () => {
    expect(sec.isTrustedUrl('app://pulsecanvas/index.html')).toBe(true)
    expect(sec.isTrustedUrl('app://pulsecanvas/index.html#/settings')).toBe(true)
  })

  it('rejects other hosts, schemes and garbage', () => {
    expect(sec.isTrustedUrl('app://evil/index.html')).toBe(false)
    expect(sec.isTrustedUrl('https://pulsecanvas/index.html')).toBe(false)
    expect(sec.isTrustedUrl('file:///C:/index.html')).toBe(false)
    expect(sec.isTrustedUrl('not a url')).toBe(false)
    expect(sec.isTrustedUrl(undefined)).toBe(false)
  })

  it('ignores the dev-server URL in packaged builds', () => {
    process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
    expect(sec.isTrustedUrl('http://localhost:5173/')).toBe(false)
  })

  it('isTrustedSender requires a frame', () => {
    expect(sec.isTrustedSender(null)).toBe(false)
    expect(sec.isTrustedSender({ url: 'app://pulsecanvas/' })).toBe(true)
  })
})
