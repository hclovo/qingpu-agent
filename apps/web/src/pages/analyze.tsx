import { FormEvent, useState } from 'react'
import { AlertTriangle, ArrowRight, Bot, CheckCircle2, FlaskConical, PackageCheck, RotateCcw, ShieldCheck, Target } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import type { AnalyzeInput, DiscoverCandidate, Opportunity } from '../lib/types'
import { ModeBadge, PageHeader, ProgressBar, StatusBadge } from '../components/ui'

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
      <PageHeader eyebrow="SIGNAL QUALIFICATION" title="新信号研判" description="把一段行业信息转化为可解释评分、产品匹配和人工可执行的下一步行动。" />
      <div className="analyze-layout">
        <section className="card analyze-form-card">
          <header className="section-header"><div><span className="section-kicker"><FlaskConical size={15} /> 信号输入</span><h2>描述你发现的业务信号</h2></div></header>
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
            <div className="form-guardrail full"><ShieldCheck size={19} /><div><strong>确定性评分 + Agent 解释</strong><span>模型不会改写业务规则得分；无密钥或异常时会安全降级。</span></div></div>
            {error && <div className="inline-error full">{error}</div>}
            <button className="button primary analyze-submit full" type="submit" disabled={loading}>{loading ? '正在评分、匹配与研判…' : <><Target size={17} /> 开始研判并保存商机</>}</button>
          </form>
        </section>
        <aside className="analysis-result-column">
          {result ? <AnalysisResult opportunity={result} onReset={() => setResult(undefined)} /> : <div className="analysis-placeholder"><div className="analysis-orbit"><FlaskConical size={26} /></div><h2>研判结果将在这里呈现</h2><p>你将获得跟进优先级、六维评分拆解、产品匹配、风险和下一步行动。</p><ul><li><CheckCircle2 size={16} /> 评分规则版本可追溯</li><li><CheckCircle2 size={16} /> 产品硬约束优先</li><li><CheckCircle2 size={16} /> 事实与建议明确区分</li></ul></div>}
        </aside>
      </div>
    </>
  )
}

function AnalysisResult({ opportunity, onReset }: { opportunity: Opportunity; onReset: () => void }) {
  return <div className="analysis-result">
    <section className="result-hero"><div><span>跟进优先级</span><strong>{opportunity.score}<small>/100</small></strong><StatusBadge value={opportunity.stage} label="已保存为商机" /></div><span className={`result-grade grade-${opportunity.grade}`}>{opportunity.grade}<small>级</small></span></section>
    <section className="result-section"><div className="result-heading"><Target size={17} /><h3>评分拆解</h3><small>V{opportunity.scoreVersion ?? '1.0.0'}</small></div><div className="score-breakdown">{opportunity.scoreBreakdown?.map((item, index) => { const max = item.maxScore ?? item.max ?? [30, 20, 20, 15, 10, 5][index] ?? 100; return <div key={item.key ?? item.dimension ?? item.name ?? index}><div><strong>{item.label ?? item.name ?? item.dimension ?? item.key ?? `维度 ${index + 1}`}</strong><span>{item.score}/{max}</span></div><ProgressBar value={item.score} max={max} /><p>{item.reason ?? item.reasons?.join('；')}</p></div> })}</div></section>
    <section className="result-section"><div className="result-heading"><PackageCheck size={17} /><h3>产品匹配</h3></div>{opportunity.productMatches?.length ? opportunity.productMatches.map((match, index) => <article className="match-result" key={match.productId ?? index}><div><strong>{match.productName ?? match.productModel ?? match.product ?? '推荐产品'}</strong><b>{match.score ?? match.fitScore ?? 0} 分匹配</b></div><p>{match.reason ?? match.rationale}</p>{!!match.matchedOn?.length && <span>匹配：{match.matchedOn.join(' · ')}</span>}{!!match.gaps?.length && <small><AlertTriangle size={13} /> 待确认：{match.gaps.join('；')}</small>}</article>) : <p>暂无合适产品匹配，请补充功率、场景或认证需求。</p>}</section>
    <section className="result-section insight-box"><div className="result-heading"><Bot size={17} /><h3>Agent 研判</h3>{opportunity.insight?.mode && <ModeBadge mode={opportunity.insight.mode} />}</div><p>{opportunity.insight?.summary ?? '已完成规则研判。'}</p>{!!(opportunity.insight?.entryPoints ?? opportunity.insight?.talkingPoints)?.length && <div><strong>建议切入点</strong><ul>{(opportunity.insight?.entryPoints ?? opportunity.insight?.talkingPoints)?.map((item) => <li key={item}>{item}</li>)}</ul></div>}{!!opportunity.insight?.risks?.length && <div><strong>风险与缺口</strong><ul>{opportunity.insight.risks.map((item) => <li key={item}>{item}</li>)}</ul></div>}{!!(opportunity.insight?.suggestedActions ?? opportunity.insight?.recommendedActions)?.length && <div><strong>下一步行动</strong><ul>{(opportunity.insight?.suggestedActions ?? opportunity.insight?.recommendedActions)?.map((item) => <li key={item}>{item}</li>)}</ul></div>}</section>
    <div className="result-actions"><button type="button" className="button ghost" onClick={onReset}><RotateCcw size={15} /> 继续研判</button><Link className="button primary" to={`/opportunities/${opportunity.id}`}>查看完整商机 <ArrowRight size={15} /></Link></div>
  </div>
}
