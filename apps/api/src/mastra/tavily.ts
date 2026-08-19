export const TAVILY_SEARCH_URL = 'https://api.tavily.com/search'
export const TAVILY_TIMEOUT_MS = 12_000

export type TavilyTopic = 'general' | 'news' | 'finance'
export type VerticalChannel = 'tender' | 'policy' | 'industry'

export const VERTICAL_DOMAINS: Record<VerticalChannel, readonly string[]> = {
  tender: ['cebpubservice.com', 'ccgp.gov.cn', 'ggzy.gov.cn', 'bidcenter.com.cn', 'chinabidding.com.cn'],
  policy: ['nea.gov.cn', 'ndrc.gov.cn', 'miit.gov.cn', 'gov.cn'],
  industry: ['bjx.com.cn', 'in-en.com', 'gg-lb.com', 'china-nengyuan.com'],
}

export const NEWS_EXCLUDE_DOMAINS = ['wikipedia.org', 'zh.wikipedia.org', 'baike.baidu.com'] as const

const CHANNEL_QUERY_SUFFIX: Record<VerticalChannel, string> = {
  tender: '招标 采购 中标 投标',
  policy: '政策 规划 示范 补贴',
  industry: '示范项目 开工 投产 合作',
}

const NEWS_SIGNAL_PATTERN = /招标|采购|中标|示范|政策|开工|投产|合作|规划/

export type TavilyHit = {
  title: string
  url: string
  content: string
  publishedDate?: string
}

export type TavilySearchInput = {
  query: string
  /** 传入时才加 start_date。招标/政策站常缺发布日期，硬过滤会把有效页滤光。 */
  days?: number
  topic: TavilyTopic
  maxResults?: number
  includeDomains?: readonly string[]
  excludeDomains?: readonly string[]
  country?: string
}

export function startDateFromDays(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10)
}

export function enrichNewsQuery(query: string, region?: string): string {
  const withRegion = region && !query.includes(region) ? `${query} ${region}` : query
  return NEWS_SIGNAL_PATTERN.test(withRegion) ? withRegion : `${withRegion} 招标 示范项目 采购`
}

export function buildChannelQuery(query: string, channel: VerticalChannel, region?: string): string {
  return [query, region, CHANNEL_QUERY_SUFFIX[channel]].filter(Boolean).join(' ')
}

export function resolveVerticalChannels(channel: VerticalChannel | 'all' = 'all'): VerticalChannel[] {
  return channel === 'all' ? ['tender', 'policy', 'industry'] : [channel]
}

export function buildTavilyRequestBody(apiKey: string, input: TavilySearchInput, now = new Date()): Record<string, unknown> {
  const body: Record<string, unknown> = {
    api_key: apiKey,
    query: input.query,
    search_depth: 'advanced',
    max_results: input.maxResults ?? 8,
    topic: input.topic,
  }
  if (input.days != null) body.start_date = startDateFromDays(input.days, now)
  if (input.includeDomains?.length) body.include_domains = [...input.includeDomains]
  if (input.excludeDomains?.length) body.exclude_domains = [...input.excludeDomains]
  if (input.topic === 'general' && input.country) body.country = input.country
  return body
}

function parseHits(body: { results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }> }): TavilyHit[] {
  return (body.results ?? [])
    .filter((item): item is { title: string; url: string; content?: string; published_date?: string } => Boolean(item.title && item.url))
    .map((item) => ({
      title: item.title,
      url: item.url,
      content: item.content ?? '',
      publishedDate: item.published_date,
    }))
}

export async function searchTavily(apiKey: string, input: TavilySearchInput): Promise<TavilyHit[]> {
  const response = await fetch(TAVILY_SEARCH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildTavilyRequestBody(apiKey, input)),
    signal: AbortSignal.timeout(TAVILY_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`搜索服务返回 HTTP ${response.status}`)
  return parseHits(await response.json() as { results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }> })
}

export type VerticalHit = TavilyHit & { channel: VerticalChannel }

