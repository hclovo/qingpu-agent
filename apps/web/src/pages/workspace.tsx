import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Bot, CalendarClock, Lightbulb, Link2, MessageSquareText, Send, Sparkles, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { formatDate } from '../lib/format'
import type { Briefing, ChatResponse } from '../lib/types'
import { EmptyState, ErrorState, LoadingState, ModeBadge, PageHeader } from '../components/ui'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  response?: ChatResponse
}

const prompts = [
  '今天最应该联系谁？请说明原因',
  '有哪些高潜商机需要优先跟进？',
  '查找适合船舶动力场景的产品',
  '哪些关系已经较久没有联系？',
]

export default function WorkspacePage() {
  const [briefing, setBriefing] = useState<Briefing>()
  const [briefingError, setBriefingError] = useState('')
  const [briefingLoading, setBriefingLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: '你好，我是氢擎 Agent。我可以结合企业知识、关系记录和商机信号，帮助你确定今天的行动重点。所有对外沟通与技术承诺都由你最终确认。',
    },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState('')
  const feedRef = useRef<HTMLDivElement>(null)

  const loadBriefing = useCallback(async () => {
    setBriefingLoading(true)
    setBriefingError('')
    try {
      setBriefing(await api.briefing())
    } catch (error) {
      setBriefingError(error instanceof Error ? error.message : '加载简报失败')
    } finally {
      setBriefingLoading(false)
    }
  }, [])

  useEffect(() => { void loadBriefing() }, [loadBriefing])
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  async function sendMessage(text: string) {
    const message = text.trim()
    if (!message || sending) return
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: message }])
    setInput('')
    setSending(true)
    setChatError('')
    try {
      const response = await api.chat(message)
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: response.answer, response }])
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Agent 暂时无法回答')
    } finally {
      setSending(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void sendMessage(input)
  }

  return (
    <>
      <PageHeader
        eyebrow="ENTERPRISE RELATIONSHIP COPILOT"
        title="把每一次联系，变成下一次商机"
        description="从企业知识、上下游关系和行业信号中，生成今天真正值得行动的建议。"
        actions={<ModeBadge mode={briefing?.mode ?? 'rules'} />}
      />

      <div className="workspace-grid">
        <section className="card chat-card">
          <header className="section-header chat-header">
            <div>
              <span className="section-kicker"><MessageSquareText size={15} /> Agent 对话</span>
              <h2>与你的业务上下文一起思考</h2>
            </div>
            <span className="safe-label">建议生成 · 人工确认</span>
          </header>

          <div className="chat-feed" ref={feedRef} aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} className={`chat-message ${message.role}`}>
                <div className="avatar">{message.role === 'assistant' ? <Bot size={18} /> : <UserRound size={17} />}</div>
                <div className="message-content">
                  <div className="message-meta">
                    <strong>{message.role === 'assistant' ? '氢擎 Agent' : '你'}</strong>
                    {message.response?.mode && <ModeBadge mode={message.response.mode} model={message.response.model} />}
                  </div>
                  <p>{message.text}</p>
                  {!!message.response?.citations?.length && (
                    <div className="citation-list">
                      <span><Link2 size={13} /> 依据</span>
                      {message.response.citations.map((citation, index) => {
                        const title = typeof citation === 'string' ? citation : citation.title ?? citation.source ?? '来源'
                        const url = typeof citation === 'string' ? undefined : citation.url
                        return url ? <a key={`${title}-${index}`} href={url} target="_blank" rel="noreferrer">{title}</a> : <em key={`${title}-${index}`}>{title}</em>
                      })}
                    </div>
                  )}
                  {!!message.response?.suggestedActions?.length && (
                    <div className="suggestion-row">
                      {message.response.suggestedActions.slice(0, 3).map((action) => (
                        <button key={action} type="button" onClick={() => void sendMessage(action)}>{action}</button>
                      ))}
                    </div>
                  )}
                  {message.response?.fallbackReason && <small className="fallback-note">已安全降级：{message.response.fallbackReason}</small>}
                </div>
              </article>
            ))}
            {sending && (
              <article className="chat-message assistant">
                <div className="avatar"><Bot size={18} /></div>
                <div className="message-content typing"><i /><i /><i /><span>正在检索企业上下文</span></div>
              </article>
            )}
          </div>

          <div className="prompt-chips">
            {prompts.map((prompt) => <button key={prompt} type="button" onClick={() => void sendMessage(prompt)} disabled={sending}>{prompt}</button>)}
          </div>
          {chatError && <div className="inline-error" role="alert">{chatError}</div>}
          <form className="composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="agent-message">向 Agent 提问</label>
            <textarea
              id="agent-message"
              value={input}
              rows={2}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  if (input.trim()) void sendMessage(input)
                }
              }}
              placeholder="询问关系、产品、商机，或让 Agent 准备沟通提纲…"
            />
            <button className="send-button" type="submit" disabled={!input.trim() || sending} aria-label="发送">
              <Send size={19} />
            </button>
          </form>
        </section>

        <aside className="briefing-column">
          <div className="section-heading-row">
            <div>
              <span className="section-kicker"><Sparkles size={15} /> 每日简报</span>
              <h2>今日行动优先级</h2>
            </div>
            {briefing && <time>{formatDate(briefing.generatedAt, true)}</time>}
          </div>
          {briefingLoading ? <LoadingState label="正在生成行动简报…" /> : briefingError ? <ErrorState message={briefingError} onRetry={loadBriefing} /> : briefing ? (
            <>
              <div className="briefing-summary">
                <Lightbulb size={20} />
                <p>{briefing.summary}</p>
              </div>
              <BriefingGroup title="到期跟进" count={briefing.dueFollowUps.length} tone="orange" items={briefing.dueFollowUps} />
              <BriefingGroup title="高潜商机" count={briefing.highPotentialOpportunities.length} tone="green" items={briefing.highPotentialOpportunities} />
              <BriefingGroup title="沉默关系" count={briefing.silentRelationships.length} tone="blue" items={briefing.silentRelationships} />
              {!!briefing.knowledgeGaps.length && (
                <section className="briefing-group compact">
                  <div className="briefing-title"><span className="tone-dot purple" /><strong>待补知识</strong><b>{briefing.knowledgeGaps.length}</b></div>
                  <p>{typeof briefing.knowledgeGaps[0] === 'string' ? briefing.knowledgeGaps[0] : briefing.knowledgeGaps[0].title ?? briefing.knowledgeGaps[0].reason}</p>
                  <Link className="text-link" to="/knowledge">去补充知识 <ArrowRight size={14} /></Link>
                </section>
              )}
            </>
          ) : <EmptyState title="暂无简报" description="补充关系与商机后，Agent 会生成行动建议。" />}
        </aside>
      </div>
    </>
  )
}

