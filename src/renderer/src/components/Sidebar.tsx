import { Activity, Images, LineChart, Settings as SettingsIcon, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { app, navigate, type Route } from '../lib/session'
import { useStore } from '../lib/store'

const ITEMS: { route: Route; label: string; icon: typeof Activity }[] = [
  { route: 'studio', label: 'Studio', icon: Activity },
  { route: 'gallery', label: 'Gallery', icon: Images },
  { route: 'insights', label: 'Insights', icon: LineChart },
  { route: 'privacy', label: 'Privacy', icon: ShieldCheck },
  { route: 'settings', label: 'Settings', icon: SettingsIcon }
]

export function Logo({ size = 32 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id="pc-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="0.5" stopColor="#22D3EE" />
          <stop offset="1" stopColor="#F472B6" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="14" fill="#17132D" stroke="url(#pc-logo)" strokeWidth="2" />
      <path
        d="M8 26 H16 L19 18 L24 34 L28 14 L32 26 H40"
        fill="none"
        stroke="url(#pc-logo)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Sidebar(): ReactNode {
  const route = useStore(app, (s) => s.route)
  const phase = useStore(app, (s) => s.phase)
  const live = phase === 'running' || phase === 'starting'
  return (
    <nav className="flex w-[84px] shrink-0 flex-col items-center gap-1 border-r border-line bg-ink-2/60 py-5 lg:w-[220px] lg:items-stretch lg:px-4">
      <div className="mb-6 flex items-center gap-3 lg:px-2">
        <Logo />
        <div className="hidden lg:block">
          <div className="font-display text-[17px] font-semibold tracking-tight">PulseCanvas</div>
          <div className="text-[11px] text-faint">Live Human Signal Studio</div>
        </div>
      </div>
      {ITEMS.map(({ route: r, label, icon: Icon }) => {
        const active = r === route
        return (
          <button
            key={r}
            type="button"
            onClick={() => navigate(r)}
            aria-current={active ? 'page' : undefined}
            title={label}
            className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              active ? 'bg-violet/15 text-text' : 'text-muted hover:bg-white/[0.05] hover:text-text'
            }`}
          >
            {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full brand-gradient" />}
            <Icon size={20} className={active ? 'text-violet' : ''} />
            <span className="hidden lg:inline">{label}</span>
            {r === 'studio' && live && <span className="pc-live-dot ml-auto hidden h-2 w-2 rounded-full bg-pink lg:block" />}
          </button>
        )
      })}
      <div className="mt-auto hidden rounded-xl border border-line p-3 text-[11px] leading-relaxed text-faint lg:block">
        For wellness and creative use only. Not a medical device.
      </div>
    </nav>
  )
}
