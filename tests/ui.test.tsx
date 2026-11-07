// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Badge, Toggle, formatBytes, formatDuration } from '../src/renderer/src/components/ui'
import { summarizeSeries } from '../src/renderer/src/lib/sessionStats'

afterEach(cleanup)

describe('UI primitives', () => {
  it('Toggle exposes switch semantics and reports changes', () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} label="Keep session history" />)
    const sw = screen.getByRole('switch', { name: 'Keep session history' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('Badge renders its content', () => {
    render(<Badge tone="ok">Stable · 88%</Badge>)
    expect(screen.getByText('Stable · 88%')).toBeTruthy()
  })

  it('formats sizes and durations', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatDuration(75)).toBe('1m 15s')
    expect(formatDuration(9)).toBe('9s')
  })
})

describe('summarizeSeries', () => {
  it('prefers SDK-stable readings', () => {
    const s = summarizeSeries([
      { t: 1, v: 100, confidence: 10, stable: false },
      { t: 2, v: 60, confidence: 80, stable: true },
      { t: 3, v: 70, confidence: 85, stable: true }
    ])
    expect(s).toEqual({ avg: 65, min: 60, max: 70, samples: 2 })
  })
  it('falls back to all readings when none are stable', () => {
    expect(summarizeSeries([{ t: 1, v: 50, confidence: 10, stable: false }])?.samples).toBe(1)
    expect(summarizeSeries([])).toBeNull()
  })
})
