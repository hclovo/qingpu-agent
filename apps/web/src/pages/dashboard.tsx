import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Bot, Building2, CalendarPlus, ChartNoAxesColumnIncreasing, Gauge, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { numberEntries, stageLabels } from '../lib/format'
import type { Dashboard } from '../lib/types'
import { EmptyState, ErrorState, LoadingState, ModeBadge, PageHeader } from '../components/ui'

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await api.dashboard()) }
    catch (err) { setError(err instanceof Error ? err.message : '加载总览失败') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  return (
    <>
      <PageHeader
        eyebrow="BUSINESS OVERVIEW"
        title="业务总览"
        description="聚焦当前数据集中的关系健康度、商机结构与行动优先级。"
        actions={data && <ModeBadge mode={data.agentMode} />}
      />
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={load} /> : data ? (
        <div className="dashboard-stack">
          <section className="metric-grid">
            <Metric icon={<Target />} label="商机总数" value={data.metrics.total} note="当前已收录" tone="navy" />
            <Metric icon={<Gauge />} label="高潜商机" value={data.metrics.highPotential} note="A级优先跟进" tone="orange" />
            <Metric icon={<CalendarPlus />} label="本周新增" value={data.metrics.addedThisWeek} note="新发现信号" tone="green" />
            <Metric icon={<ChartNoAxesColumnIncreasing />} label="平均优先级" value={Math.round(data.metrics.averageScore)} suffix="分" note="不等同成交概率" tone="blue" />
          </section>
          <div className="dashboard-grid">
            <section className="card chart-card">
              <header className="section-header"><div><span className="section-kicker">优先级结构</span><h2>商机等级分布</h2></div></header>
              <Distribution rows={numberEntries(data.gradeDistribution)} variant="grade" />
            </section>
            <section className="card chart-card">
              <header className="section-header"><div><span className="section-kicker">市场覆盖</span><h2>行业分布</h2></div></header>
              <Distribution rows={numberEntries(data.industryDistribution)} />
            </section>
          </div>
          <div className="dashboard-grid wide-left">
            <section className="card top-list-card">
              <header className="section-header">
                <div><span className="section-kicker">行动队列</span><h2>重点商机排行</h2></div>
                <Link className="text-link" to="/opportunities">全部商机 <ArrowRight size={14} /></Link>
              </header>
              {data.topOpportunities.length ? (
                <div className="top-opportunities">
                  {data.topOpportunities.slice(0, 6).map((item, index) => (
                    <Link to={`/opportunities/${item.id}`} className="top-opportunity" key={item.id}>
                      <span className="rank">{String(index + 1).padStart(2, '0')}</span>
                      <div className="company-icon"><Building2 size={18} /></div>
                      <div className="top-copy"><strong>{item.companyName}</strong><span>{item.title}</span></div>
                      <span className={`grade-badge grade-${item.grade}`}>{item.grade}</span>
                      <b>{item.score}<small>分</small></b>
                      <ArrowRight size={16} />
                    </Link>
                  ))}
                </div>
              ) : <EmptyState title="暂无重点商机" description="从信号研判新增商机后会出现在这里。" />}
            </section>
            <section className="card agent-guardrail">
              <div className="guardrail-icon"><Bot size={23} /></div>
              <span className="section-kicker">可信 Agent</span>
              <h2>分数是跟进优先级，不是成交概率</h2>
              <p>评分由场景匹配、采购能力、时效、成熟度、可触达性和战略价值共同计算。Agent 只解释结果，不改写确定性分数。</p>
              <Link className="button secondary" to="/analyze">研判新信号 <ArrowRight size={15} /></Link>
            </section>
          </div>
        </div>
      ) : null}
    </>
  )
}

function Metric({ icon, label, value, suffix, note, tone }: { icon: React.ReactNode; label: string; value: number; suffix?: string; note: string; tone: string }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}<small>{suffix}</small></strong><p>{note}</p></div></article>
}

function Distribution({ rows, variant }: { rows: Array<{ label: string; value: number }>; variant?: 'grade' }) {
  if (!rows.length) return <EmptyState title="暂无分布数据" description="有数据后自动展示。" />
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1
  return <div className="distribution-list">{rows.map((row, index) => {
    const label = variant === 'grade' ? `${row.label} 级` : (stageLabels[row.label as keyof typeof stageLabels] ?? row.label)
    return <div className="distribution-row" key={row.label}><div><span>{label}</span><b>{row.value}</b></div><div className="distribution-track"><span className={`bar-${index % 5}`} style={{ width: `${Math.max(4, (row.value / total) * 100)}%` }} /></div></div>
  })}</div>
}
