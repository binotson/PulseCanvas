import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary:
    'brand-gradient text-ink font-semibold shadow-[0_8px_30px_-8px_rgba(139,92,246,0.7)] hover:brightness-110 active:brightness-95',
  secondary: 'bg-white/[0.06] text-text border border-line hover:bg-white/[0.1]',
  ghost: 'text-muted hover:text-text hover:bg-white/[0.06]',
  danger: 'bg-pink/15 text-pink border border-pink/30 hover:bg-pink/25'
}

export function Button({
  variant = 'secondary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }): ReactNode {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }): ReactNode {
  return <div className={`rounded-2xl border border-line bg-ink-2/80 p-5 ${className}`}>{children}</div>
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }): ReactNode {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: ReactNode
  disabled?: boolean
}): ReactNode {
  return (
    <label className={`flex items-start justify-between gap-6 py-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-violet' : 'bg-white/15'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-text shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
        />
      </button>
    </label>
  )
}

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'info' | 'muted'; children: ReactNode }): ReactNode {
  const tones = {
    ok: 'bg-cyan/15 text-cyan border-cyan/30',
    warn: 'bg-pink/15 text-pink border-pink/30',
    info: 'bg-violet/15 text-violet border-violet/30',
    muted: 'bg-white/5 text-muted border-line'
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return m ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }): ReactNode {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        void window.pulse.openExternal(href)
      }}
      className="text-cyan underline decoration-cyan/40 underline-offset-2 hover:decoration-cyan"
    >
      {children}
    </a>
  )
}
