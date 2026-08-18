import { useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, CheckCircle2, FileText, Gauge, Search, ShieldCheck, Waves, Zap } from 'lucide-react'
import { api } from '../lib/api'
import type { Product } from '../lib/types'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui'

export default function ProductsPage() {
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [family, setFamily] = useState('all')
  const load = useCallback(async () => { setLoading(true); setError(''); try { setItems(await api.products()) } catch (err) { setError(err instanceof Error ? err.message : '加载产品失败') } finally { setLoading(false) } }, [])
  useEffect(() => { void load() }, [load])
  const families = useMemo(() => Array.from(new Set(items.map((item) => item.family))), [items])
  const filtered = useMemo(() => items.filter((item) => {
    const text = `${item.name ?? ''} ${item.model ?? ''} ${item.family} ${item.scenarios?.join(' ') ?? ''}`.toLowerCase()
    return (family === 'all' || item.family === family) && text.includes(query.toLowerCase())
  }), [family, items, query])
  return <>
    <PageHeader title="产品知识基线" description="用于商机预筛的电堆、燃料电池系统与 PEM 制氢装备；正式选型与报价仍需售前确认。" />
    <section className="product-caution"><ShieldCheck size={18} /><p><strong>参数边界说明</strong> 产品资料用于线索预筛，关键功率、工况、寿命与认证需结合最新版本资料人工复核。</p></section>
    <section className="card products-card">
      <div className="toolbar products-toolbar">
        <div className="segmented-tabs">
          <button type="button" className={family === 'all' ? 'active' : ''} onClick={() => setFamily('all')}>全部产品 <span>{items.length}</span></button>
          {families.map((name) => (
            <button type="button" className={family === name ? 'active' : ''} onClick={() => setFamily(name)} key={name}>{name} <span>{items.filter((item) => item.family === name).length}</span></button>
          ))}
        </div>
        <label className="search-control"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索型号或适用场景" /></label>
      </div>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={load} /> : filtered.length ? (
        <div className="product-grid">
          {filtered.map((product) => (
            <article className="product-card" key={product.id}>
              <div className="product-card-top">
                <div className="product-family-icon"><ProductIcon family={product.family} /></div>
                <div>
                  <span>{product.family}</span>
                  <h2>{product.name ?? product.model ?? '未命名产品'}</h2>
                  {product.name && product.model && product.model !== product.name && <small>{product.model}</small>}
                </div>
              </div>
              {(product.description ?? product.reviewNote) && <p className="product-description">{product.description ?? product.reviewNote}</p>}
              <div className="product-specs">
                <div><Gauge size={14} /><span>额定功率</span><strong>{product.powerRange ?? (product.ratedPower ? `${product.ratedPower}${typeof product.ratedPower === 'number' ? ' kW' : ''}` : '待复核')}</strong></div>
                <div><Zap size={14} /><span>峰值功率</span><strong>{product.peakPower ? `${product.peakPower}${typeof product.peakPower === 'number' ? ' kW' : ''}` : '待确认'}</strong></div>
              </div>
              {!!product.scenarios?.length && (
                <div className="product-section">
                  <span>适用场景</span>
                  <div className="tag-row">{product.scenarios.map((item) => <em key={item}>{item}</em>)}</div>
                </div>
              )}
              {!!product.certifications?.length && (
                <div className="product-section">
                  <span>认证</span>
                  <div className="cert-list">{product.certifications.map((item) => <em key={item}><CheckCircle2 size={11} /> {item}</em>)}</div>
                </div>
              )}
              <footer><FileText size={13} /><span>{product.sourceTitle ?? product.source ?? '企业产品资料'}</span>{product.sourcePage && <small>P.{product.sourcePage}</small>}</footer>
            </article>
          ))}
        </div>
      ) : <EmptyState title="没有匹配的产品" description="尝试切换产品家族或搜索其他场景。" />}
    </section>
  </>
}

function ProductIcon({ family }: { family: string }) {
  if (family.includes('船')) return <Waves size={18} />
  if (family.includes('制氢')) return <Zap size={18} />
  if (family.includes('电堆')) return <Boxes size={18} />
  return <Gauge size={18} />
}
