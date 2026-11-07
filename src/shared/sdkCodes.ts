/**
 * Human-readable mappings for SmartSpectra SDK enum values.
 * Integer values mirror @smartspectra/node-sdk 3.4.0 `js/index.d.ts`
 * (documented there as stable across SDK versions). Duplicated here so the
 * renderer never needs to load the native SDK package.
 */

export const ProcessingStatus = {
  kUninitialized: 0,
  kIdle: 1,
  kStarting: 2,
  kRunning: 3,
  kStopping: 4,
  kError: 5
} as const

export type ProcessingStatusName = 'uninitialized' | 'idle' | 'starting' | 'running' | 'stopping' | 'error'

export function processingStatusName(code: number): ProcessingStatusName {
  switch (code) {
    case 1:
      return 'idle'
    case 2:
      return 'starting'
    case 3:
      return 'running'
    case 4:
      return 'stopping'
    case 5:
      return 'error'
    default:
      return 'uninitialized'
  }
}

export type Severity = 'ok' | 'info' | 'warn'

export interface ValidationInfo {
  code: number
  title: string
  guidance: string
  severity: Severity
}

const VALIDATION: Record<number, Omit<ValidationInfo, 'code'>> = {
  0: { title: 'Signal locked', guidance: 'Hold still and breathe naturally.', severity: 'ok' },
  1: { title: 'No face found', guidance: 'Sit facing the camera with your whole face visible.', severity: 'warn' },
  2: { title: 'Multiple faces', guidance: 'Only one person should be in view.', severity: 'warn' },
  3: { title: 'Face not centred', guidance: 'Move so your face is in the middle of the frame.', severity: 'warn' },
  4: { title: 'Adjust distance', guidance: 'Move closer to or further from the camera.', severity: 'warn' },
  5: { title: 'Too dark', guidance: 'Add soft, even light in front of you.', severity: 'warn' },
  6: { title: 'Too bright', guidance: 'Reduce strong light or move away from the window.', severity: 'warn' },
  7: { title: 'Chest not visible', guidance: 'Sit back slightly so your shoulders and chest are in view.', severity: 'warn' },
  10: { title: 'Tuning camera', guidance: 'Hold still while the camera settles.', severity: 'info' },
  11: { title: 'Frame rate too low', guidance: 'Close other camera apps; the SDK needs roughly 25–30 fps.', severity: 'warn' },
  12: { title: 'Too much motion', guidance: 'Rest your arms and keep your head still.', severity: 'warn' },
  13: { title: 'Too close', guidance: 'Lean back a little from the camera.', severity: 'warn' },
  14: { title: 'Too far', guidance: 'Move a little closer to the camera.', severity: 'warn' },
  15: { title: 'Face too high', guidance: 'Lower the camera or move down slightly.', severity: 'warn' },
  16: { title: 'Face too low', guidance: 'Raise the camera or sit up slightly.', severity: 'warn' },
  17: { title: 'Look at the camera', guidance: 'Face the camera directly.', severity: 'warn' }
}

export function validationInfo(code: number, hint?: string): ValidationInfo {
  const known = VALIDATION[code]
  if (known) return { code, ...known, guidance: hint && hint.trim() ? hint.trim() : known.guidance }
  return {
    code,
    title: 'Adjusting',
    guidance: hint && hint.trim() ? hint.trim() : 'Hold still and face the camera.',
    severity: 'info'
  }
}

export const ErrorCode = {
  kOk: 0,
  kInvalidState: 1,
  kAuthenticationFailed: 2,
  kConfigurationFailed: 3,
  kCreditExhausted: 4,
  kNetworkError: 5,
  kServerError: 6,
  kInputUnavailable: 7,
  kProcessingFailed: 8,
  kFrameConversionFailed: 9,
  kNonMonotonicTimestamp: 10,
  kTimestampGap: 11
} as const

const ERROR_TEXT: Record<number, { name: string; advice: string }> = {
  0: { name: 'kOk', advice: '' },
  1: { name: 'kInvalidState', advice: 'The SDK was in the wrong state for that action. Stop and start the session again.' },
  2: {
    name: 'kAuthenticationFailed',
    advice: 'Your SmartSpectra API key was rejected. Check it in Settings → SmartSpectra API key.'
  },
  3: { name: 'kConfigurationFailed', advice: 'The SDK could not be configured. Restart PulseCanvas and try again.' },
  4: {
    name: 'kCreditExhausted',
    advice: 'Your SmartSpectra account has no credits remaining. Check your plan at physiology.presagetech.com.'
  },
  5: { name: 'kNetworkError', advice: 'The SDK could not reach Presage to validate your API key. Check your internet connection.' },
  6: { name: 'kServerError', advice: 'The Presage service returned an error. Try again in a moment.' },
  7: { name: 'kInputUnavailable', advice: 'The camera input is unavailable. Check that no other app is using it.' },
  8: { name: 'kProcessingFailed', advice: 'Signal processing failed. Stop and restart the session.' },
  9: { name: 'kFrameConversionFailed', advice: 'A camera frame could not be converted. Try a different resolution in Settings.' },
  10: { name: 'kNonMonotonicTimestamp', advice: 'Frame timestamps went backwards; the session will recover automatically.' },
  11: { name: 'kTimestampGap', advice: 'There was a gap in camera frames. Keep PulseCanvas in the foreground.' }
}

export function errorInfo(code: number): { name: string; advice: string } {
  return ERROR_TEXT[code] ?? { name: `code ${code}`, advice: 'An unexpected SDK error occurred.' }
}
