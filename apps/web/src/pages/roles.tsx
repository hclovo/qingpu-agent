import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Plus, Shield, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Permission, PermissionCatalogGroup, Role } from '../lib/types'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui'

type RoleDraft = {
  name: string
  description: string
  permissions: Permission[]
}

export default function RolesPage() {
  const { has } = useAuth()
  const canManage = has('roles.manage')
  const [roles, setRoles] = useState<Role[]>([])
  const [catalog, setCatalog] = useState<PermissionCatalogGroup[]>([])
  const [drafts, setDrafts] = useState<Record<string, RoleDraft>>({})
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async (preferId?: string) => {
    setLoading(true)
    setError('')
    try {
      const [roleRows, groups] = await Promise.all([api.roles(), api.permissionCatalog()])
      setRoles(roleRows)
      setCatalog(groups)
      setDrafts(Object.fromEntries(roleRows.map((role) => [role.id, toDraft(role)])))
      setSelectedId((current) => preferId || (roleRows.some((role) => role.id === current) ? current : roleRows[0]?.id ?? ''))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载角色失败')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const selected = roles.find((role) => role.id === selectedId)
  const draft = selected ? drafts[selected.id] : undefined
  const dirty = Boolean(selected && draft && !sameDraft(draft, selected))

  function updateDraft(roleId: string, patch: Partial<RoleDraft>) {
    setDrafts((current) => ({
      ...current,
      [roleId]: { ...(current[roleId] ?? { name: '', description: '', permissions: [] }), ...patch },
    }))
  }

  function toggle(roleId: string, code: Permission) {
    if (!canManage) return
    const current = drafts[roleId]?.permissions ?? []
    const next = new Set(current)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    updateDraft(roleId, { permissions: [...next] })
  }

  function toggleGroup(roleId: string, codes: Permission[]) {
    if (!canManage) return
    const current = new Set(drafts[roleId]?.permissions ?? [])
    const allOn = codes.every((code) => current.has(code))
    for (const code of codes) {
      if (allOn) current.delete(code)
      else current.add(code)
    }
    updateDraft(roleId, { permissions: [...current] })
  }

  async function saveRole() {
    if (!selected || !draft) return
    setSaving(true)
    setFormError('')
    try {
      const updated = await api.updateRole(selected.id, {
        name: draft.name,
        description: draft.description,
        permissionCodes: draft.permissions,
      })
      setRoles((current) => current.map((role) => role.id === updated.id ? updated : role))
      setDrafts((current) => ({ ...current, [updated.id]: toDraft(updated) }))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存角色失败')
    } finally {
      setSaving(false)
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setFormError('')
    try {
      const created = await api.createRole({
        code: String(form.get('code')),
        name: String(form.get('name')),
        description: String(form.get('description') ?? ''),
        copyFromRoleId: String(form.get('copyFromRoleId') ?? '') || undefined,
      })
      setCreating(false)
      await load(created.id)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '创建角色失败')
    } finally {
      setSaving(false)
    }
  }

  async function remove(role: Role) {
    if (!window.confirm(`删除角色「${role.name}」？已分配该角色的用户需先改派。`)) return
    setFormError('')
    try {
      await api.deleteRole(role.id)
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '删除失败')
    }
  }

  const selectedCount = draft?.permissions.length ?? 0
  const catalogCount = useMemo(() => catalog.reduce((sum, group) => sum + group.items.length, 0), [catalog])

  return (
    <>
      <PageHeader
        title="角色与权限"
        description="先选左侧角色，再按能力分组开关权限。能力码由产品固定，管理员只负责组包。"
        actions={canManage ? (
          <button className="button primary" type="button" onClick={() => setCreating((value) => !value)}>
            <Plus size={15} /> {creating ? '取消新建' : '新建角色'}
          </button>
        ) : undefined}
      />
      {formError && <div className="inline-error" role="alert">{formError}</div>}
      {creating && canManage && (
        <form className="card form-grid user-create-form" onSubmit={create}>
          <label><span>编码 *</span><input required name="code" pattern="[a-z][a-z0-9_-]{1,31}" placeholder="region_east" /></label>
          <label><span>名称 *</span><input required name="name" minLength={2} placeholder="例如：大区销售" /></label>
          <label className="full"><span>说明</span><input name="description" placeholder="这个角色能做什么" /></label>
          <label className="full"><span>从角色复制</span>
            <select name="copyFromRoleId" defaultValue="">
              <option value="">空白权限，稍后勾选</option>
              {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </label>
          <div className="form-actions full">
            <button type="button" className="button ghost" onClick={() => setCreating(false)}>取消</button>
            <button type="submit" className="button primary" disabled={saving}>{saving ? '创建中…' : <><Copy size={14} /> 创建并编辑</>}</button>
          </div>
        </form>
      )}
      <section className="rbac-layout">
        {loading ? <div className="card"><LoadingState /></div> : error ? <div className="card"><ErrorState message={error} onRetry={load} /></div> : roles.length ? (
          <>
            <aside className="card role-rail" aria-label="角色列表">
              {roles.map((role) => {
                const count = (drafts[role.id]?.permissions ?? role.permissions).length
                const roleDirty = Boolean(drafts[role.id] && !sameDraft(drafts[role.id]!, role))
                return (
                  <button
                    key={role.id}
                    type="button"
                    className={`role-rail-item ${role.id === selected?.id ? 'active' : ''}`}
                    onClick={() => setSelectedId(role.id)}
                  >
                    <div>
                      <strong>{role.name}</strong>
                      <span>{role.description || role.code}</span>
                    </div>
                    <em>
                      {role.isSystem ? '系统' : '自定义'}
                      {roleDirty ? ' · 未保存' : ''}
                      <small>{count} 项能力</small>
                    </em>
                  </button>
                )
              })}
            </aside>
            {selected && draft ? (
              <div className="card role-editor">
                <header className="role-editor-head">
                  <div>
                    <div className="role-editor-title">
                      {canManage ? (
                        <input
                          className="role-name-input"
                          value={draft.name}
                          maxLength={40}
                          onChange={(event) => updateDraft(selected.id, { name: event.target.value })}
                          aria-label="角色名称"
                        />
                      ) : <h2>{selected.name}</h2>}
                      <span className={`role-flag ${selected.isSystem ? 'system' : ''}`}>{selected.isSystem ? '系统角色' : selected.code}</span>
                    </div>
                    {canManage ? (
                      <input
                        className="role-desc-input"
                        value={draft.description}
                        maxLength={200}
                        placeholder="补充这个角色的用途"
                        onChange={(event) => updateDraft(selected.id, { description: event.target.value })}
                        aria-label="角色说明"
                      />
                    ) : <p>{selected.description || '暂无说明'}</p>}
                    <p className="role-editor-meta">已开 {selectedCount} / {catalogCount} 项能力{dirty ? ' · 有未保存修改' : ''}</p>
                  </div>
                  {canManage && (
                    <div className="user-actions">
                      {!selected.isSystem && (
                        <button type="button" className="button ghost" onClick={() => void remove(selected)}>
                          <Trash2 size={14} /> 删除
                        </button>
                      )}
                      <button type="button" className="button primary" disabled={!dirty || saving || draft.name.trim().length < 2} onClick={() => void saveRole()}>
                        {saving ? '保存中…' : '保存这个角色'}
                      </button>
                    </div>
                  )}
                </header>
                <div className="perm-groups">
                  {catalog.map((group) => {
                    const codes = group.items.map((item) => item.code)
                    const onCount = codes.filter((code) => draft.permissions.includes(code)).length
                    return (
                      <section key={group.group} className="perm-group">
                        <header>
                          <div>
                            <strong>{group.group}</strong>
                            <span>{onCount} / {codes.length}</span>
                          </div>
                          {canManage && (
                            <button type="button" className="button ghost tiny" onClick={() => toggleGroup(selected.id, codes)}>
                              {onCount === codes.length ? '清空本组' : '全选本组'}
                            </button>
                          )}
                        </header>
                        <div className="perm-grid">
                          {group.items.map((item) => {
                            const on = draft.permissions.includes(item.code)
                            return (
                              <button
                                key={item.code}
                                type="button"
                                className={`perm-switch ${on ? 'on' : ''}`}
                                disabled={!canManage}
                                onClick={() => toggle(selected.id, item.code)}
                                aria-pressed={on}
                              >
                                <span className="switch-track" aria-hidden="true" />
                                <strong>{item.label}</strong>
                              </button>
                            )
                          })}
                        </div>
                      </section>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </>
        ) : <div className="card"><EmptyState title="还没有角色" description="先创建系统种子角色，或新建自定义角色。" /></div>}
      </section>
      <p className="user-hint"><Shield size={14} /> 系统角色可改名称和权限、不可删除。最后一位可管账号或角色的人，不能被这里拿掉管理能力。</p>
    </>
  )
}

function toDraft(role: Role): RoleDraft {
  return { name: role.name, description: role.description, permissions: role.permissions }
}

function sameDraft(draft: RoleDraft, role: Role) {
  return draft.name === role.name && draft.description === role.description && samePermissions(draft.permissions, role.permissions)
}

function samePermissions(left: Permission[], right: Permission[]) {
  if (left.length !== right.length) return false
  const set = new Set(left)
  return right.every((item) => set.has(item))
}
