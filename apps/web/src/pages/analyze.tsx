import { FormEvent, useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, Bot, CheckCircle2, FlaskConical, PackageCheck, RotateCcw, ShieldCheck, Target } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import type { AnalyzeInput, DiscoverCandidate, Opportunity, ScoreDimension } from '../lib/types'
import { ModeBadge, PageHeader, StatusBadge } from '../components/ui'
import { ProgressArc, RadarChart, ThinkingTrace } from '../components/console'

export default function AnalyzePage() {
  const candidate = (useLocation().state as { candidate?: DiscoverCandidate } | null)?.candidate
  const [result, setResult] = useState<Opportunity>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    const input: AnalyzeInput = {
      companyName: String(form.get('companyName')),
      title: String(form.get('title')),
      signal: String(form.get('signal')),
      industry: String(form.get('industry')),
      region: String(form.get('region')),
      signalType: String(form.get('signalType')),
      expectedScale: String(form.get('expectedScale') ?? ''),
      maturity: String(form.get('maturity') ?? ''),
      contactability: String(form.get('contactability') ?? ''),
      sourceTitle: String(form.get('sourceTitle')),
      sourceUrl: String(form.get('sourceUrl') ?? '') || undefined,
      occurredAt: String(form.get('occurredAt')),
    }
    setLoading(true); setError('')
    try { setResult(await api.analyze(input)) }
    catch (err) { setError(err instanceof Error ? err.message : '信号研判失败') }
    finally { setLoading(false) }
  }

  return (
    <>
      <PageHeader
        title="新信号研判"
        description="把一段行业信息转化为可解释评分、产品匹配和人工可执行的下一步行动。"
        meta={<span className="runway"><span className="pulse" /> Agent 就绪</span>}
      />
      <div className="analyze-layout">
        <section className="card analyze-form-card">
          <header className="section-header">
            <div>
              <span className="section-kicker"><FlaskConical size={13} /> 信号输入</span>
              <h2>描述你发现的业务信号</h2>
            </div>
            <Link className="text-link" to="/opportunities">返回商机雷达 <ArrowRight size={13} /></Link>
          </header>
          <form className="analyze-form form-grid" onSubmit={submit}>
            <label><span>企业名称 *</span><input required name="companyName" defaultValue={candidate?.companyName} placeholder="项目主体或潜在客户" /></label>
            <label><span>行业 *</span><select required name="industry" defaultValue={candidate?.industry ?? ''}><option value="" disabled>请选择</option><option>商用车</option><option>船舶航运</option><option>轨道交通</option><option>工业制氢</option><option>能源化工</option><option>物流运输</option><option>产业园区</option><option>其他</option></select></label>
            <label className="full"><span>信号标题 *</span><input required name="title" defaultValue={candidate?.title} placeholder="概括事件与潜在需求" /></label>
            <label className="full"><span>信号正文 *</span><textarea required name="signal" defaultValue={candidate?.signal ?? candidate?.summary} rows={7} placeholder="粘贴项目、采购、政策或新闻中的事实内容。请包含数量、规模、阶段等信息。" /></label>
            <label><span>地区 *</span><input required name="region" defaultValue={candidate?.region} placeholder="如：长江经济带" /></label>
            <label><span>信号类型 *</span><select required name="signalType" defaultValue="project"><option value="procurement">采购需求</option><option value="project">项目规划</option><option value="policy">政策机会</option><option value="operation">运营动态</option><option value="partnership">合作意向</option></select></label>
            <label><span>预计规模</span><input name="expectedScale" placeholder="如：首批 3 艘，单船约 200kW" /></label>
            <label><span>项目成熟度</span><select name="maturity" defaultValue="planning"><option value="awareness">行业关注</option><option value="planning">规划中</option><option value="approved">已立项</option><option value="tendering">招标中</option><option value="pilot">试运营</option><option value="operating">运营中</option><option value="repeat-purchase">重复采购</option></select></label>
            <label><span>可触达程度</span><select name="contactability" defaultValue="public-channel"><option value="unknown">尚无渠道</option><option value="public-channel">有公开商务渠道</option><option value="known-contact">有伙伴或已知联系人</option><option value="existing-relationship">已有业务关系</option></select></label>
            <label><span>发生日期 *</span><input required name="occurredAt" type="date" defaultValue={candidate?.occurredAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)} /></label>
            <label><span>来源标题 *</span><input required name="sourceTitle" defaultValue={candidate ? 'Agent 发现候选来源' : ''} placeholder="公告、新闻或资料名称" /></label>
            <label><span>来源 URL</span><input name="sourceUrl" type="url" defaultValue={candidate?.sourceUrl} placeholder="https://…" /></label>
            <div className="form-guardrail full"><ShieldCheck size={19} /><div><strong>确定性评分 + Agent 解释</strong><span>模型不会改写业务规则得分；无密钥或异常时会安全降级到规则引擎。</span></div></div>
            {error && <div className="inline-error full">{error}</div>}
            <button className="button primary analyze-submit full" type="submit" disabled={loading}>
              {loading ? <><span className="dot-pulse" style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--action-on-bg)', display: 'inline-block', marginRight: 8 }} /> 正在评分、匹配与研判…</> : <><Target size={17} /> 开始研判并保存商机</>}
            </button>
          </form>
        </section>
        <aside className="analysis-result-column">
          {result ? (
            <AnalysisResult opportunity={result} onReset={() => setResult(undefined)} />
          ) : loading ? (
            <AnalyzingTrace />
          ) : (
            <div className="analysis-placeholder">
              <div className="analysis-orbit"><FlaskConical size={28} /></div>
              <h2>研判结果将在这里呈现</h2>
              <p>你将获得跟进优先级、六维评分拆解、产品匹配、风险和下一步行动。</p>
              <ul>
                <li><CheckCircle2 size={16} /> 评分规则版本可追溯</li>
                <li><CheckCircle2 size={16} /> 产品硬约束优先</li>
                <li><CheckCircle2 size={16} /> 事实与建议明确区分</li>
              </ul>
            </div>
          )}
        </aside>
      </div>
    </>
  )
}

