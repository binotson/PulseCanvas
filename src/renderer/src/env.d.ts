/// <reference types="vite/client" />
import type { PulseApi } from '@shared/api'

declare global {
  interface Window {
    pulse: PulseApi
  }
}

export {}
