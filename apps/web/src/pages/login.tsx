import { FormEvent, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'

const logoUrl = '/logo.svg'

export default function LoginPage() {
  const { user, loading, login } = useAuth()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const from = searchParams.get('from') || '/'

  if (!loading && user && user.role !== 'anonymous') return <Navigate to={from} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <img src={logoUrl} alt="" width="36" height="36" />
          <div>
            <strong>氢擎</strong>
            <span>企业关系与商机工作台</span>
          </div>
        </div>
        <h1>登录</h1>
        <p>使用公司账号进入共享工作台。对外沟通、报价和技术承诺仍需人工确认。</p>
        <form className="login-form" onSubmit={submit}>
          <label>
            <span>邮箱</span>
            <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@qingpu.local" />
          </label>
          <label>
            <span>密码</span>
            <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <div className="inline-error" role="alert">{error}</div>}
          <button className="button primary full" type="submit" disabled={submitting}>{submitting ? '正在登录…' : '进入工作台'}</button>
        </form>
      </div>
    </div>
  )
}