function AnalyzingTrace() {
  const [step, setStep] = useState(0)
  const steps = [
    { label: '解析信号', state: 'done' as const, meta: '8ms' },
    { label: '匹配评分维度', state: 'done' as const, meta: '6 维' },
    { label: '调用产品硬约束', state: 'active' as const, meta: '进行中' },
    { label: '生成 Agent 解释', state: 'pending' as const },
    { label: '人工确认边界校验', state: 'pending' as const },
  ]
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 700)
    return () => window.clearInterval(id)
  }, [])
  const live = steps.map((s, i) => ({ ...s, state: i < step ? 'done' as const : i === step ? 'active' as const : 'pending' as const }))
  return (
    <div className="analysis-result">
      <section className="result-hero">
        <div>
          <span>分析中 · 实时</span>
          <strong style={{ fontSize: 28, color: 'var(--ink-muted)' }}>···</strong>
          <StatusBadge value="qualified" label="正在计算" />
        </div>
        <span className="result-grade grade-B" style={{ opacity: 0.5 }}>·<small>▌</small></span>
      </section>
      <section className="result-section">
        <div className="result-heading">
          <span className="section-kicker">推理过程</span>
          <h3>正在分析</h3>
          <small>{step}/{steps.length}</small>
        </div>
        <ThinkingTrace steps={live} />
      </section>
    </div>
  )
}

