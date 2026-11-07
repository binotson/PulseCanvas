import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetStaleDeviceKeys } from '../src/main/deviceKeyReset'

let base: string
let keyFile: string
let otherFile: string

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'pulsecanvas-devkey-'))
  const emd = join(base, 'Presage', 'Physiology', 'com_presagetech_smartspectra_emd', 'emd')
  mkdirSync(emd, { recursive: true })
  keyFile = join(emd, 'device_keys.secure')
  otherFile = join(emd, 'model.bin')
  writeFileSync(keyFile, 'x')
  writeFileSync(otherFile, 'y')
})
afterEach(() => rmSync(base, { recursive: true, force: true }))

describe('resetStaleDeviceKeys', () => {
  it('removes only device_keys.secure on Windows', () => {
    const removed = resetStaleDeviceKeys({ platform: 'win32', localAppData: base, env: {} })
    expect(removed).toEqual([keyFile])
    expect(existsSync(keyFile)).toBe(false)
    expect(existsSync(otherFile)).toBe(true)
  })

  it('does nothing on other platforms', () => {
    expect(resetStaleDeviceKeys({ platform: 'darwin', localAppData: base, env: {} })).toEqual([])
    expect(existsSync(keyFile)).toBe(true)
  })

  it('can be disabled with PULSECANVAS_KEEP_DEVICE_KEY=1', () => {
    const env = { PULSECANVAS_KEEP_DEVICE_KEY: '1' }
    expect(resetStaleDeviceKeys({ platform: 'win32', localAppData: base, env })).toEqual([])
    expect(existsSync(keyFile)).toBe(true)
  })

  it('tolerates a missing Presage directory', () => {
    const empty = mkdtempSync(join(tmpdir(), 'pulsecanvas-devkey-empty-'))
    expect(resetStaleDeviceKeys({ platform: 'win32', localAppData: empty, env: {} })).toEqual([])
    rmSync(empty, { recursive: true, force: true })
  })
})