export async function searchVerticalSignals(apiKey: string, input: {
  query: string
  region?: string
  channel?: VerticalChannel | 'all'
}): Promise<{ results: VerticalHit[]; failedChannels: VerticalChannel[] }> {
  const channels = resolveVerticalChannels(input.channel)
  const settled = await Promise.allSettled(channels.map(async (channel) => {
    const hits = await searchTavily(apiKey, {
      query: buildChannelQuery(input.query, channel, input.region),
      topic: 'general',
      country: 'china',
      includeDomains: VERTICAL_DOMAINS[channel],
      maxResults: 8,
    })
    return hits.map((hit) => ({ ...hit, channel }))
  }))

  const results: VerticalHit[] = []
  const failedChannels: VerticalChannel[] = []
  const seen = new Set<string>()
  settled.forEach((item, index) => {
    const channel = channels[index]!
    if (item.status === 'rejected') {
      failedChannels.push(channel)
      return
    }
    for (const hit of item.value) {
      if (seen.has(hit.url)) continue
      seen.add(hit.url)
      results.push(hit)
    }
  })
  if (results.length === 0 && failedChannels.length === channels.length) {
    throw new Error('垂直站点检索全部失败')
  }
  return { results, failedChannels }
}

export type DiscoverMaterial = TavilyHit & { channel: 'news' | 'web' | VerticalChannel }

const CHANNEL_PRIORITY: Record<DiscoverMaterial['channel'], number> = {
  tender: 0,
  policy: 1,
  industry: 2,
  news: 3,
  web: 4,
}

const MIN_PRIMARY_MATERIALS = 6

export async function collectDiscoverMaterials(apiKey: string, input: {
  query: string
  days: number
  region?: string
}): Promise<{ materials: DiscoverMaterial[]; notices: string[] }> {
  const [newsResult, verticalResult] = await Promise.allSettled([
    searchTavily(apiKey, {
      query: enrichNewsQuery(input.query, input.region),
      days: input.days,
      topic: 'news',
      excludeDomains: NEWS_EXCLUDE_DOMAINS,
      maxResults: 10,
    }),
    searchVerticalSignals(apiKey, { query: input.query, region: input.region }),
  ])

  const byUrl = new Map<string, DiscoverMaterial>()
  const notices: string[] = []

  if (newsResult.status === 'fulfilled') {
    for (const hit of newsResult.value) byUrl.set(hit.url, { ...hit, channel: 'news' })
  } else {
    notices.push('新闻检索暂不可用')
  }

  if (verticalResult.status === 'fulfilled') {
    for (const hit of verticalResult.value.results) byUrl.set(hit.url, hit)
    if (verticalResult.value.failedChannels.length) {
      notices.push(`垂直通道暂不可用：${verticalResult.value.failedChannels.join('、')}`)
    }
  } else {
    notices.push('垂直站点检索暂不可用')
  }

  if (byUrl.size < MIN_PRIMARY_MATERIALS) {
    try {
      const extra = await searchTavily(apiKey, {
        query: enrichNewsQuery(input.query, input.region),
        days: input.days,
        topic: 'general',
        country: 'china',
        excludeDomains: NEWS_EXCLUDE_DOMAINS,
        maxResults: 10,
      })
      for (const hit of extra) {
        if (!byUrl.has(hit.url)) byUrl.set(hit.url, { ...hit, channel: 'web' })
      }
      notices.push('已补充不限站点的公开检索')
    } catch {
      notices.push('补充检索暂不可用')
    }
  }

  const materials = [...byUrl.values()].sort((left, right) => CHANNEL_PRIORITY[left.channel] - CHANNEL_PRIORITY[right.channel])
  if (materials.length === 0) throw new Error('实时搜索未返回可用公开材料')
  return { materials, notices }
}

export function formatDiscoverMaterials(materials: DiscoverMaterial[], maxItems = 24, excerpt = 360): DiscoverMaterial[] {
  return materials.slice(0, maxItems).map((item) => ({
    ...item,
    content: item.content.length > excerpt ? `${item.content.slice(0, excerpt)}…` : item.content,
  }))
}

export function buildDiscoverPrompt(
  query: string,
  region: string | undefined,
  days: number,
  materials: DiscoverMaterial[],
  notices: string[] = [],
): string {
  const place = region ? `，地区限定：${region}` : ''
  const noticeLine = notices.length ? `检索提示：${notices.join('；')}。` : ''
  return [
    `根据下列已检索公开材料，抽取「${query}」${place} 的企业级商机候选。回看窗口约 ${days} 天，但材料可能缺少准确发布时间。`,
    `禁止调用任何搜索工具，禁止用模型记忆补造未出现在材料中的公司或 URL。`,
    `日期不明或略超窗口的材料不要整条丢弃；occurredAt 未知时用材料日期，无法判断则写待核验。优先招标与政策，最多 8 条。`,
    noticeLine,
    `检索材料：${JSON.stringify(formatDiscoverMaterials(materials))}`,
  ].filter(Boolean).join('')
}
