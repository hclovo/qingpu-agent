import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, Bot, Building2, CalendarDays, CheckCircle2, ExternalLink, FileSearch, Lightbulb, MapPin, PackageCheck, Save, ShieldAlert, Target } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { displaySource, formatDate, stageLabels } from '../lib/format'
import type { Opportunity, OpportunityStage } from '../lib/types'
import { EmptyState, ErrorState, LoadingState, ModeBadge, StatusBadge } from '../components/ui'
import { NumberTicker, ProgressArc, RadarChart } from '../components/console'

export default function OpportunityDetailPage() {
  const { has } = useAuth()
  const canStage = has('opportunities.stage')
  const { id = '' } = useParams()
  const [item, setItem] = useState<Opportunity>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stage, setStage] = useState<OpportunityStage>('new')
  const [saving, setSaving] = useState(false)
  const [stageError, setStageError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { const value = await api.opportunity(id); setItem(value); setStage(value.stage) }
    catch (err) { setError(err instanceof Error ? err.message : '加载商机失败') }
    finally { setLoading(false) }
  }, [id])
  useEffect(() => { void load() }, [load])

  async function saveStage() {
    if (!item || stage === item.stage) return
    setSaving(true); setStageError('')
    try { setItem(await api.updateStage(item.id, stage)) }
    catch (err) { setStageError(err instanceof Error ? err.message : '更新阶段失败') }
    finally { setSaving(false) }
  }

  if (loading) return <LoadingState label="正在整理商机证据链…" />
  if (error) return <><Link className="back-link" to="/opportunities"><ArrowLeft size={15} /> 返回商机雷达</Link><ErrorState message={error} onRetry={load} /></>
  if (!item) return <EmptyState title="商机不存在" description="该商机可能已被移除。" />
  return <>
    <Link className="back-link" to="/opportunities"><ArrowLeft size={15} /> 返回商机雷达</Link>
    <header className="detail-hero">
      <div className="detail-hero-main">
        <div className="detail-badges">
          <span className={`grade-badge grade-${item.grade}`}>{item.grade} 级</span>
          <StatusBadge value={item.stage} label={stageLabels[item.stage]} />
          <span className={item.isDemo || item.evidence?.[0]?.kind === 'demo-simulated' ? 'source-tag demo' : 'source-tag'}>
            {displaySource(item.isDemo ? 'demo-simulated' : item.sourceType ?? item.evidence?.[0]?.kind)}
          </span>
          {item.insight?.mode && <ModeBadge mode={item.insight.mode} />}
        </div>
        <h1>{item.title}</h1>
        <div className="detail-company">
          <span><Building2 size={14} /> {item.companyName}</span>
          <span><MapPin size={14} /> {item.region}</span>
          <span><CalendarDays size={14} /> {formatDate(item.occurredAt ?? item.updatedAt)}</span>
        </div>
      </div>
      <div className="detail-score">
        <span>跟进优先级</span>
        <strong><NumberTicker value={item.score} /><small>/100</small></strong>
        <em>评分版本 v{item.scoreVersion ?? '1.0.0'}</em>
      </div>
    </header>

    <div className="opportunity-detail-layout">
      <main className="detail-main-column">
        <section className="card detail-card">
          <header className="section-header">
            <div>
              <span className="section-kicker"><FileSearch size={13} /> 需求场景</span>
              <h2>业务信号原文</h2>
            </div>
            <span className="runway"><span className="pulse" /> 已核验</span>
          </header>
          <div className="signal-facts">
            <div><span>行业</span><strong>{item.industry}</strong></div>
            <div><span>信号类型</span><strong>{signalLabel(item.signalType)}</strong></div>
            <div><span>预计规模</span><strong>{item.expectedScale ?? '待核实'}</strong></div>
          </div>
          <blockquote>{item.signal}</blockquote>
        </section>

        <section className="card detail-card">
          <header className="section-header">
            <div>
              <span className="section-kicker"><Target size={13} /> 评分拆解</span>
              <h2>六维优先级拆解</h2>
            </div>
            <small style={{ color: 'var(--ink-subtle)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>不等同成交概率</small>
          </header>
          {item.scoreBreakdown?.length ? (
            <div className="result-section-radial">
              <RadarChart
                dimensions={item.scoreBreakdown.map((d, i) => ({
                  label: d.label ?? d.name ?? d.dimension ?? d.key ?? `D${i + 1}`,
                  value: d.score,
                  max: d.maxScore ?? d.max ?? [30, 20, 20, 15, 10, 5][i] ?? 100,
                }))}
              />
              <div className="detail-score-list">
                {item.scoreBreakdown.map((dimension, index) => {
                  const max = dimension.maxScore ?? dimension.max ?? [30, 20, 20, 15, 10, 5][index] ?? 100
                  return (
                    <article key={dimension.key ?? dimension.dimension ?? dimension.name ?? index}>
                      <div className="score-dimension-title">
                        <strong>{dimension.label ?? dimension.name ?? dimension.dimension ?? dimension.key ?? `维度 ${index + 1}`}</strong>
                        <span>{dimension.score}<small>/{max}</small></span>
                      </div>
                      <div className="progress-track">
                        <span style={{ width: `${Math.min(100, Math.max(0, (dimension.score / max) * 100))}%` }} />
                      </div>
                      <p>{dimension.reason ?? dimension.reasons?.join('；') ?? '暂无解释'}</p>
                    </article>
                  )
                })}
              </div>
            </div>
          ) : <EmptyState title="暂无评分拆解" description="该条目可能来自旧数据，请重新研判。" />}
        </section>

        <section className="card detail-card">
          <header className="section-header">
            <div>
              <span className="section-kicker"><PackageCheck size={13} /> 产品匹配</span>
              <h2>推荐产品</h2>
            </div>
            <Link className="text-link" to="/products">产品知识 <ExternalLink size={12} /></Link>
          </header>
          {item.productMatches?.length ? (
            <div className="product-match-list">
              {item.productMatches.map((match, index) => (
                <article key={match.productId ?? index}>
                  <ProgressArc value={match.score ?? match.fitScore ?? 0} max={100} size={58} stroke={4} />
                  <div className="match-copy">
                    <h3>{match.productName ?? match.productModel ?? match.product ?? '推荐产品'}</h3>
                    <p>{match.reason ?? match.rationale ?? '基于当前场景与信号关键词匹配。'}</p>
                    {!!match.matchedOn?.length && <div className="tag-row">{match.matchedOn.map((tag) => <em key={tag}><CheckCircle2 size={11} />{tag}</em>)}</div>}
                    {!!match.gaps?.length && <div className="gap-note"><AlertTriangle size={13} /><span>待售前确认：{match.gaps.join('；')}</span></div>}
                  </div>
                </article>
              ))}
            </div>
          ) : <EmptyState title="暂无产品匹配" description="补充功率、场景和认证信息后重新研判。" />}
        </section>

        <section className="card detail-card">
          <header className="section-header">
            <div>
              <span className="section-kicker"><FileSearch size={13} /> 证据链</span>
              <h2>来源证据</h2>
            </div>
            <span className="source-tag">{item.evidence?.length ?? 0} 条</span>
          </header>
          {item.evidence?.length ? (
            <div className="evidence-list">
              {item.evidence.map((evidence, index) => (
                <article key={`${evidence.title}-${index}`}>
                  <div className="evidence-line">
                    <span className="evidence-no">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <h3>{evidence.title}</h3>
                      <p>{evidence.excerpt ?? '暂无证据摘录'}</p>
                      <div className="evidence-meta">
                        <span>{displaySource(evidence.sourceType ?? evidence.kind)}</span>
                        {(evidence.publishedAt ?? evidence.occurredAt) && <span>发生于 {formatDate(evidence.publishedAt ?? evidence.occurredAt)}</span>}
                        {evidence.confidence !== undefined && <span>置信度 {formatConfidence(evidence.confidence)}</span>}
                      </div>
                    </div>
                    {evidence.url && (
                      <a className="button icon-circle" href={evidence.url} target="_blank" rel="noreferrer" aria-label="打开来源">
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : <EmptyState title="暂无证据记录" description="请补充来源后再用于业务决策。" />}
        </section>
      </main>

      <aside className="detail-side-column">
        <section className="card stage-card">
          <span className="section-kicker">阶段管理</span>
          <h2>更新商机阶段</h2>
          {canStage ? (
            <>
              <select value={stage} onChange={(event) => setStage(event.target.value as OpportunityStage)}>
                {Object.entries(stageLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
              <button className="button primary full" type="button" disabled={saving || stage === item.stage} onClick={() => void saveStage()}>
                <Save size={15} /> {saving ? '保存中…' : '保存阶段'}
              </button>
              {stageError && <div className="inline-error">{stageError}</div>}
            </>
          ) : (
            <p>当前阶段：{stageLabels[item.stage] ?? item.stage}</p>
          )}
          <small>阶段变更只更新内部跟进状态，不会触达外部对象。</small>
        </section>

        <section className="card insight-card">
          <div className="insight-header">
            <div className="insight-icon"><Bot size={20} /></div>
            <div>
              <span className="section-kicker">Agent 研判</span>
              <h2>建议摘要</h2>
            </div>
            {item.insight?.mode && <ModeBadge mode={item.insight.mode} />}
          </div>
          <p className="insight-summary">{item.insight?.summary ?? '暂无 Agent 摘要。'}</p>
          {!!(item.insight?.entryPoints ?? item.insight?.talkingPoints)?.length && (
            <InsightList title="建议切入点" icon={<Lightbulb size={14} />} items={(item.insight?.entryPoints ?? item.insight?.talkingPoints)!} />
          )}
          {!!item.insight?.risks?.length && (
            <InsightList title="风险与缺口" icon={<ShieldAlert size={14} />} items={item.insight.risks} tone="risk" />
          )}
          {!!(item.insight?.suggestedActions ?? item.insight?.recommendedActions)?.length && (
            <InsightList title="下一步行动" icon={<CheckCircle2 size={14} />} items={(item.insight?.suggestedActions ?? item.insight?.recommendedActions)!} />
          )}
        </section>

        <section className="human-confirmation">
          <ShieldAlert size={18} />
          <div>
            <strong>必须人工确认</strong>
            <p>报价、产品选型、认证承诺与所有对外沟通须由业务人员复核。</p>
          </div>
        </section>
      </aside>
    </div>
  </>
}

function InsightList({ title, icon, items, tone }: { title: string; icon: React.ReactNode; items: string[]; tone?: string }) {
  return (
    <div className={`insight-list ${tone ?? ''}`}>
      <strong>{icon}{title}</strong>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  )
}
function signalLabel(value: string) { return ({ procurement: '采购需求', project: '项目规划', policy: '政策机会', operation: '运营动态', partnership: '合作意向' } as Record<string, string>)[value] ?? value }
function formatConfidence(value: string | number) { return typeof value === 'number' ? `${Math.round(value * (value <= 1 ? 100 : 1))}%` : value }