function BriefingGroup({
  title,
  count,
  tone,
  items,
}: {
  title: string
  count: number
  tone: string
  items: Array<{ id?: string; relationshipId?: string; opportunityId?: string; title?: string; name?: string; companyName?: string; reason?: string; nextAction?: string; dueAt?: string; score?: number; grade?: string }>
}) {
  if (!items.length) return null
  const item = items[0]
  const link = item.opportunityId || (item.id && title.includes('商机'))
    ? `/opportunities/${item.opportunityId ?? item.id}`
    : item.relationshipId || item.id
      ? `/relationships?id=${item.relationshipId ?? item.id}`
      : undefined
  return (
    <section className="briefing-group">
      <div className="briefing-title">
        <span className={`tone-dot ${tone}`} />
        <strong>{title}</strong>
        <b>{count}</b>
      </div>
      <div className="briefing-item">
        <div>
          <h3>{item.companyName ?? item.name ?? item.title ?? title}</h3>
          {(item.dueAt || item.score !== undefined) && <span><CalendarClock size={13} /> {item.dueAt ? formatDate(item.dueAt) : `${item.grade ?? ''} · ${item.score} 分`}</span>}
        </div>
        <p>{item.reason ?? item.nextAction ?? '查看详情并确认下一步行动'}</p>
        {link && <Link className="text-link" to={link}>查看上下文 <ArrowRight size={14} /></Link>}
      </div>
      {items.length > 1 && <small>另有 {items.length - 1} 项待处理</small>}
    </section>
  )
}
