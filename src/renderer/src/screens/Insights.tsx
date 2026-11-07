import { Activity, Clock, Heart, ShieldCheck, Trash2, Wind } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { SessionSummary } from '@shared/api'
import { ART_META } from '../art'
import { Sparkline, useNow } from '../components/Vitals'
import { Badge, Button, Card, PageHeader, formatDuration } from '../components/ui'
import { app, getRecorder, navigate } from '../lib/session'
import { summarizeSeries } from '../lib/sessionStats'
import { useStore } from '../lib/store'

function Stat({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }): ReactNode {
  return (
    <Card>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-display text-3xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-faint">{sub}</div>}
    </Card>
  )
}

function rangeText(s: SessionSummary['pulse'], digits = 0): string | undefined {
  return s ? `range ${s.min.toFixed(digits)}–${s.max.toFixed(digits)} · ${s.samples} readings` : undefined
}

export function Insights(): ReactNode {
  const phase = useStore(app, (s) => s.phase)
  const lastSummary = useStore(app, (s) => s.lastSummary)
  const settings = useStore(app, (s) => s.settings)
  const mode = useStore(app, (s) => s.mode)
  useNow(2000)
  const [history, setHistory] = useState<SessionSummary[]>([])
  useEffect(() => {
    void window.pulse.history.list().then(setHistory)
  }, [lastSummary])

  const live = phase === 'running' || phase === 'starting'
  const rec = getRecorder()
  const summary: SessionSummary | null = live && rec ? rec.summarize(mode) : lastSummary
  const pulseSeries = rec?.pulse ?? []
  const breathSeries = rec?.breathing ?? []
  const stableOnlyPulse = pulseSeries.some((p) => p.stable)
  const stableOnlyBreath = breathSeries.some((p) => p.stable)

  return (
    <div className="h-full overflow-y-auto p-10">
      <PageHeader
        title="Session insights"
        subtitle="A summary of the genuine SmartSpectra readings from your session. Averages use readings the SDK marked as stable when available."
      />

      {!summary ? (
        <Card className="py-14 text-center">
          <div className="font-medium">No session yet</div>
          <div className="mt-1 text-sm text-muted">Run a live session in the studio — insights appear here as soon as readings arrive.</div>
          <Button variant="primary" className="mt-5" onClick={() => navigate('studio')}>
            Go to the studio
          </Button>
        </Card>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2 text-sm text-muted">
            {live ? <Badge tone="warn">Live session</Badge> : <Badge tone="muted">Last session</Badge>}
            {new Date(summary.startedAt).toLocaleString()} · {ART_META[summary.mode]?.name}
          </div>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Stat icon={<Clock size={14} />} label="Duration" value={formatDuration(summary.durationSec)} />
            <Stat
              icon={<Heart size={14} className="text-pink" />}
              label="Avg pulse"
              value={summary.pulse ? `${summary.pulse.avg.toFixed(0)} bpm` : '—'}
              sub={rangeText(summary.pulse)}
            />
            <Stat
              icon={<Wind size={14} className="text-cyan" />}
              label="Avg breathing"
              value={summary.breathing ? `${summary.breathing.avg.toFixed(1)} /min` : '—'}
              sub={rangeText(summary.breathing, 1)}
            />
            <Stat
              icon={<Activity size={14} className="text-violet" />}
              label="Latest HRV"
              value={summary.hrv ? `${summary.hrv.lastRmssd.toFixed(0)} ms` : '—'}
              sub={summary.hrv ? `RMSSD · SDNN ${summary.hrv.lastSdnn.toFixed(0)} ms · ${summary.hrv.confidence.toFixed(0)}% confidence` : 'Needs ~60 s of steady pulse'}
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card>
              <div className="mb-3 flex items-center justify-between text-sm font-medium">
                <span>Pulse over the session</span>
                {pulseSeries.length > 0 && !stableOnlyPulse && <Badge tone="info">No stable readings yet</Badge>}
              </div>
              <Sparkline points={pulseSeries} color="#F472B6" />
            </Card>
            <Card>
              <div className="mb-3 flex items-center justify-between text-sm font-medium">
                <span>Breathing over the session</span>
                {breathSeries.length > 0 && !stableOnlyBreath && <Badge tone="info">No stable readings yet</Badge>}
              </div>
              <Sparkline points={breathSeries} color="#22D3EE" />
            </Card>
          </div>
          {!rec && lastSummary && (
            <p className="mt-2 text-xs text-faint">Charts are kept in memory only during a session.</p>
          )}

          <Card className="mt-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck size={16} className="text-cyan" /> Measurement conditions
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full brand-gradient" style={{ width: `${Math.round(summary.validationOkRatio * 100)}%` }} />
            </div>
            <div className="mt-2 text-xs text-muted">
              The SDK reported good measurement conditions for {Math.round(summary.validationOkRatio * 100)}% of the
              session. Stillness, even lighting and a centred face improve confidence.
            </div>
          </Card>
          {summary.pulse && summary.pulse.samples > 0 && (
            <SummaryNote pulse={summarizeSeries(pulseSeries)} />
          )}
        </>
      )}

      <div className="mt-10 mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">History</h2>
        {history.length > 0 && (
          <Button
            variant="ghost"
            onClick={async () => {
              await window.pulse.history.clear()
              setHistory([])
            }}
          >
            <Trash2 size={14} /> Clear history
          </Button>
        )}
      </div>
      {!settings?.saveSessionHistory ? (
        <Card className="text-sm text-muted">
          Session history is off, so nothing is kept after you close PulseCanvas. You can turn it on in{' '}
          <button className="text-cyan underline" onClick={() => navigate('settings')}>
            Settings
          </button>{' '}
          — only summary numbers are stored, on this computer.
        </Card>
      ) : history.length === 0 ? (
        <Card className="text-sm text-muted">No saved sessions yet.</Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-ink-2 text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Artwork</th>
                <th className="px-4 py-3 font-medium">Pulse</th>
                <th className="px-4 py-3 font-medium">Breathing</th>
                <th className="px-4 py-3 font-medium">HRV</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-line">
                  <td className="px-4 py-3">{new Date(h.startedAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{formatDuration(h.durationSec)}</td>
                  <td className="px-4 py-3">{ART_META[h.mode]?.name}</td>
                  <td className="px-4 py-3 tabular-nums">{h.pulse ? `${h.pulse.avg.toFixed(0)} bpm` : '—'}</td>
                  <td className="px-4 py-3 tabular-nums">{h.breathing ? `${h.breathing.avg.toFixed(1)} /min` : '—'}</td>
                  <td className="px-4 py-3 tabular-nums">{h.hrv ? `${h.hrv.lastRmssd.toFixed(0)} ms` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-8 text-xs text-faint">
        For general wellness and creative purposes only. SmartSpectra metrics have not been cleared by the FDA and must not
        be used for medical diagnosis or treatment.
      </p>
    </div>
  )
}

function SummaryNote({ pulse }: { pulse: SessionSummary['pulse'] }): ReactNode {
  if (!pulse || pulse.samples < 3) return null
  const spread = pulse.max - pulse.min
  const text =
    spread < 6
      ? 'Your heart rate stayed very steady through the session.'
      : spread < 15
        ? 'Your heart rate moved gently through the session.'
        : 'Your heart rate varied noticeably — movement, talking or changing light can contribute to this.'
  return <p className="mt-4 text-sm text-muted">{text}</p>
}
