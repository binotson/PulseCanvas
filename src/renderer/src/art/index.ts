import type { ArtMode } from '@shared/settings'
import { BreathingGarden } from './breathingGarden'
import { LivingParticles } from './livingParticles'
import { PulseWaves } from './pulseWaves'
import type { ArtEngine, EngineOptions } from './types'

export const ART_META: Record<ArtMode, { name: string; tagline: string }> = {
  'pulse-waves': { name: 'Pulse Waves', tagline: 'Ribbons drawn by your heartbeat' },
  'breathing-garden': { name: 'Breathing Garden', tagline: 'A garden that grows with every breath' },
  'living-particles': { name: 'Living Particles', tagline: 'A swarm that moves with your body' }
}

export function createEngine(mode: ArtMode, opts: EngineOptions): ArtEngine {
  switch (mode) {
    case 'breathing-garden':
      return new BreathingGarden(opts)
    case 'living-particles':
      return new LivingParticles(opts)
    default:
      return new PulseWaves(opts)
  }
}
