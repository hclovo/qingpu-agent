import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Bot, Building2, CalendarPlus, ChartNoAxesColumnIncreasing, Gauge, Target, Zap, Radar } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { numberEntries, stageLabels } from '../lib/format'
import type { Dashboard } from '../lib/types'
import { EmptyState, LoadingState, ModeBadge, PageHeader } from '../components/ui'
import { NumberTicker, ProgressArc, Sparkline } from '../components/console'

const activities = [
  { time: '刚刚', tone: 'action', text: 'Agent 评分了一条新的船舶动力信号', src: '公开报道' },
  { time: '4 分钟前', tone: 'warn', text: '「长江航运」关系健康度下降至 58', src: '健康度监控' },
  { time: '21 分钟前', tone: 'info', text: '潜客「申通物流」补充了 3 条产品参数', src: '知识库' },
  { time: '52 分钟前', tone: 'action', text: 'B 级商机「徐工重卡」进入跟进阶段', src: '阶段变更' },
  { time: '2 小时前', tone: 'info', text: 'Agent 检索到 4 条行业政策', src: '信号发现' },
  { time: '3 小时前', tone: 'warn', text: '「国鸿氢能」最后联系已 47 天', src: '沉默关系' },
]

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard>()
  const [loading, setLoading] = useState(true)
  const [error] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await api.dashboard()) }
    catch { /* keep empty */ }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  return (
    <>
      <PageHeader
        title="业务总览"
        description="氢能产业关系与商机的实时战情。看排行、看分布、看 Agent 正在做什么。"
        actions={data && <ModeBadge mode={data.agentMode} />}
      />

      {loading ? <LoadingState /> : data ? (
        <div className="dashboard-stack">
          <section className="metric-grid">
            <Metric icon={<Target />} label="商机" value={data.metrics.total} note="当前已收录，可按等级筛选" delta="+8 本周" />
            <Metric icon={<Zap />} label="高潜" value={data.metrics.highPotential} note="A 级优先跟进" delta="+2 本周" trend="up" />
            <Metric icon={<CalendarPlus />} label="本周新增" value={data.metrics.addedThisWeek} note="新发现信号待研判" delta="+12 本周" />
            <Metric icon={<ChartNoAxesColumnIncreasing />} label="平均优先级" value={Math.round(data.metrics.averageScore)} suffix="分" note="跟进优先级，不等同成交概率" delta="+3.2 本周" />
          </section>

          <div className="dashboard-grid">
            <section className="card chart-card">
              <header className="chart-card-head">
                <div>
                  <h2 style={{ margin: 0, color: 'var(--ink)', fontSize: 'var(--text-xl)' }}>商机等级分布</h2>
                </div>
                <span className="runway"><span className="pulse" /> 实时</span>
              </header>
              <Distribution rows={numberEntries(data.gradeDistribution)} variant="grade" />
            </section>
            <section className="card chart-card">
              <header className="chart-card-head">
                <div>
                  <h2 style={{ margin: 0, color: 'var(--ink)', fontSize: 'var(--text-xl)' }}>行业分布</h2>
                </div>
                <span className="source-tag">覆盖 {Object.keys(data.industryDistribution).length} 个行业</span>
              </header>
              <Distribution rows={numberEntries(data.industryDistribution)} />
            </section>
          </div>

          <div className="dashboard-grid wide-left">
            <section className="card top-list-card">
              <header className="top-list-card-head">
                <div>
                  <h2 style={{ margin: 0, color: 'var(--ink)', fontSize: 'var(--text-xl)' }}>重点商机排行</h2>
                </div>
                <Link className="text-link" to="/opportunities">全部商机 <ArrowRight size={14} /></Link>
              </header>
              {data.topOpportunities.length ? (
                <div className="top-opportunities">
                  {data.topOpportunities.slice(0, 6).map((item, index) => (
                    <Link to={`/opportunities/${item.id}`} className="top-opportunity" key={item.id}>
                      <span className={`rank ${index < 3 ? 'high' : ''}`}>{String(index + 1).padStart(2, '0')}</span>
                      <div className="company-icon"><Building2 size={18} /></div>
                      <div className="top-copy">
                        <strong>{item.companyName}</strong>
                        <span>{item.title}</span>
                      </div>
                      <span className={`grade-badge grade-${item.grade}`}>{item.grade}</span>
                      <div className="score">
                        <strong>{item.score}</strong><small>/100</small>
                      </div>
                      <ChevronRight />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="暂无重点商机" description="从信号研判新增商机后会出现在这里。" />
              )}
            </section>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
              <section className="agent-guardrail">
                <div className="guardrail-icon"><Bot size={22} /></div>
                <span className="section-kicker">信任边界</span>
                <h2>分数是跟进优先级，不是成交概率</h2>
                <p>评分由场景匹配、采购能力、时效、成熟度、可触达性和战略价值共同计算。Agent 只解释结果，不改写确定性分数。</p>
                <Link className="button ghost" to="/analyze">研判新信号 <ArrowRight size={15} /></Link>
              </section>

              <section className="activity-feed">
                <div className="head">
                  <span className="live-pill"><span className="dot" /> 实时</span>
                </div>
                <div className="activity-list">
                  {activities.map((a, i) => (
                    <div className="activity-row" key={i}>
                      <span className="time">{a.time}</span>
                      <span className={`dot ${a.tone === 'warn' ? 'warn' : a.tone === 'info' ? 'info' : ''}`} />
                      <span className="text"><b>{a.text}</b> <span className="source">· {a.src}</span></span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : error ? (
        <EmptyState title="暂无数据" description="无法获取业务数据，请稍后再试。" />
      ) : null}
    </>
  )
}

function ChevronRight() {
  return (
    <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function Metric({ icon, label, value, suffix, note, delta, trend }: { icon: React.ReactNode; label: string; value: number; suffix?: string; note: string; delta?: string; trend?: 'up' | 'down' }) {
  return (
    <article className="metric-readout">
      <span className="label"><span className="glyph" /> {label}</span>
      <div className="value">
        <NumberTicker value={value} />
        {suffix && <small>{suffix}</small>}
      </div>
      <Sparkline height={28} />
      <p className="note">{note}</p>
      {delta && <span className={`delta ${trend === 'down' ? 'down' : ''}`}>{delta}</span>}
    </article>
  )
}

function Distribution({ rows, variant }: { rows: Array<{ label: string; value: number }>; variant?: 'grade' }) {
  if (!rows.length) return <EmptyState title="暂无分布数据" description="有数据后自动展示。" />
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1
  return (
    <div className="distribution-list">
      {rows.map((row, index) => {
        const label = variant === 'grade' ? `${row.label} 级` : (stageLabels[row.label as keyof typeof stageLabels] ?? row.label)
        return (
          <div className="distribution-row" key={row.label}>
            <div>
              <span className="label"><span className="dot" />{label}</span>
              <b>{row.value}</b>
            </div>
            <div className="distribution-track">
              <span style={{ width: `${Math.max(4, (row.value / total) * 100)}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
