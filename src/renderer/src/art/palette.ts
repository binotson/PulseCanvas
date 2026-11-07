export type RGB = [number, number, number]

export const COLORS = {
  bg: [16, 13, 32] as RGB, // #100D20
  bg2: [23, 19, 45] as RGB, // #17132D
  violet: [139, 92, 246] as RGB, // #8B5CF6
  cyan: [34, 211, 238] as RGB, // #22D3EE
  pink: [244, 114, 182] as RGB, // #F472B6
  text: [248, 250, 252] as RGB // #F8FAFC
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t))
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

export function rgba(c: RGB, a: number): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`
}

/**
 * Map heart rate to the brand gradient: calm (≤55 bpm) → cyan,
 * ~75 bpm → violet, elevated (≥100 bpm) → pink. Unknown → violet.
 */
export function heartColor(bpm: number | null): RGB {
  if (bpm === null) return COLORS.violet
  if (bpm <= 75) return mix(COLORS.cyan, COLORS.violet, (bpm - 55) / 20)
  return mix(COLORS.violet, COLORS.pink, (bpm - 75) / 25)
}

/** Three-stop brand gradient sampled at t ∈ [0,1]. */
export function brand(t: number): RGB {
  const k = ((t % 1) + 1) % 1
  if (k < 1 / 3) return mix(COLORS.violet, COLORS.cyan, k * 3)
  if (k < 2 / 3) return mix(COLORS.cyan, COLORS.pink, (k - 1 / 3) * 3)
  return mix(COLORS.pink, COLORS.violet, (k - 2 / 3) * 3)
}

/** Deterministic PRNG (mulberry32) so artworks are reproducible per seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Cheap smooth 2D pseudo-noise in roughly [-1, 1]. */
export function flow(x: number, y: number, t: number): number {
  return (
    Math.sin(x * 1.7 + t * 0.6 + Math.cos(y * 1.3 - t * 0.4)) * 0.6 +
    Math.cos(y * 2.1 - t * 0.5 + Math.sin(x * 0.9 + t * 0.3)) * 0.4
  )
}
