import { useEffect, useState } from 'react'
import {
  BookOpenText,
  Bot,
  Boxes,
  ChevronRight,
  CircleGauge,
  FlaskConical,
  LogOut,
  Menu,
  Network,
  Radar,
  Shield,
  Users,
  X,
} from 'lucide-react'
const logoUrl = '/logo.svg'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { userRoleLabels } from '../lib/format'
import type { Health, Permission, PublicUser } from '../lib/types'
import { ModeBadge } from './ui'
import { ClockTick } from './console'

const nav: Array<{ to: string; label: string; icon: typeof Bot; key: string; end?: boolean; permission: Permission }> = [
  { to: '/', label: 'Agent 工作台', icon: Bot, key: 'G · 1', end: true, permission: 'agent.chat' },
  { to: '/dashboard', label: '业务总览', icon: CircleGauge, key: 'G · 2', permission: 'dashboard.read' },
  { to: '/relationships', label: '关系中心', icon: Network, key: 'G · 3', permission: 'relationships.read' },
  { to: '/knowledge', label: '知识库', icon: BookOpenText, key: 'G · 4', permission: 'knowledge.read' },
  { to: '/opportunities', label: '商机雷达', icon: Radar, key: 'G · 5', permission: 'opportunities.read' },
  { to: '/analyze', label: '信号研判', icon: FlaskConical, key: 'G · 6', permission: 'opportunities.analyze' },
  { to: '/products', label: '产品知识', icon: Boxes, key: 'G · 7', permission: 'products.read' },
  { to: '/settings/users', label: '用户管理', icon: Users, key: 'G · 8', permission: 'users.read' },
  { to: '/settings/roles', label: '角色权限', icon: Shield, key: 'G · 9', permission: 'roles.read' },
]

export default function Shell() {
  const location = useLocation()
  const { user, has, isGuest, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [health, setHealth] = useState<Health>()
  const visibleNav = nav.filter((item) => has(item.permission))

  useEffect(() => {
    api.health().then(setHealth).catch(() => undefined)
  }, [])

  useEffect(() => setMobileOpen(false), [location.pathname])

  const agentOnline = health?.status === 'ok'

  return (
    <div className="app-shell">
      <div className="status-bar" role="status" aria-label="system status">
        <div className="status-bar-group">
          <span className="status-bar-brand">
            <span className="glyph" aria-hidden="true">
              <img src={logoUrl} alt="" width="14" height="14" style={{ display: 'block' }} />
            </span>
            氢擎 · 工作台
          </span>
          <span className="status-bar-divider" />
          <span className={`status-bar-item ${agentOnline ? 'online' : 'pending'}`}>
            <span className="dot" />
            {agentOnline ? '在线' : '连接中'}
          </span>
        </div>
        <div className="status-bar-group">
          <span className="status-bar-item subtle">运行</span>
          <span className="status-bar-item">v{health?.version ?? '0.1.0'}</span>
          <span className="status-bar-divider" />
          <ClockTick />
        </div>
      </div>

      <div className="app-body">
        <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
          <div className="brand">
            <div className="brand-mark">
              <img src={logoUrl} alt="氢擎" width="28" height="28" style={{ position: 'relative', zIndex: 1, display: 'block' }} />
            </div>
            <div>
              <strong>氢擎</strong>
              <span>企业关系与商机 Agent</span>
            </div>
            <button type="button" className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="关闭导航">
              <X size={18} />
            </button>
          </div>
          <div className="nav-section-label">工作空间</div>
          <nav className="main-nav" aria-label="主导航">
            {visibleNav.map(({ to, label, icon: Icon, end, key: kbd }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '')}>
                <Icon size={17} className="shimmer" />
                <span>{label}</span>
                <kbd className="nav-key">{kbd}</kbd>
                <ChevronRight className="nav-chevron" size={14} />
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-spacer" />
          <div className="user-card">
            <div>
              <strong>{user?.displayName ?? '未登录'}</strong>
              <span>{user ? displayUserRoles(user) : '访客'}</span>
            </div>
            {user && !isGuest ? (
              <button type="button" className="icon-button" onClick={() => void logout()} aria-label="退出登录">
                <LogOut size={16} />
              </button>
            ) : (
              <NavLink to="/login" className="text-link">登录</NavLink>
            )}
          </div>
          <div className="mode-card">
            <span className="mode-card-label">
              <span className="dot-pulse" style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--action)', boxShadow: '0 0 6px var(--action-glow)' }} />
              当前模式
            </span>
            <ModeBadge mode={health?.agentMode ?? 'rules'} />
            <p>{health?.agentMode === 'smart' || health?.agentMode === 'intelligent' ? '调用大模型工具，研判与建议可解释；关键动作仍需人工确认。' : '规则引擎 + 演示信号，完整流程可用；模型能力未启用或已降级。'}</p>
            <div className="service-line">
              <span className={agentOnline ? 'online-dot' : 'offline-dot'} />
              接口 {agentOnline ? '正常' : '待连接'}
            </div>
          </div>
        </aside>
        {mobileOpen && <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}
        <main className="main-area">
          <div className="mobile-topbar">
            <button type="button" className="icon-button" onClick={() => setMobileOpen(true)} aria-label="打开导航">
              <Menu size={20} />
            </button>
            <span>氢擎 Agent</span>
            <ModeBadge mode={health?.agentMode ?? 'rules'} />
          </div>
          <div className="page-container">
            {isGuest && (
              <div className="guest-banner" role="status">
                <span>当前为游客，只能查看总览、关系、知识、商机和产品。使用 Agent、补充知识或发现商机请先登录。</span>
                <NavLink to="/login" className="text-link">去登录</NavLink>
              </div>
            )}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function displayUserRoles(user: PublicUser) {
  const names = user.roles?.map((item) => item.name) ?? []
  if (names.length > 1) return `${names[0]} 等 ${names.length} 个`
  if (names[0]) return names[0]
  return userRoleLabels[user.role] ?? user.role
}
