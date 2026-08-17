import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Inbox, LoaderCircle, RefreshCw, Sparkles, WifiOff } from 'lucide-react'
import { displayMode } from '../lib/format'
import type { AgentMode } from '../lib/types'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function ModeBadge({ mode, model }: { mode?: AgentMode; model?: string }) {
  const kind = mode === 'smart' || mode === 'intelligent' ? 'smart' : mode === 'demo' ? 'demo' : 'rules'
  return (
    <span className={`mode-badge ${kind}`} title={model ? `模型：${model}` : undefined}>
      {kind === 'smart' ? <Sparkles size={14} /> : kind === 'demo' ? <WifiOff size={14} /> : <CheckCircle2 size={14} />}
      {displayMode(mode)}
    </span>
  )
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
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  )
}

export function ProgressBar({ value, max = 100, label }: { value: number; max?: number; label?: string }) {
  const width = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="progress-wrap" aria-label={label}>
      <div className="progress-track">
        <span style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}
