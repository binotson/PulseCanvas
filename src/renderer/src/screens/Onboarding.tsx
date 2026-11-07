import { ArrowLeft, ArrowRight, Camera, Check, Cpu, HeartPulse, Loader2, Lock, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Logo } from '../components/Sidebar'
import { Button, ExternalLink, Toggle } from '../components/ui'
import { describeCameraError } from '../lib/camera'
import { app, updateSettings } from '../lib/session'
import { useStore } from '../lib/store'

const STEPS = ['Welcome', 'How it works', 'Privacy & consent', 'Camera check'] as const

export function Onboarding(): ReactNode {
  const settings = useStore(app, (s) => s.settings)
  const [step, setStep] = useState(0)
  const [agree, setAgree] = useState(false)
  const [telemetry, setTelemetry] = useState(settings?.telemetryEnabled ?? false)

  const finish = async (): Promise<void> => {
    await updateSettings({ onboardingComplete: true })
  }

  return (
    <div className="relative flex h-full items-center justify-center overflow-y-auto p-8">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-violet/25 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full bg-pink/20 blur-[120px]" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[300px] w-[300px] rounded-full bg-cyan/10 blur-[100px]" />

      <div className="relative w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={40} />
          <div>
            <div className="font-display text-xl font-semibold">PulseCanvas</div>
            <div className="text-xs text-faint">Live Human Signal Studio</div>
          </div>
          <ol className="ml-auto flex gap-1.5" aria-label="Onboarding progress">
            {STEPS.map((label, i) => (
              <li
                key={label}
                aria-current={i === step ? 'step' : undefined}
                title={label}
                className={`h-1.5 w-8 rounded-full ${i <= step ? 'brand-gradient' : 'bg-white/10'}`}
              />
            ))}
          </ol>
        </div>

        <div className="glass rounded-3xl p-8">
          {step === 0 && (
            <>
              <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight">
                Turn your <span className="brand-text">heartbeat and breath</span> into living art.
              </h1>
              <p className="mt-4 text-base leading-relaxed text-muted">
                PulseCanvas uses your webcam and the Presage SmartSpectra SDK to measure your pulse, breathing and heart
                rate variability without touching you — then paints them as generative artwork in real time.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  ['Pulse Waves', 'Ribbons drawn by your pulse waveform', 'text-pink'],
                  ['Breathing Garden', 'Flowers that open with every inhale', 'text-cyan'],
                  ['Living Particles', 'A swarm that moves with your body', 'text-violet']
                ].map(([t, d, c]) => (
                  <div key={t} className="rounded-2xl border border-line bg-ink/40 p-4">
                    <Sparkles size={18} className={c} />
                    <div className="mt-2 text-sm font-medium">{t}</div>
                    <div className="mt-1 text-xs text-muted">{d}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="font-display text-2xl font-semibold">How it works</h2>
              <ul className="mt-5 space-y-4">
                <Feature icon={<Camera size={18} />} title="Your camera captures subtle changes">
                  Tiny colour changes in your skin and the motion of your chest carry your pulse and breathing.
                </Feature>
                <Feature icon={<Cpu size={18} />} title="SmartSpectra measures them on this device">
                  Frames are processed by the SmartSpectra SDK inside PulseCanvas. Video never leaves your computer.
                </Feature>
                <Feature icon={<HeartPulse size={18} />} title="Your signals become the brush">
                  Pulse arrives after ~12 s, breathing after ~30 s and HRV after ~60 s of steady signal. Each reading
                  comes with a confidence score, and PulseCanvas shows it.
                </Feature>
              </ul>
              <p className="mt-6 rounded-2xl border border-line bg-ink/40 p-4 text-xs leading-relaxed text-muted">
                SmartSpectra metrics are for general wellness and informational purposes only. They have not been cleared
                by the FDA and must not be used for medical diagnosis or treatment.
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="font-display text-2xl font-semibold">Privacy & consent</h2>
              <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-muted">
                <li className="flex gap-2">
                  <Lock size={16} className="mt-0.5 shrink-0 text-cyan" />
                  Camera frames are processed locally and are never recorded, saved or uploaded by PulseCanvas.
                </li>
                <li className="flex gap-2">
                  <Lock size={16} className="mt-0.5 shrink-0 text-cyan" />
                  The SmartSpectra SDK contacts Presage’s servers to validate your API key and subscription.
                </li>
                <li className="flex gap-2">
                  <Lock size={16} className="mt-0.5 shrink-0 text-cyan" />
                  Artworks and (optional) session summaries are stored only on this computer, and you can delete them at
                  any time in the Privacy Centre.
                </li>
                <li className="flex gap-2">
                  <Lock size={16} className="mt-0.5 shrink-0 text-cyan" />
                  The camera is only on while a session is running — you’ll see your camera light.
                </li>
              </ul>
              <div className="mt-5 rounded-2xl border border-line bg-ink/40 px-4">
                <Toggle
                  checked={telemetry}
                  onChange={setTelemetry}
                  label="Share aggregate SDK telemetry with Presage"
                  description={
                    <>
                      Off by default. If on, the SDK sends anonymous per-session statistics (SDK version, platform,
                      performance counters, error codes) — never frames, measured values or identifiers.{' '}
                      <ExternalLink href="https://github.com/Presage-Security/SmartSpectra/blob/main/docs/telemetry-and-privacy.md">
                        Details
                      </ExternalLink>
                    </>
                  }
                />
              </div>
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-violet/30 bg-violet/10 p-4">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-violet"
                />
                <span className="text-sm leading-relaxed">
                  I understand how PulseCanvas uses my camera and agree to let it process my video on this device to
                  measure pulse, breathing and HRV for creative, non-medical use.
                </span>
              </label>
            </>
          )}

          {step === 3 && <CameraCheck />}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft size={16} /> Back
          </Button>
          {step < 2 && (
            <Button variant="primary" onClick={() => setStep((s) => s + 1)}>
              Continue <ArrowRight size={16} />
            </Button>
          )}
          {step === 2 && (
            <Button
              variant="primary"
              disabled={!agree}
              onClick={async () => {
                await updateSettings({ consentAcceptedAt: new Date().toISOString(), telemetryEnabled: telemetry })
                setStep(3)
              }}
            >
              I agree <ArrowRight size={16} />
            </Button>
          )}
          {step === 3 && (
            <Button variant="primary" onClick={() => void finish()}>
              Enter the studio <ArrowRight size={16} />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }): ReactNode {
  return (
    <li className="flex gap-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet/15 text-violet">{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{children}</span>
      </span>
    </li>
  )
}

/** Opens the camera briefly so the OS permission prompt appears here, not mid-session. */
function CameraCheck(): ReactNode {
  const [state, setState] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stop = (): void => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }
  useEffect(() => stop, [])

  const check = async (): Promise<void> => {
    setState('checking')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 } }, audio: false })
      streamRef.current = s
      if (videoRef.current) videoRef.current.srcObject = s
      const track = s.getVideoTracks()[0]
      setMessage(track?.label ? `Connected: ${track.label}` : 'Camera connected')
      setState('ok')
      setTimeout(stop, 6000)
    } catch (err) {
      setMessage(describeCameraError(err).message)
      setState('error')
    }
  }

  return (
    <>
      <h2 className="font-display text-2xl font-semibold">Camera check</h2>
      <p className="mt-2 text-sm text-muted">
        Let’s make sure PulseCanvas can see you. The preview turns off automatically after a few seconds.
      </p>
      <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-ink">
        <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full -scale-x-100 object-cover" />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button variant="secondary" onClick={() => void check()} disabled={state === 'checking'}>
          {state === 'checking' ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
          {state === 'ok' ? 'Check again' : 'Test camera'}
        </Button>
        {state === 'ok' && (
          <span className="flex items-center gap-1.5 text-sm text-cyan">
            <Check size={16} /> {message}
          </span>
        )}
        {state === 'error' && <span className="text-sm text-pink">{message}</span>}
      </div>
      <p className="mt-4 text-xs text-faint">You can skip this — the camera will be requested when you start a session.</p>
    </>
  )
}
