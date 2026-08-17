import { FormEvent, useCallback, useEffect, useState } from 'react'
import { ArrowRight, Building2, ExternalLink, Radar, Search, SlidersHorizontal, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { formatDate, stageLabels } from '../lib/format'
import type { DiscoverResponse, Opportunity } from '../lib/types'
import { Drawer, EmptyState, ErrorState, LoadingState, ModeBadge, PageHeader, StatusBadge } from '../components/ui'

const stages = Object.entries(stageLabels)

export default function OpportunitiesPage() {
  const [items, setItems] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [filters, setFilters] = useState({ q: '', industry: '', grade: '', stage: '' })

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setItems(await api.opportunities(filters)) }
    catch (err) { setError(err instanceof Error ? err.message : '加载商机失败') }
    finally { setLoading(false) }
  }, [filters])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer) }, [load])

  const activeFilters = Object.values(filters).filter(Boolean).length
  return (
    <>
      <PageHeader
        eyebrow="OPPORTUNITY RADAR"
        title="商机雷达"
        description="发现、筛选并核验氢能产业信号，把注意力集中在最值得跟进的机会。"
        actions={<><button className="button secondary" type="button" onClick={() => setDiscoverOpen(true)}><Sparkles size={17} /> Agent 自动发现</button><Link className="button primary" to="/analyze">研判新信号 <ArrowRight size={16} /></Link></>}
      />
      <section className="card opportunities-card">
        <div className="opportunity-filters">
          <label className="search-control"><Search size={16} /><input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="搜索企业、标题、地区或信号" /></label>
          <label><span className="sr-only">行业</span><select value={filters.industry} onChange={(event) => setFilters((current) => ({ ...current, industry: event.target.value }))}><option value="">全部行业</option><option>商用车</option><option>船舶航运</option><option>轨道交通</option><option>工业制氢</option><option>能源化工</option><option>物流运输</option><option>产业园区</option></select></label>
          <label><span className="sr-only">等级</span><select value={filters.grade} onChange={(event) => setFilters((current) => ({ ...current, grade: event.target.value }))}><option value="">全部等级</option><option value="A">A级 · 高潜</option><option value="B">B级 · 重点培育</option><option value="C">C级 · 持续观察</option><option value="D">D级 · 低优先级</option></select></label>
          <label><span className="sr-only">阶段</span><select value={filters.stage} onChange={(event) => setFilters((current) => ({ ...current, stage: event.target.value }))}><option value="">全部阶段</option>{stages.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          {activeFilters > 0 && <button className="filter-reset" type="button" onClick={() => setFilters({ q: '', industry: '', grade: '', stage: '' })}>清除 {activeFilters} 项筛选</button>}
        </div>
        {loading ? <LoadingState label="正在扫描商机信号…" /> : error ? <ErrorState message={error} onRetry={load} /> : items.length ? (
          <div className="opportunity-table-wrap"><table className="data-table"><thead><tr><th>企业与商机</th><th>行业 / 地区</th><th>信号类型</th><th>阶段</th><th>评分</th><th>更新时间</th><th><span className="sr-only">查看</span></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><Link className="opportunity-name" to={`/opportunities/${item.id}`}><span className="company-icon"><Building2 size={17} /></span><span><strong>{item.companyName}</strong><small>{item.title}</small></span></Link></td><td><strong>{item.industry}</strong><small>{item.region}</small></td><td><StatusBadge value={item.signalType} label={signalLabel(item.signalType)} /></td><td><StatusBadge value={item.stage} label={stageLabels[item.stage] ?? item.stage} /></td><td><div className="score-cell"><span className={`grade-badge grade-${item.grade}`}>{item.grade}</span><strong>{item.score}</strong><small>/100</small></div></td><td>{formatDate(item.updatedAt)}</td><td><Link className="row-arrow" to={`/opportunities/${item.id}`} aria-label={`查看 ${item.companyName}`}><ArrowRight size={17} /></Link></td></tr>)}</tbody></table></div>
        ) : <EmptyState title="没有匹配的商机" description="调整筛选条件，或让 Agent 发现新的候选信号。" action={<button className="button secondary small" type="button" onClick={() => setDiscoverOpen(true)}><Radar size={15} /> 自动发现</button>} />}
      </section>
      {discoverOpen && <Drawer title="Agent 自动发现" subtitle="公开候选信息一律标记为待核验，不会自动对外联系" onClose={() => setDiscoverOpen(false)}><DiscoverPanel /></Drawer>}
    </>
  )
}

function DiscoverPanel() {
  const [result, setResult] = useState<DiscoverResponse>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    setLoading(true); setError(''); setResult(undefined)
    try { setResult(await api.discover({ industry: String(form.get('industry') ?? ''), region: String(form.get('region') ?? ''), keywords: String(form.get('keywords') ?? '') })) }
    catch (err) { setError(err instanceof Error ? err.message : '发现任务失败') }
    finally { setLoading(false) }
  }
  return <div className="discover-panel">
    <form className="discover-form" onSubmit={submit}>
      <label><span>目标行业</span><select name="industry"><option value="">不限行业</option><option>商用车</option><option>船舶航运</option><option>工业制氢</option><option>轨道交通</option><option>能源化工</option></select></label>
      <label><span>目标地区</span><input name="region" placeholder="如：长三角 / 京津冀" /></label>
      <label className="full"><span>场景关键词</span><input name="keywords" placeholder="如：绿色船舶、重卡替换、PEM 制氢示范" /></label>
      <button className="button primary full" type="submit" disabled={loading}><Radar size={16} /> {loading ? '正在搜索与研判…' : '开始发现候选信号'}</button>
    </form>
    {error && <ErrorState message={error} />}
    {loading && <LoadingState label="Agent 正在发现公开信号…" />}
    {result && <div className="discover-results"><div className="discovery-notice"><ModeBadge mode={result.mode} /><p>{result.notice}</p></div>{result.candidates.length ? result.candidates.map((candidate, index) => { const sourceUrl = candidate.sourceUrl ?? candidate.evidence?.[0]?.url; const occurredAt = candidate.occurredAt ?? candidate.evidence?.[0]?.occurredAt; const confidence = candidate.confidence ?? candidate.evidence?.[0]?.confidence; return <article className="candidate-card" key={candidate.id ?? `${candidate.companyName}-${index}`}><div className="candidate-top"><span>待核验候选 {String(index + 1).padStart(2, '0')}</span>{confidence !== undefined && <small>置信度 {typeof confidence === 'number' ? `${Math.round(confidence * (confidence <= 1 ? 100 : 1))}%` : confidence}</small>}</div><h3>{candidate.companyName}</h3><strong>{candidate.title}</strong><p>{candidate.signal ?? candidate.summary}</p><div className="candidate-meta"><span>{candidate.industry ?? '行业待核验'}</span><span>{candidate.region ?? '地区待核验'}</span>{occurredAt && <span>{formatDate(occurredAt)}</span>}</div><div className="candidate-actions">{sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-link">查看来源 <ExternalLink size={13} /></a>}<Link className="button secondary small" to="/analyze" state={{ candidate: { ...candidate, sourceUrl, occurredAt } }}>进入研判 <ArrowRight size={14} /></Link></div></article> }) : <EmptyState title="未发现候选信号" description="尝试调整行业、地区或场景关键词。" />}</div>}
  </div>
}

function signalLabel(value: string) {
  const labels: Record<string, string> = { procurement: '采购', project: '项目', policy: '政策', operation: '运营', partnership: '合作' }
  return labels[value] ?? value
}
