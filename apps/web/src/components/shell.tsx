import { useEffect, useState } from 'react'
import {
  Atom,
  BookOpenText,
  Bot,
  Boxes,
  ChevronRight,
  CircleGauge,
  FlaskConical,
  Menu,
  Network,
  Radar,
  X,
} from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import type { Health } from '../lib/types'
import { ModeBadge } from './ui'

const nav = [
  { to: '/', label: 'Agent 工作台', icon: Bot, end: true },
  { to: '/dashboard', label: '业务总览', icon: CircleGauge },
  { to: '/relationships', label: '关系中心', icon: Network },
  { to: '/knowledge', label: '知识库', icon: BookOpenText },
  { to: '/opportunities', label: '商机雷达', icon: Radar },
  { to: '/analyze', label: '信号研判', icon: FlaskConical },
  { to: '/products', label: '产品知识', icon: Boxes },
]

export default function Shell() {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [health, setHealth] = useState<Health>()

  useEffect(() => {
    api.health().then(setHealth).catch(() => undefined)
  }, [])

  useEffect(() => setMobileOpen(false), [location.pathname])

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Atom size={25} strokeWidth={1.8} /></div>
          <div>
            <strong>氢擎</strong>
            <span>关系与商机 Agent</span>
          </div>
          <button type="button" className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="关闭导航"><X size={20} /></button>
        </div>
        <div className="nav-section-label">工作空间</div>
        <nav className="main-nav" aria-label="主导航">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon size={18} />
              <span>{label}</span>
              <ChevronRight className="nav-chevron" size={14} />
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="mode-card">
          <span className="mode-card-label">当前运行方式</span>
          <ModeBadge mode={health?.agentMode ?? 'rules'} model={health?.model} />
          <p>{health?.agentMode === 'smart' || health?.agentMode === 'intelligent' ? 'Agent 可调用模型研判，关键动作仍需人工确认。' : '核心检索与评分可用；模型能力未启用或已降级。'}</p>
          <div className="service-line"><span className={health ? 'online-dot' : 'offline-dot'} /> API {health ? '连接正常' : '等待连接'}</div>
        </div>
      </aside>
      {mobileOpen && <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}
      <main className="main-area">
        <div className="mobile-topbar">
          <button type="button" className="icon-button" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu size={20} /></button>
          <span>氢擎 Agent</span>
          <ModeBadge mode={health?.agentMode ?? 'rules'} />
        </div>
        <div className="page-container"><Outlet /></div>
      </main>
    </div>
  )
}
