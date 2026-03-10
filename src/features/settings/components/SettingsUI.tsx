import type React from 'react'

// ============================================
// Shared Settings UI Primitives
// ============================================

export function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={e => {
        e.stopPropagation()
        onChange()
      }}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 
        ${enabled ? 'bg-accent-main-100' : 'bg-bg-300'}`}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-[hsl(var(--always-white))] rounded-full shadow-sm transition-transform duration-200 
        ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  )
}

export interface SegmentedControlProps<T extends string> {
  value: T
  options: { value: T; label: string; icon?: React.ReactNode }[]
  onChange: (value: T, event?: React.MouseEvent) => void
}

export function SegmentedControl<T extends string>({ value, options, onChange }: SegmentedControlProps<T>) {
  const activeIndex = options.findIndex(o => o.value === value)

  return (
    <div
      className="bg-bg-100/50 p-0.5 rounded-lg flex border border-border-200/50 relative isolate"
      role="tablist"
      onKeyDown={e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault()
          const dir = e.key === 'ArrowRight' ? 1 : -1
          const next = (activeIndex + dir + options.length) % options.length
          onChange(options[next].value)
        }
      }}
    >
      <div
        className="absolute top-0.5 bottom-0.5 left-0.5 bg-bg-000 rounded-md shadow-sm ring-1 ring-border-200/50 transition-transform duration-300 ease-out -z-10"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />
      {options.map(opt => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={opt.value === value}
          tabIndex={opt.value === value ? 0 : -1}
          onClick={e => onChange(opt.value, e)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-[13px] font-medium transition-colors duration-200
            ${opt.value === value ? 'text-text-100' : 'text-text-400 hover:text-text-200'}`}
        >
          {opt.icon}
          <span className="truncate">{opt.label}</span>
        </button>
      ))}
    </div>
  )
}

export interface SettingRowProps {
  label: string
  description?: string
  icon?: React.ReactNode
  children: React.ReactNode
  onClick?: () => void
  className?: string
}

export function SettingRow({ label, description, icon, children, onClick, className }: SettingRowProps) {
  return (
    <div
      className={`flex items-center justify-between py-2.5 px-2.5 rounded-lg border border-transparent transition-colors
        ${onClick ? 'cursor-pointer hover:bg-bg-100/55 hover:border-border-200/45' : ''}
        ${className || ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {icon && <span className="text-text-400 shrink-0">{icon}</span>}
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-text-100">{label}</div>
          {description && <div className="text-[11px] text-text-400 mt-0.5">{description}</div>}
        </div>
      </div>
      <div className="shrink-0 ml-3">{children}</div>
    </div>
  )
}

export function SettingsCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-xl border border-border-200/55 bg-bg-050/55 p-3.5 ${className || ''}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-text-100">{title}</div>
          {description && <div className="text-[11px] text-text-400 mt-0.5 leading-relaxed">{description}</div>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  )
}
