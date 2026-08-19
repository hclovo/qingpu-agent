import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Shield, UserPlus } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { PublicUser, Role } from '../lib/types'
import { Drawer, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/ui'

export default function UsersPage() {
  const { has } = useAuth()
  const canManage = has('users.manage')
  const [items, setItems] = useState<PublicUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [createRoleIds, setCreateRoleIds] = useState<string[]>([])
  const [assigning, setAssigning] = useState<PublicUser>()
  const [assignRoleIds, setAssignRoleIds] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [users, roleRows] = await Promise.all([api.users(), api.roles()])
      setItems(users)
      setRoles(roleRows)
      setCreateRoleIds((current) => current.length ? current : roleRows.filter((role) => role.code === 'sales').map((role) => role.id))
    } catch (err) { setError(err instanceof Error ? err.message : '加载用户失败') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (!createRoleIds.length) {
      setFormError('至少选择一个角色')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await api.createUser({
        email: String(form.get('email')),
        displayName: String(form.get('displayName')),
        roleIds: createRoleIds,
        password: String(form.get('password')),
      })
      setOpen(false)
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  async function patch(id: string, input: Parameters<typeof api.updateUser>[1]) {
    setFormError('')
    try {
      const updated = await api.updateUser(id, input)
      setItems((current) => current.map((item) => item.id === id ? updated : item))
      return updated
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '更新失败')
      return undefined
    }
  }

  function openAssign(user: PublicUser) {
    setAssigning(user)
    setAssignRoleIds((user.roles ?? []).map((role) => role.id))
  }

  async function saveAssign() {
    if (!assigning) return
    if (!assignRoleIds.length) {
      setFormError('用户至少保留一个角色')
      return
    }
    setSaving(true)
    const updated = await patch(assigning.id, { roleIds: assignRoleIds })
    setSaving(false)
    if (updated) setAssigning(undefined)
  }

  return (
    <>
      <PageHeader
        title="用户与权限"
        description="把一个或多个角色派给账号。生效权限是这些角色的并集，业务数据仍是公司共享工作台。"
        actions={canManage ? <button className="button primary" type="button" onClick={() => setOpen((value) => !value)}><UserPlus size={15} /> 新建账号</button> : undefined}
      />
      {formError && <div className="inline-error" role="alert">{formError}</div>}
      {open && canManage && (
        <form className="card form-grid user-create-form" onSubmit={create}>
          <label><span>邮箱 *</span><input required name="email" type="email" placeholder="name@qingpu.local" /></label>
          <label><span>显示名 *</span><input required name="displayName" minLength={2} placeholder="例如：市场销售" /></label>
          <label><span>初始密码 *</span><input required name="password" type="password" minLength={8} /></label>
          <div className="full">
            <span className="field-label">角色 *</span>
            <RolePicker roles={roles} selectedIds={createRoleIds} onChange={setCreateRoleIds} />
          </div>
          <div className="form-actions full">
            <button type="button" className="button ghost" onClick={() => setOpen(false)}>取消</button>
            <button type="submit" className="button primary" disabled={saving}>{saving ? '创建中…' : '创建账号'}</button>
          </div>
        </form>
      )}
      <section className="card">
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={load} /> : items.length ? (
          <div className="user-table-wrap">
            <table className="data-table users-table">
              <thead>
                <tr>
                  <th>账号</th>
                  <th>角色</th>
                  <th>状态</th>
                  {canManage && <th>操作</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.displayName}</strong>
                      <small>{item.email}{item.isSeed ? ' · 种子账号' : ''}</small>
                    </td>
                    <td>
                      <div className="role-chips">
                        {(item.roles ?? []).map((role) => <span key={role.id} className="role-chip">{role.name}</span>)}
                        {!item.roles?.length && <span className="role-chip muted">{item.role}</span>}
                        {canManage && (
                          <button type="button" className="button ghost tiny" onClick={() => openAssign(item)}>调整角色</button>
                        )}
                      </div>
                    </td>
                    <td><StatusBadge value={item.status} label={item.status === 'active' ? '启用' : '停用'} /></td>
                    {canManage && (
                      <td>
                        <div className="user-actions">
                          <button className="button ghost small" type="button" onClick={() => {
                            const password = window.prompt('输入新的初始密码（至少 8 位）')
                            if (password) void patch(item.id, { password })
                          }}>重置密码</button>
                          <button
                            className="button ghost small"
                            type="button"
                            onClick={() => void patch(item.id, { status: item.status === 'active' ? 'disabled' : 'active' })}
                          >
                            {item.status === 'active' ? '停用' : '启用'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="还没有账号" description="由管理员创建账号并分配角色。" />}
      </section>
      <p className="user-hint"><Shield size={14} /> 最后一位可管理账号的人不能被停用或拿掉管理角色。</p>
      {assigning && (
        <Drawer title={`分配角色 · ${assigning.displayName}`} subtitle={assigning.email} onClose={() => setAssigning(undefined)}>
          <p className="drawer-lead">勾选一个或多个角色。生效权限是并集，不会互相覆盖。</p>
          <RolePicker roles={roles} selectedIds={assignRoleIds} onChange={setAssignRoleIds} />
          <div className="form-actions" style={{ marginTop: 20 }}>
            <button type="button" className="button ghost" onClick={() => setAssigning(undefined)}>取消</button>
            <button type="button" className="button primary" disabled={saving || !assignRoleIds.length} onClick={() => void saveAssign()}>
              {saving ? '保存中…' : '保存角色'}
            </button>
          </div>
        </Drawer>
      )}
    </>
  )
}

function RolePicker({
  roles,
  selectedIds,
  onChange,
}: {
  roles: Role[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <div className="role-picker">
      {roles.map((role) => {
        const on = selectedIds.includes(role.id)
        return (
          <button
            key={role.id}
            type="button"
            className={`role-pick ${on ? 'on' : ''}`}
            aria-pressed={on}
            onClick={() => onChange(on ? selectedIds.filter((id) => id !== role.id) : [...selectedIds, role.id])}
          >
            <span className="switch-track" aria-hidden="true" />
            <span>
              <strong>{role.name}</strong>
              <small>{role.description || (role.isSystem ? '系统角色' : role.code)}</small>
            </span>
          </button>
        )
      })}
    </div>
  )
}
