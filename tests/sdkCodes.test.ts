/**
 * PulseCanvas duplicates a few SDK enums so the renderer never loads the
 * native package. This test loads the REAL native SDK and checks the copies
 * still match. It is skipped automatically if the native runtime cannot load
 * on the test machine.
 */
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { ErrorCode, ProcessingStatus, errorInfo, processingStatusName, validationInfo } from '@shared/sdkCodes'

const require = createRequire(import.meta.url)
let sdk: typeof import('@smartspectra/node-sdk') | null = null
try {
  sdk = require('@smartspectra/node-sdk')
} catch {
  sdk = null
}

describe.skipIf(!sdk)('enum values match the installed SmartSpectra SDK', () => {
  it('ProcessingStatus', () => {
    expect(ProcessingStatus).toEqual({ ...sdk!.ProcessingStatus })
  })
  it('SmartSpectraErrorCode', () => {
    expect(ErrorCode).toEqual({ ...sdk!.SmartSpectraErrorCode })
  })
  it('every ValidationCode has guidance text', () => {
    for (const code of Object.values(sdk!.ValidationCode)) {
      expect(validationInfo(code).title).not.toBe('Adjusting')
    }
  })
  it('cardio bundle includes pulse rate, pressure trace and HRV', () => {
    const { MetricType, cardioMetrics } = sdk!
    expect(cardioMetrics).toEqual(expect.arrayContaining([MetricType.PULSE_RATE, MetricType.ARTERIAL_PRESSURE_TRACE, MetricType.HRV]))
  })
})

describe('code helpers', () => {
  it('maps processing status codes', () => {
    expect(processingStatusName(3)).toBe('running')
    expect(processingStatusName(99)).toBe('uninitialized')
  })
  it('prefers SDK hint text over built-in guidance', () => {
    expect(validationInfo(5, '  Turn on a lamp ').guidance).toBe('Turn on a lamp')
    expect(validationInfo(5).guidance).toMatch(/light/i)
    expect(validationInfo(42).severity).toBe('info')
  })
  it('explains authentication and credit errors', () => {
    expect(errorInfo(2).advice).toMatch(/API key/)
    expect(errorInfo(4).name).toBe('kCreditExhausted')
    expect(errorInfo(77).name).toBe('code 77')
  })
})
