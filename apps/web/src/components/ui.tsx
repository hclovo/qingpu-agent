import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Inbox, LoaderCircle, RefreshCw, Sparkles, WifiOff } from 'lucide-react'
import { displayMode } from '../lib/format'
import type { AgentMode } from '../lib/types'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
  meta?: ReactNode
}) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
        {meta && <div className="page-header-meta">{meta}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function ModeBadge({ mode }: { mode?: AgentMode; model?: string }) {
  const kind = mode === 'smart' || mode === 'intelligent' ? 'smart' : mode === 'demo' ? 'demo' : 'rules'
  const Icon = kind === 'smart' ? Sparkles : kind === 'demo' ? WifiOff : CheckCircle2
  const tag = kind === 'smart' ? '智能' : kind === 'demo' ? '演示' : '规则'
  return <span className={`mode-badge ${kind}`}><Icon size={12} />{tag}</span>
}

export function StatusBadge({ value, label }: { value: string; label?: string }) {
  return <span className={`status-badge status-${value.toLowerCase()}`}>{label ?? value}</span>
}

export function LoadingState({ label = '正在加载数据…' }: { label?: string }) {
  return (
    <div className="state-panel" role="status">
      <LoaderCircle className="spin" size={24} />
      <strong>{label}</strong>
      <span>正在整理业务上下文，请稍候</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-panel error-state" role="alert">
      <AlertCircle size={24} />
      <strong>数据暂时不可用</strong>
      <span>{message}</span>
      {onRetry && (
        <button className="button secondary small" type="button" onClick={onRetry}>
          <RefreshCw size={15} /> 重新加载
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="state-panel empty-state">
      <Inbox size={25} />
      <strong>{title}</strong>
      <span>{description}</span>
      {action}
    </div>
  )
}

export function Drawer({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="drawer-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="button ghost small icon-circle" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  )
}

export function ProgressBar({ value, max = 100, label, pending }: { value: number; max?: number; label?: string; pending?: boolean }) {
  const width = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className={`progress-track ${pending ? 'span-pending' : ''}`} aria-label={label}>
      <span style={{ width: `${width}%` }} />
    </div>
  )
}
