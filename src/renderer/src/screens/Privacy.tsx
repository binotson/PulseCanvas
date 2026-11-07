import { Camera, Cloud, HardDrive, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { StorageReport, WipeOptions } from '@shared/api'
import { Button, Card, ExternalLink, PageHeader, Toggle, formatBytes } from '../components/ui'
import { app, initApp, refreshSdkInfo, toast, updateSettings } from '../lib/session'
import { useStore } from '../lib/store'

function Flow({ icon, title, children, tone }: { icon: ReactNode; title: string; children: ReactNode; tone: string }): ReactNode {
  return (
    <Card>
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1.5 text-sm leading-relaxed text-muted">{children}</div>
    </Card>
  )
}

export function Privacy(): ReactNode {
  const settings = useStore(app, (s) => s.settings)
  const phase = useStore(app, (s) => s.phase)
  const [report, setReport] = useState<StorageReport | null>(null)
  const [wipe, setWipe] = useState<WipeOptions>({ gallery: true, history: true, settings: false, apiKey: false, sdkCache: false })
  const [wiping, setWiping] = useState(false)

  useEffect(() => {
    void window.pulse.privacy.report().then(setReport)
  }, [])

  const doWipe = async (): Promise<void> => {
    setWiping(true)
    try {
      const r = await window.pulse.privacy.wipe(wipe)
      setReport(r)
      if (wipe.settings) await initApp()
      await refreshSdkInfo()
      toast('Selected data deleted from this computer')
    } finally {
      setWiping(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-10">
      <PageHeader title="Privacy Centre" subtitle="Exactly what PulseCanvas does with your camera and your data — and the controls to change it." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Flow icon={<Camera size={18} />} title="Stays on this device" tone="bg-cyan/15 text-cyan">
          Camera frames go from the window to PulseCanvas’s main process and into the SmartSpectra SDK, which computes your
          vitals locally. Frames are never written to disk or uploaded by PulseCanvas.
        </Flow>
        <Flow icon={<Cloud size={18} />} title="Sent to Presage" tone="bg-violet/15 text-violet">
          The SDK contacts Presage to validate your API key and subscription. If you enable telemetry, it also sends
          anonymous per-session statistics (SDK version, platform, performance counters, error codes). Per Presage, raw
          video, facial imagery and measured values are not included.
        </Flow>
        <Flow icon={<HardDrive size={18} />} title="Saved locally — only if you choose" tone="bg-pink/15 text-pink">
          Artworks you save, optional session summaries (averages only, no waveforms) and your settings live in your
          user-data folder. Your API key, if entered here, is encrypted with Windows DPAPI.
        </Flow>
      </div>

      <h2 className="mt-10 mb-3 font-display text-xl font-semibold">Controls</h2>
      <Card className="divide-y divide-line py-1">
        <Toggle
          checked={!!settings?.telemetryEnabled}
          onChange={(v) => void updateSettings({ telemetryEnabled: v })}
          label="Share aggregate SDK telemetry with Presage"
          description="Passed to the SDK as enableTelemetry. Takes effect from the next session."
        />
        <Toggle
          checked={!!settings?.saveSessionHistory}
          onChange={(v) => void updateSettings({ saveSessionHistory: v }).then(() => window.pulse.privacy.report().then(setReport))}
          label="Keep session history"
          description="Stores summary numbers for each session on this computer. Turning this off deletes existing history."
        />
        <Toggle
          checked={!!settings?.includeVitalsInExports}
          onChange={(v) => void updateSettings({ includeVitalsInExports: v })}
          label="Include vitals in saved artworks"
          description="Writes your pulse, breathing and HRV values into the corner of saved images. Off by default, so artworks you share don’t reveal health data."
        />
      </Card>

      <h2 className="mt-10 mb-3 font-display text-xl font-semibold">Your data on this computer</h2>
      <Card>
        {report ? (
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-4">
            <div>
              <dt className="text-xs text-faint">Artworks</dt>
              <dd className="mt-0.5 font-medium">
                {report.galleryCount} · {formatBytes(report.galleryBytes)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Saved sessions</dt>
              <dd className="mt-0.5 font-medium">{report.historyCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Stored API key</dt>
              <dd className="mt-0.5 font-medium">{report.hasStoredApiKey ? 'Yes (encrypted)' : 'No'}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">SmartSpectra SDK cache</dt>
              <dd className="mt-0.5 font-medium">{report.sdkCacheExists ? 'Present' : 'None'}</dd>
            </div>
            <div className="col-span-2 md:col-span-4">
              <dt className="text-xs text-faint">PulseCanvas data folder</dt>
              <dd className="mt-0.5 break-all font-mono text-xs text-muted">{report.userDataPath}</dd>
            </div>
            <div className="col-span-2 md:col-span-4">
              <dt className="text-xs text-faint">SDK cache folder (device-key cache used by the SDK for some models)</dt>
              <dd className="mt-0.5 break-all font-mono text-xs text-muted">{report.sdkCachePath}</dd>
            </div>
          </dl>
        ) : (
          <Loader2 className="animate-spin text-faint" />
        )}
      </Card>

      <Card className="mt-4 border-pink/20">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Trash2 size={16} className="text-pink" /> Delete data
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
          {(
            [
              ['gallery', 'Artworks'],
              ['history', 'Session history'],
              ['settings', 'Settings & consent'],
              ['apiKey', 'Stored API key'],
              ['sdkCache', 'SDK cache']
            ] as [keyof WipeOptions, string][]
          ).map(([k, label]) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2">
              <input
                type="checkbox"
                className="accent-pink"
                checked={wipe[k]}
                onChange={(e) => setWipe((w) => ({ ...w, [k]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button variant="danger" disabled={wiping || !Object.values(wipe).some(Boolean)} onClick={() => void doWipe()}>
            {wiping ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Delete selected
          </Button>
          {(wipe.apiKey || wipe.sdkCache) && phase !== 'idle' && (
            <span className="text-xs text-muted">This will stop the running session.</span>
          )}
        </div>
      </Card>

      <Card className="mt-4 text-sm leading-relaxed text-muted">
        <div className="mb-1 flex items-center gap-2 font-semibold text-text">
          <ShieldCheck size={16} className="text-cyan" /> Learn more
        </div>
        Read PulseCanvas’s PRIVACY.md in the project repository, Presage’s{' '}
        <ExternalLink href="https://github.com/Presage-Security/SmartSpectra/blob/main/docs/telemetry-and-privacy.md">
          SDK telemetry & privacy notes
        </ExternalLink>{' '}
        and the <ExternalLink href="https://smartspectra.presagetech.com/docs/">SmartSpectra documentation</ExternalLink>.
      </Card>
    </div>
  )
}
