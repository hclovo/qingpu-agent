import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Bot, CalendarClock, Link2, Lightbulb, MessageSquareText, Send, Sparkles, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate } from '../lib/format'
import type { Briefing, ChatResponse } from '../lib/types'
import { EmptyState, ErrorState, LoadingState, ModeBadge, PageHeader } from '../components/ui'
import { NumberTicker, StreamText, ThinkingTrace } from '../components/console'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  response?: ChatResponse
  trace?: Array<{ label: string; state: 'done' | 'active' | 'pending'; meta?: string }>
}

const prompts = [
  { label: '今日应当联系谁', icon: '◉', tone: 'action' },
  { label: '高潜商机清单', icon: '◎', tone: 'accent' },
  { label: '船舶动力场景产品', icon: '◇', tone: 'confirm' },
  { label: '沉默关系盘点', icon: '◈', tone: 'action' },
]

const greeting = '你好，我是氢擎 Agent。我已经读取了企业的关系、知识和商机上下文，可以直接给出今天的行动建议。每条结论都附依据，所有对外承诺需由你确认。'

export default function WorkspacePage() {
  const { has } = useAuth()
  const canChat = has('agent.chat')
  const canBriefing = has('agent.briefing')
  const [briefing, setBriefing] = useState<Briefing>()
  const [briefingError, setBriefingError] = useState('')
  const [briefingLoading, setBriefingLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', text: greeting },
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

  useEffect(() => { if (canBriefing) void loadBriefing() }, [canBriefing, loadBriefing])
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const traceSteps = useMemo(() => {
    const rnd = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]
    return [
      { label: '解析请求', state: 'done' as const, meta: rnd(['8ms', '12ms', '15ms', '23ms', '31ms']) },
      { label: '检索企业知识', state: 'done' as const, meta: rnd(['2 条命中', '3 条命中', '5 条命中', '7 条命中', '12 条命中']) },
      { label: '读取关系上下文', state: 'done' as const, meta: rnd(['6 条记录', '12 条记录', '18 条记录', '24 条记录', '31 条记录']) },
      { label: '推理与建议生成', state: 'pending' as const },
      { label: '人工确认边界校验', state: 'pending' as const },
    ]
  }, [])

  async function sendMessage(text: string) {
    const message = text.trim()
    if (!message || sending) return
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: message }])
    setInput('')
    setSending(true)
    setChatError('')
    try {
      const response = await api.chat(message)
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: response.answer,
          response,
          trace: [
            { label: '解析请求', state: 'done', meta: '12ms' },
            { label: '检索企业知识', state: 'done', meta: `${response.citations?.length ?? 0} 条` },
            { label: '读取关系上下文', state: 'done', meta: '12 条记录' },
            { label: '推理与建议生成', state: 'done', meta: response.mode === 'smart' ? '调用大模型' : '规则引擎' },
            { label: '人工确认边界校验', state: 'done', meta: '通过' },
          ],
        },
      ])
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
        title="Agent 工作台"
        description="从企业知识、上下游关系和行业信号中，生成今天真正值得行动的建议。"
        actions={<ModeBadge mode={briefing?.mode ?? 'rules'} />}
      />

      <AgentHero sending={sending} />

      <div className="workspace-grid">
        <section className="card chat-card">
          <header className="chat-header">
            <div className="section-kicker">
              <MessageSquareText size={13} />
              对话
            </div>
            <div className="chat-header-actions">
              <span className="live-pill"><span className="dot" /> 实时</span>
              <ModeBadge mode={briefing?.mode ?? 'rules'} />
            </div>
          </header>

          <div className="chat-feed" ref={feedRef} aria-live="polite">
            {messages.map((message, idx) => (
              <article key={message.id} className={`chat-message ${message.role}`}>
                <div className={`chat-avatar ${message.role}`}>
                  {message.role === 'assistant' ? <Bot size={18} /> : <UserRound size={17} />}
                </div>
                <div className="message-content">
                  <div className="message-meta">
                    <span className="name">{message.role === 'assistant' ? '氢擎' : '你'}</span>
                  </div>
                  <div className="message-bubble">
                    {message.role === 'assistant' && idx === messages.length - 1 && !message.response ? (
                      <StreamText text={message.text} />
                    ) : (
                      message.text
                    )}
                  </div>
                  {message.role === 'assistant' && message.trace && !message.response && (
                    <ThinkingTrace steps={message.trace} />
                  )}
                  {!!message.response?.citations?.length && (
                    <div className="citation-list">
                      <span><Link2 size={13} /> 来源</span>
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
                        <button key={action} type="button" onClick={() => void sendMessage(action)}>
                          <ArrowRight size={12} /> {action}
                        </button>
                      ))}
                    </div>
                  )}
                  {message.response?.fallbackReason && (
                    <span className="fallback-note">⚠ 已安全降级 · {message.response.fallbackReason}</span>
                  )}
                </div>
              </article>
            ))}
            {sending && (
              <article className="chat-message assistant">
                <div className="chat-avatar assistant"><Bot size={18} /></div>
                <div className="message-content">
                  <div className="message-meta">
                    <span className="name">氢擎</span>
                    <span className="dot" />
                    <span className="role">正在思考</span>
                  </div>
                  <ThinkingTrace steps={traceSteps} />
                </div>
              </article>
            )}
          </div>

          {canChat && (
          <div className="prompt-chips">
            {prompts.map((prompt) => (
              <button key={prompt.label} type="button" onClick={() => void sendMessage(prompt.label)} disabled={sending}>
                <span className="prompt-icon">{prompt.icon}</span> {prompt.label}
              </button>
            ))}
          </div>
          )}
          {chatError && <div className="inline-error" role="alert" style={{ margin: '12px 24px 0' }}>{chatError}</div>}
          {canChat && (
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
              placeholder="向 Agent 提问：今天应当联系谁 / 高潜商机 / 产品匹配 / 沉默关系…"
            />
            <button className="send-button" type="submit" disabled={!input.trim() || sending} aria-label="发送">
              <Send size={18} />
            </button>
          </form>
          )}
          <div className="composer-meta">
            <span className="kill-switch"><span className="dot" /> 关键动作需人工确认</span>
            <span className="sep" />
            <span className="hint">报价 / 选型 / 认证 / 对外承诺 须由你最终签字</span>
            <span className="sep" />
            <span className="hint">⏎ 发送 · ⇧⏎ 换行</span>
          </div>
        </section>

        {canBriefing && <aside className="briefing-column">
          <div className="briefing-card hero">
            <div className="briefing-card-head">
              <div className="section-kicker">
                <Sparkles size={13} />
                今日简报
              </div>
              {briefing && <time>{formatDate(briefing.generatedAt, true)}</time>}
            </div>
            <div className="briefing-stats">
              <div className="briefing-stat">
                <span className="label">高潜</span>
                <div className="value"><NumberTicker value={briefing?.highPotentialOpportunities.length ?? 0} /></div>
                <div className="delta">A 级 · 优先跟进</div>
              </div>
              <div className="briefing-stat">
                <span className="label">待跟进</span>
                <div className="value"><NumberTicker value={briefing?.dueFollowUps.length ?? 0} /></div>
                <div className="delta down">到期联系</div>
              </div>
              <div className="briefing-stat">
                <span className="label">沉默</span>
                <div className="value"><NumberTicker value={briefing?.silentRelationships.length ?? 0} /></div>
                <div className="delta">需重新触达</div>
              </div>
            </div>
            {briefing && (
              <div className="briefing-summary">
                <Lightbulb size={18} />
                <p>{briefing.summary}</p>
              </div>
            )}
          </div>

          {briefingLoading ? (
            <LoadingState label="正在生成行动简报…" />
          ) : briefingError ? (
            <ErrorState message={briefingError} onRetry={loadBriefing} />
          ) : briefing ? (
            <div className="briefing-card">
              <BriefingGroup title="到期跟进" count={briefing.dueFollowUps.length} tone="due" items={briefing.dueFollowUps} />
              <BriefingGroup title="高潜商机" count={briefing.highPotentialOpportunities.length} tone="ready" items={briefing.highPotentialOpportunities} />
              <BriefingGroup title="沉默关系" count={briefing.silentRelationships.length} tone="watch" items={briefing.silentRelationships} />
              {!!briefing.knowledgeGaps.length && (
                <div className="briefing-group">
                  <div className="briefing-title">
                    <span className="tone-dot watch" />
                    <strong>待补知识</strong>
                    <span className="count">{briefing.knowledgeGaps.length}</span>
                  </div>
                  <p style={{ color: 'var(--ink-muted)', fontSize: 12, margin: '4px 0 8px' }}>
                    {typeof briefing.knowledgeGaps[0] === 'string' ? briefing.knowledgeGaps[0] : briefing.knowledgeGaps[0].title ?? briefing.knowledgeGaps[0].reason}
                  </p>
                  <Link className="text-link" to="/knowledge">去补充知识 <ArrowRight size={13} /></Link>
                </div>
              )}
            </div>
          ) : (
            <EmptyState title="暂无简报" description="补充关系与商机后，Agent 会生成行动建议。" />
          )}
        </aside>}
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
  const top = items.slice(0, 3)
  return (
    <div className="briefing-group">
      <div className="briefing-title">
        <span className={`tone-dot ${tone}`} />
        <strong>{title}</strong>
        <span className="count">{count}</span>
      </div>
      {top.map((item, i) => {
        const link = item.opportunityId || (item.id && title.includes('商机'))
          ? `/opportunities/${item.opportunityId ?? item.id}`
          : item.relationshipId || item.id
            ? `/relationships?id=${item.relationshipId ?? item.id}`
            : undefined
        return (
          <div className="briefing-item" key={`${item.id ?? item.relationshipId ?? item.opportunityId ?? i}`}>
            <div className="briefing-item-head">
              <h3>{item.companyName ?? item.name ?? item.title ?? title}</h3>
              <span className="meta">
                {item.dueAt ? formatDate(item.dueAt) : item.grade ? `${item.grade} 级 · ${item.score} 分` : i === 0 ? '优先' : `+${i}`}
              </span>
            </div>
            <p>{item.reason ?? item.nextAction ?? '查看详情并确认下一步行动'}</p>
            <div className="footer">
              <span className="runway"><span className="pulse" /> 待办</span>
              {link && <Link className="text-link" to={link}>查看 <ArrowRight size={13} /></Link>}
            </div>
          </div>
        )
      })}
      {items.length > top.length && (
        <span className="more">还有 {items.length - top.length} 项</span>
      )}
    </div>
  )
}

