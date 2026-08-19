import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, CalendarClock, Check, Factory, Handshake, History, MessageSquarePlus, Search, UserSearch } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { displaySource, formatDate, roleLabels } from '../lib/format'
import type { Relationship } from '../lib/types'
import { Drawer, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/ui'
import { ProgressArc } from '../components/console'

const roleTabs = [
  { value: 'all', label: '全部关系' },
  { value: 'customer', label: '客户' },
  { value: 'prospect', label: '潜客' },
  { value: 'supplier', label: '上游厂商' },
  { value: 'partner', label: '生态伙伴' },
]

export default function RelationshipsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [items, setItems] = useState<Relationship[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [role, setRole] = useState('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Relationship>()
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setItems(await api.relationships()) }
    catch (err) { setError(err instanceof Error ? err.message : '加载关系失败') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const select = useCallback(async (id: string) => {
    setDetailLoading(true)
    setSearchParams({ id })
    try { setSelected(await api.relationship(id)) }
    catch { setSelected(items.find((item) => item.id === id)) }
    finally { setDetailLoading(false) }
  }, [items, setSearchParams])

  useEffect(() => {
    const id = searchParams.get('id')
    if (!id) {
      setSelected(undefined)
      setDetailLoading(false)
      return
    }
    if (id && items.length && selected?.id !== id) void select(id)
  }, [items, searchParams, select, selected?.id])

  const filtered = useMemo(() => items.filter((item) => {
    const inRole = role === 'all' || item.role === role
    const text = `${item.name} ${item.industry ?? ''} ${item.region ?? ''}`.toLowerCase()
    return inRole && text.includes(query.trim().toLowerCase())
  }), [items, query, role])

  return (
    <>
      <PageHeader
        title="关系中心"
        description="把客户、潜客、上游厂商和伙伴的互动上下文沉淀为可行动的长期关系。"
      />
      <section className="card relationship-card">
        <div className="toolbar relationship-toolbar">
          <div className="segmented-tabs" role="tablist">
            {roleTabs.map((tab) => (
              <button key={tab.value} type="button" className={role === tab.value ? 'active' : ''} onClick={() => setRole(tab.value)}>
                {tab.label}
                <span>{tab.value === 'all' ? items.length : items.filter((item) => item.role === tab.value).length}</span>
              </button>
            ))}
          </div>
          <label className="search-control">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索企业、行业或地区" />
          </label>
        </div>
        <div className="relationship-list-head">
          <span>关系对象</span>
          <span>关系类型</span>
          <span>健康度</span>
          <span>最近联系</span>
          <span>下一步行动</span>
          <span>资料</span>
        </div>
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={load} /> : filtered.length ? (
          <div className="relationship-list">
            {filtered.map((item) => {
              const health = typeof item.healthScore === 'number' ? item.healthScore : typeof item.health === 'number' ? item.health : 0
              return (
                <button type="button" className="relationship-row" key={item.id} onClick={() => void select(item.id)}>
                  <span className="relationship-company">
                    <span className={`relation-icon role-${item.role}`}><RoleIcon role={item.role} /></span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.industry ?? '行业待补充'} · {item.region ?? '地区待补充'}</small>
                    </span>
                  </span>
                  <span><StatusBadge value={item.role} label={roleLabels[item.role] ?? item.role} /></span>
                  <span className="health-cell">
                    <div className="top"><b>{health || '--'}</b>{health ? <span>/100</span> : null}</div>
                    <div className="progress-track"><span style={{ width: `${health}%` }} /></div>
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--ink-subtle)' }}>{formatDate(item.lastContactAt)}</span>
                  <span className="next-action-cell">{item.nextAction ?? '待制定'}{item.nextActionAt && <small>{formatDate(item.nextActionAt)}</small>}</span>
                  <span><span className={(item.sourceType ?? item.sourceKind) === 'demo-simulated' ? 'source-tag demo' : 'source-tag'}>{displaySource(item.sourceType ?? item.sourceKind)}</span></span>
                </button>
              )
            })}
          </div>
        ) : <EmptyState title="没有匹配的关系" description="调整角色或搜索条件后再试。" />}
      </section>
      {(selected || detailLoading) && (
        <Drawer title={selected?.name ?? '正在加载关系…'} subtitle={selected ? `${roleLabels[selected.role] ?? selected.role} · ${selected.industry ?? '行业待补充'}` : undefined} onClose={() => setSearchParams({}, { replace: true })}>
          {detailLoading && !selected ? <LoadingState /> : selected && (
            <RelationshipDetail relationship={selected} onUpdated={(next) => {
              setSelected(next)
              setItems((current) => current.map((item) => item.id === next.id ? next : item))
            }} />
          )}
        </Drawer>
      )}
    </>
  )
}

