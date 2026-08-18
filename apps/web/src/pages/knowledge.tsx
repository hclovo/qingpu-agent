import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpenCheck, Check, FileJson, FileText, Link2, Plus, Search, Tags, UploadCloud } from 'lucide-react'
import { api } from '../lib/api'
import { displaySource, formatDate, knowledgeStatusLabels } from '../lib/format'
import type { KnowledgeItem } from '../lib/types'
import { Drawer, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/ui'
import { NumberTicker } from '../components/console'

type KnowledgeType = 'text' | 'url' | 'file'

export default function KnowledgePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const load = useCallback(async (q?: string) => {
    setLoading(true); setError('')
    try { setItems(await api.knowledge(q)) }
    catch (err) { setError(err instanceof Error ? err.message : '加载知识库失败') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const stats = useMemo(() => ({
    ready: items.filter((item) => item.status === 'ready').length,
    review: items.filter((item) => item.status === 'review' || item.status === 'review-needed').length,
    source: new Set(items.map((item) => item.source ?? item.sourceUrl ?? item.sourcePath ?? item.sourceKind).filter(Boolean)).size,
  }), [items])

  function submitSearch(event: FormEvent) {
    event.preventDefault(); setSearch(query.trim()); void load(query.trim())
  }

  return (
    <>
      <PageHeader
        title="企业知识库"
        description="补充企业资料、网页与业务记录，让 Agent 的每个回答都有可靠上下文。"
        actions={<button type="button" className="button primary" onClick={() => setOpen(true)}><Plus size={16} /> 新增知识</button>}
      />
      <section className="knowledge-stats">
        <div><BookOpenCheck size={18} /><span>条目<strong><NumberTicker value={items.length} /></strong></span></div>
        <div><Check size={18} /><span>就绪<strong><NumberTicker value={stats.ready} /></strong></span></div>
        <div><FileText size={18} /><span>待复核<strong><NumberTicker value={stats.review} /></strong></span></div>
        <div><Link2 size={18} /><span>来源<strong><NumberTicker value={stats.source} /></strong></span></div>
      </section>
      <section className="card knowledge-card">
        <div className="toolbar">
          <form className="search-control wide" onSubmit={submitSearch}>
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="检索标题、内容、标签或来源" />
            <button type="submit">检索</button>
          </form>
          {search && <button className="filter-reset" type="button" onClick={() => { setQuery(''); setSearch(''); void load() }}>清除“{search}”</button>}
        </div>
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => load(search)} /> : items.length ? (
          <div className="knowledge-grid">
            {items.map((item) => (
              <article className="knowledge-item" key={item.id}>
                <div className={`knowledge-icon type-${item.type}`}>{item.type === 'url' ? <Link2 /> : item.type === 'file' ? <FileJson /> : <FileText />}</div>
                <div className="knowledge-main">
                  <div className="knowledge-title-line">
                    <h2>{item.title}</h2>
                    <StatusBadge value={item.status} label={knowledgeStatusLabels[item.status] ?? item.status} />
                  </div>
                  <p>{item.content || item.source || '暂无内容摘要'}</p>
                  <div className="knowledge-meta">
                    <span>{displaySource(item.sourceType ?? item.sourceKind)}</span>
                    <span>更新 {formatDate(item.updatedAt)}</span>
                    {(item.source ?? item.sourceUrl ?? item.sourcePath) && <span title={item.source ?? item.sourceUrl ?? item.sourcePath}>{item.source ?? item.sourceUrl ?? item.sourcePath}</span>}
                  </div>
                  {!!item.tags?.length && <div className="tag-row"><Tags size={12} />{item.tags.map((tag) => <em key={tag}>{tag}</em>)}</div>}
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyState title={search ? '没有匹配的知识' : '知识库还是空的'} description={search ? '尝试更换关键词，或补充新的知识条目。' : '添加文本、网页或文本类文件，为 Agent 建立企业上下文。'} action={<button className="button primary small" type="button" onClick={() => setOpen(true)}><Plus size={14} /> 新增知识</button>} />}
      </section>
      {open && <Drawer title="新增知识" subtitle="保存后即可用于检索和 Agent 上下文" onClose={() => setOpen(false)}><KnowledgeForm onCreated={(item) => { setItems((current) => [item, ...current]); setOpen(false) }} /></Drawer>}
    </>
  )
}

function KnowledgeForm({ onCreated }: { onCreated: (item: KnowledgeItem) => void }) {
  const [type, setType] = useState<KnowledgeType>('text')
  const [fileName, setFileName] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function selectFile(file?: File) {
    if (!file) return
    setError('')
    if (file.size > 2 * 1024 * 1024) { setError('文件不能超过 2MB'); return }
    try { setFileName(file.name); setFileContent(await file.text()) }
    catch { setError('无法读取该文件，请确认它是文本格式') }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const content = type === 'file' ? fileContent : String(form.get('content') ?? '')
    if (!content.trim()) { setError(type === 'file' ? '请选择文本类文件' : '请填写知识内容或 URL'); return }
    setSaving(true); setError('')
    try {
      const tags = String(form.get('tags') ?? '').split(/[,，]/).map((tag) => tag.trim()).filter(Boolean)
      const item = await api.addKnowledge({
        title: String(form.get('title')),
        content,
        type,
        source: type === 'url' ? content : type === 'file' ? fileName : String(form.get('source') ?? ''),
        tags,
        relationshipId: String(form.get('relationshipId') ?? '') || undefined,
      })
      onCreated(item)
    } catch (err) { setError(err instanceof Error ? err.message : '保存知识失败') }
    finally { setSaving(false) }
  }

  return <form className="knowledge-form" onSubmit={submit}>
    <div className="type-picker">
      <button type="button" className={type === 'text' ? 'active' : ''} onClick={() => setType('text')}><FileText size={16} /><span>文本</span></button>
      <button type="button" className={type === 'url' ? 'active' : ''} onClick={() => setType('url')}><Link2 size={16} /><span>网页 URL</span></button>
      <button type="button" className={type === 'file' ? 'active' : ''} onClick={() => setType('file')}><UploadCloud size={16} /><span>本地文件</span></button>
    </div>
    <label><span>知识标题 *</span><input required name="title" placeholder="如：2025 年船用燃料电池方案边界" /></label>
    {type === 'text' && <label><span>正文内容 *</span><textarea required name="content" rows={9} placeholder="粘贴企业资料、会议结论、产品约束等可靠事实…" /></label>}
    {type === 'url' && <label><span>网页 URL *</span><input required name="content" type="url" placeholder="https://example.com/article" /><small>系统会登记来源；外部内容始终按不可信材料处理。</small></label>}
    {type === 'file' && <label className="file-drop"><input type="file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json" onChange={(event) => void selectFile(event.target.files?.[0])} /><UploadCloud size={26} /><strong>{fileName || '选择或拖入文本类文件'}</strong><span>.txt / .md / .csv / .json，最大 2MB</span>{fileContent && <em>已读取 {fileContent.length.toLocaleString()} 字</em>}</label>}
    {type === 'text' && <label><span>来源说明</span><input name="source" placeholder="如：售前会议纪要 / 企业宣传册第 12 页" /></label>}
    <label><span>标签</span><input name="tags" placeholder="船舶, 产品参数, 2025" /><small>使用逗号分隔，便于检索与归类。</small></label>
    <label><span>关联关系 ID（可选）</span><input name="relationshipId" placeholder="用于把知识挂载到特定客户或伙伴" /></label>
    <div className="data-note"><Check size={14} /> 请勿上传密钥、未授权个人信息或未经核验的技术承诺。</div>
    {error && <div className="inline-error">{error}</div>}
    <button type="submit" className="button primary full-button" disabled={saving}>{saving ? '正在保存…' : '保存并加入 Agent 上下文'}</button>
  </form>
}