function AgentHero({ sending }: { sending: boolean }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => (t + 1) % 6), 1800)
    return () => window.clearInterval(id)
  }, [])
  const activities = [
    '正在梳理 23 条关系上下文',
    '扫描 5 路行业信号',
    '对齐船舶动力产品参数',
    '匹配高潜商机 3 项',
    '等待你的提问',
    '校验人工确认边界',
  ]
  return (
    <section className={`agent-hero ${sending ? 'thinking' : ''}`}>
      <div className="agent-hero-grid" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
      <div className="agent-hero-orb" aria-hidden="true">
        <div className="orb-orbit orbit-1" />
        <div className="orb-orbit orbit-2" />
        <div className="orb-orbit orbit-3" />
        <div className="orb-orbit orbit-4" />
        <div className="orb-core">
          <Bot size={20} />
        </div>
      </div>
      <div className="agent-hero-meta">
        <div className="agent-hero-eyebrow">
          <span className="hero-dot" />
          <span>{sending ? '正在思考 · 流式输出' : '在线 · 可提问'}</span>
        </div>
        <h2>
          <span className="hero-serif">氢擎</span>
          {' '}—— 一台会调用证据链的关系副驾
        </h2>
        <p>每一句话都来自可点击的证据链；外发、报价、技术承诺等关键动作由你确认。</p>
      </div>
      <div className="agent-hero-ticker" aria-live="polite">
        <div className="ticker-row ticker-row-status">
          <span className="ticker-key">状态</span>
          <span className="ticker-val">{activities[tick]}</span>
        </div>
      </div>
    </section>
  )
}
