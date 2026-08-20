import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { LoadingState } from '../components/ui'
import { api, ApiError } from './api'
import type { Permission, PublicUser } from './types'

type AuthContextValue = {
  user?: PublicUser
  authRequired: boolean
  loading: boolean
  isGuest: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  has: (permission: Permission) => boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser>()
  const [authRequired, setAuthRequired] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const health = await api.health().catch(() => undefined)
    setAuthRequired(Boolean(health?.authRequired))
    try {
      const me = await api.me()
      setUser(me.user)
    } catch (error) {
      setUser(undefined)
      if (!(error instanceof ApiError && error.status === 401)) throw error
    }
  }, [])

  useEffect(() => {
    refresh().catch(() => undefined).finally(() => setLoading(false))
  }, [refresh])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    authRequired,
    loading,
    isGuest: user?.role === 'anonymous',
    login: async (email, password) => {
      const result = await api.login(email, password)
      try {
        const me = await api.me()
        if (!me.user || me.user.id !== result.user.id || me.user.role === 'anonymous') {
          setUser(undefined)
          throw new ApiError('登录没有保持。前后端不在同一站点时，浏览器可能拦截了会话 Cookie。请确认 API 的 WEB_ORIGIN 等于当前网站地址。', 401, 'SESSION_NOT_PERSISTED')
        }
        setUser(me.user)
      } catch (error) {
        if (error instanceof ApiError && error.code === 'SESSION_NOT_PERSISTED') throw error
        if (error instanceof ApiError && error.status === 401) {
          setUser(undefined)
          throw new ApiError('登录没有保持。请确认 API 的 WEB_ORIGIN 等于当前网站地址，并允许跨站 Cookie。', 401, 'SESSION_NOT_PERSISTED')
        }
        setUser(result.user)
      }
    },
    logout: async () => {
      await api.logout().catch(() => undefined)
      setUser(undefined)
      await refresh().catch(() => undefined)
    },
    has: (permission) => Boolean(user?.permissions.includes(permission)),
    refresh,
  }), [authRequired, loading, refresh, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return value
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, authRequired, loading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingState label="正在核对会话…" />
  if (authRequired && !user) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to={from && from !== '/' ? `/login?from=${encodeURIComponent(from)}` : '/login'} replace />
  }
  return children
}

export function RequirePermission({ permission, fallback = '/dashboard', children }: { permission: Permission; fallback?: string; children: ReactNode }) {
  const { has, loading } = useAuth()
  if (loading) return <LoadingState />
  if (!has(permission)) return <Navigate to={fallback} replace />
  return children
}