function RelationshipDetail({ relationship, onUpdated }: { relationship: Relationship; onUpdated: (value: Relationship) => void }) {
  const { has } = useAuth()
  const canTouch = has('relationships.touch')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const health = typeof relationship.healthScore === 'number' ? relationship.healthScore : typeof relationship.health === 'number' ? relationship.health : 0
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true); setError('')
    try {
      const updated = await api.addTouchpoint(relationship.id, {
        occurredAt: String(form.get('occurredAt')),
        channel: String(form.get('channel')),
        summary: String(form.get('summary')),
        outcome: String(form.get('outcome') ?? ''),
        nextAction: String(form.get('nextAction') ?? ''),
        nextActionAt: String(form.get('nextActionAt') ?? '') || undefined,
      })
      onUpdated(updated); setShowForm(false)
    } catch (err) { setError(err instanceof Error ? err.message : '保存失败') }
    finally { setSaving(false) }
  }
  return <div className="relationship-detail">
    <section className="detail-summary-grid">
      <div>
        <span>关系健康度</span>
        <strong style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ProgressArc value={health} size={48} stroke={4} />
          {health || '--'}{health ? '/100' : ''}
        </strong>
        <small>综合健康度：互动 × 资料 × 触达</small>
      </div>
      <div>
        <span>最近联系</span>
        <strong>{formatDate(relationship.lastContactAt)}</strong>
        <small>{relationship.touchpoints?.[0]?.channel ?? '暂无渠道记录'}</small>
      </div>
      <div>
        <span>资料完整度</span>
        <strong>{relationship.dataCompleteness ?? '--'}{relationship.dataCompleteness !== undefined ? '%' : ''}</strong>
        <div className="progress-track"><span style={{ width: `${relationship.dataCompleteness ?? 0}%` }} /></div>
      </div>
      <div>
        <span>关联商机</span>
        <strong>{relationship.opportunityIds?.length ?? 0}</strong>
        <small>条有效记录</small>
      </div>
    </section>
    <section className="next-action-panel">
      <CalendarClock size={18} />
      <div>
        <span>下一步行动</span>
        <strong>{relationship.nextAction ?? '尚未制定下一步行动'}</strong>
        {relationship.nextActionAt && <small>计划日期：{formatDate(relationship.nextActionAt)}</small>}
      </div>
    </section>
    <div className="detail-section-title">
      <div><History size={16} /><h3>互动时间线</h3></div>
      {canTouch && (
        <button className="button primary small" type="button" onClick={() => setShowForm((value) => !value)}>
          <MessageSquarePlus size={14} /> 记录互动
        </button>
      )}
    </div>
    {showForm && <form className="touchpoint-form form-grid" onSubmit={submit}>
      <label><span>互动日期 *</span><input required name="occurredAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
      <label><span>渠道 *</span><select required name="channel"><option value="phone">电话</option><option value="meeting">会议</option><option value="email">邮件</option><option value="wechat">企业微信</option><option value="visit">拜访</option></select></label>
      <label className="full"><span>互动摘要 *</span><textarea required name="summary" rows={3} placeholder="记录讨论内容、对方关注点与事实信息" /></label>
      <label className="full"><span>沟通结果</span><input name="outcome" placeholder="如：对方愿意进一步讨论技术方案" /></label>
      <label className="full"><span>下一步行动</span><input name="nextAction" placeholder="如：准备船用系统案例与参数清单" /></label>
      <label><span>计划日期</span><input name="nextActionAt" type="date" /></label>
      {error && <div className="inline-error full">{error}</div>}
      <div className="form-actions full">
        <button type="button" className="button ghost" onClick={() => setShowForm(false)}>取消</button>
        <button type="submit" className="button primary" disabled={saving}>{saving ? '保存中…' : <><Check size={15} /> 保存记录</>}</button>
      </div>
    </form>}
    <div className="timeline">
      {relationship.touchpoints?.length ? relationship.touchpoints.map((touchpoint) => (
        <article key={touchpoint.id} className="timeline-item">
          <div className="timeline-dot" />
          <div>
            <time>{formatDate(touchpoint.occurredAt ?? touchpoint.contactedAt, true)} · {touchpoint.channel}</time>
            <p>{touchpoint.summary}</p>
            {touchpoint.outcome && <span>结果：{touchpoint.outcome}</span>}
            {touchpoint.nextAction && <small>下一步：{touchpoint.nextAction}</small>}
          </div>
        </article>
      )) : <EmptyState title="暂无互动记录" description="记录一次联系，Agent 才能更准确地识别关系维护节点。" />}
    </div>
  </div>
}

function RoleIcon({ role }: { role: string }) {
  if (role === 'supplier') return <Factory size={18} />
  if (role === 'partner') return <Handshake size={18} />
  if (role === 'prospect') return <UserSearch size={18} />
  return <Building2 size={18} />
}