function AnalysisResult({ opportunity, onReset }: { opportunity: Opportunity; onReset: () => void }) {
  const breakdown = opportunity.scoreBreakdown ?? []
  const dims = breakdown.map((b, i) => {
    const max = b.maxScore ?? b.max ?? [30, 20, 20, 15, 10, 5][i] ?? 100
    return { label: b.label ?? b.name ?? b.dimension ?? b.key ?? `D${i + 1}`, value: b.score, max }
  })

  return (
    <div className="analysis-result">
      <section className="result-hero">
        <div>
          <span>跟进优先级</span>
          <strong>{opportunity.score}<small>/100</small></strong>
          <StatusBadge value={opportunity.stage} label="已保存为商机" />
        </div>
        <ProgressArc value={opportunity.score} variant={opportunity.grade} size={92} stroke={6} />
      </section>
      <section className="result-section">
        <div className="result-heading">
          <Target size={16} />
          <h3>评分拆解</h3>
          <small>评分版本 v{opportunity.scoreVersion ?? '1.0.0'}</small>
        </div>
        {dims.length > 0 ? (
          <div className="result-section-radial">
            <RadarChart dimensions={dims} />
            <div className="score-breakdown">
              {breakdown.map((item, index) => (
                <div key={item.key ?? item.dimension ?? item.name ?? index}>
                  <ScoreRow dimension={item} max={dims[index]?.max ?? 30} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--ink-muted)' }}>暂无评分维度，请配置 scoring.yml。</p>
        )}
      </section>
      <section className="result-section">
        <div className="result-heading">
          <PackageCheck size={16} />
          <h3>产品匹配</h3>
          <small>{opportunity.productMatches?.length ?? 0} 个候选</small>
        </div>
        {opportunity.productMatches?.length ? (
          opportunity.productMatches.map((match, index) => (
            <article className="match-result" key={match.productId ?? index}>
              <div>
                <strong>{match.productName ?? match.productModel ?? match.product ?? '推荐产品'}</strong>
                <b>契合度 {match.score ?? match.fitScore ?? 0}</b>
              </div>
              <p>{match.reason ?? match.rationale}</p>
              {!!match.matchedOn?.length && <span>匹配：{match.matchedOn.join(' · ')}</span>}
              {!!match.gaps?.length && <small><AlertTriangle size={13} /> 待确认：{match.gaps.join('；')}</small>}
            </article>
          ))
        ) : (
          <p style={{ color: 'var(--ink-muted)' }}>暂无合适产品匹配，请补充功率、场景或认证需求。</p>
        )}
      </section>
      <section className="result-section insight-box">
        <div className="result-heading">
          <Bot size={16} />
          <h3>Agent 研判</h3>
          {opportunity.insight?.mode && <ModeBadge mode={opportunity.insight.mode} />}
        </div>
        <p>{opportunity.insight?.summary ?? '已完成规则研判。'}</p>
        {(opportunity.insight?.entryPoints ?? opportunity.insight?.talkingPoints)?.length ? (
          <div className="insight-point">
            <strong>切入点</strong>
            <ul>{(opportunity.insight?.entryPoints ?? opportunity.insight?.talkingPoints)?.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        ) : null}
        {!!!opportunity.insight?.risks?.length ? null : (
          <div className="insight-point" style={{ color: 'var(--confirm)' }}>
            <strong>风险</strong>
            <ul>{opportunity.insight!.risks!.map((item) => <li key={item} style={{ color: 'var(--confirm)' }}>{item}</li>)}</ul>
          </div>
        )}
        {(opportunity.insight?.suggestedActions ?? opportunity.insight?.recommendedActions)?.length ? (
          <div className="insight-point">
            <strong>下一步</strong>
            <ul>{(opportunity.insight?.suggestedActions ?? opportunity.insight?.recommendedActions)?.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        ) : null}
      </section>
      <div className="result-actions">
        <button type="button" className="button ghost" onClick={onReset}><RotateCcw size={15} /> 继续研判</button>
        <Link className="button primary" to={`/opportunities/${opportunity.id}`}>查看完整商机 <ArrowRight size={15} /></Link>
      </div>
    </div>
  )
}

function ScoreRow({ dimension, max }: { dimension: ScoreDimension; max: number }) {
  const pct = Math.min(100, Math.max(0, (dimension.score / max) * 100))
  return (
    <>
      <div>
        <strong>{dimension.label ?? dimension.name ?? dimension.dimension ?? dimension.key ?? '维度'}</strong>
        <span>{dimension.score}/{max}</span>
      </div>
      <div className="progress-track">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p>{dimension.reason ?? dimension.reasons?.join('；') ?? '暂无解释'}</p>
    </>
  )
}
