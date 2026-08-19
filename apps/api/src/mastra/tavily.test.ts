import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildChannelQuery,
  buildDiscoverPrompt,
  buildTavilyRequestBody,
  collectDiscoverMaterials,
  enrichNewsQuery,
  NEWS_EXCLUDE_DOMAINS,
  resolveVerticalChannels,
  searchTavily,
  searchVerticalSignals,
  startDateFromDays,
  TAVILY_SEARCH_URL,
  VERTICAL_DOMAINS,
} from './tavily.js'

describe('Tavily 检索参数', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('按自然日回看生成 start_date，而不是传无效的 days 字段', () => {
    const now = new Date('2026-08-19T12:00:00+08:00')
    expect(startDateFromDays(90, now)).toBe('2026-05-21')

    const news = buildTavilyRequestBody('key', {
      query: '氢能重卡 招标',
      days: 90,
      topic: 'news',
      excludeDomains: NEWS_EXCLUDE_DOMAINS,
    }, now)
    expect(news).toMatchObject({
      topic: 'news',
      start_date: '2026-05-21',
      search_depth: 'advanced',
      max_results: 8,
    })
    expect(news).not.toHaveProperty('days')
    expect(news).not.toHaveProperty('country')
    expect(news.exclude_domains).toEqual([...NEWS_EXCLUDE_DOMAINS])

    const vertical = buildTavilyRequestBody('key', {
      query: '氢能重卡 招标 采购 中标 投标',
      topic: 'general',
      country: 'china',
      includeDomains: VERTICAL_DOMAINS.tender,
      maxResults: 8,
    }, now)
    expect(vertical).toMatchObject({
      topic: 'general',
      country: 'china',
      max_results: 8,
    })
    expect(vertical).not.toHaveProperty('start_date')
    expect(vertical.include_domains).toEqual([...VERTICAL_DOMAINS.tender])
  })

  it('空泛新闻查询会补上招标/示范/采购，并带上地区', () => {
    expect(enrichNewsQuery('氢能产业商机')).toBe('氢能产业商机 招标 示范项目 采购')
    expect(enrichNewsQuery('船舶 氢能 招标', '湖北')).toBe('船舶 氢能 招标 湖北')
    expect(buildChannelQuery('氢燃料电池', 'tender', '江苏')).toBe('氢燃料电池 江苏 招标 采购 中标 投标')
    expect(resolveVerticalChannels('all')).toEqual(['tender', 'policy', 'industry'])
    expect(resolveVerticalChannels('policy')).toEqual(['policy'])
  })

  it('发现提示基于已检索材料抽取，并禁止再调搜索工具', () => {
    const prompt = buildDiscoverPrompt('氢能重卡', '河北', 90, [
      { channel: 'tender', title: '招标', url: 'https://www.cebpubservice.com/a', content: '采购公告' },
    ], ['新闻检索暂不可用'])
    expect(prompt).toContain('禁止调用任何搜索工具')
    expect(prompt).toContain('不要整条丢弃')
    expect(prompt).not.toContain('webSearchTool')
    expect(prompt).toContain('河北')
    expect(prompt).toContain('90')
    expect(prompt).toContain('cebpubservice.com')
    expect(prompt).toContain('新闻检索暂不可用')
  })

  it('新闻检索按官方字段发请求并解析 published_date', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: '氢能重卡招标', url: 'https://h2.bjx.com.cn/a', content: '近期采购', published_date: '2026-08-10' },
          { title: '缺链接', content: '忽略' },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const hits = await searchTavily('tvly-test', {
      query: '氢能重卡 招标 河北',
      days: 30,
      topic: 'news',
      excludeDomains: NEWS_EXCLUDE_DOMAINS,
    })

    expect(hits).toEqual([{ title: '氢能重卡招标', url: 'https://h2.bjx.com.cn/a', content: '近期采购', publishedDate: '2026-08-10' }])
    expect(fetchMock).toHaveBeenCalledWith(TAVILY_SEARCH_URL, expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body) as Record<string, unknown>
    expect(body.topic).toBe('news')
    expect(body).not.toHaveProperty('days')
    expect(body.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('垂直检索并行三路、按 URL 去重，并容忍单通道失败', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { query: string; include_domains: string[] }
      if (body.include_domains.includes('nea.gov.cn')) {
        return { ok: false, status: 502, json: async () => ({}) }
      }
      const shared = { title: '重复公告', url: 'https://www.cebpubservice.com/same', content: '同一条' }
      if (body.include_domains.includes('bjx.com.cn')) {
        return { ok: true, json: async () => ({ results: [shared, { title: '行业示范', url: 'https://h2.bjx.com.cn/b', content: '开工' }] }) }
      }
      return { ok: true, json: async () => ({ results: [shared, { title: '招标公告', url: 'https://www.cebpubservice.com/tender', content: '采购' }] }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const { results, failedChannels } = await searchVerticalSignals('tvly-test', {
      query: 'PEM 制氢',
      region: '江苏',
      channel: 'all',
    })

    expect(failedChannels).toEqual(['policy'])
    expect(results.map((item) => item.url)).toEqual([
      'https://www.cebpubservice.com/same',
      'https://www.cebpubservice.com/tender',
      'https://h2.bjx.com.cn/b',
    ])
    expect(results[0]?.channel).toBe('tender')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const verticalBodies = fetchMock.mock.calls.map((call) => JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>)
    expect(verticalBodies.every((body) => !('start_date' in body))).toBe(true)
  })

  it('发现材料并行汇聚新闻与垂直结果，重复 URL 保留垂直源', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { topic?: string; include_domains?: string[] }
      if (body.topic === 'news') {
        return {
          ok: true,
          json: async () => ({
            results: [
              { title: '新闻转载', url: 'https://www.cebpubservice.com/same', content: '旧摘要' },
              { title: '行业新闻', url: 'https://news.example.com/h2', content: '示范项目' },
            ],
          }),
        }
      }
      if (body.include_domains?.includes('nea.gov.cn')) return { ok: false, status: 502, json: async () => ({}) }
      if (body.include_domains?.includes('bjx.com.cn')) return { ok: true, json: async () => ({ results: [] }) }
      if (body.topic === 'general' && !body.include_domains) {
        return { ok: true, json: async () => ({ results: [{ title: '公开补漏', url: 'https://www.in-en.com/extra', content: '示范项目' }] }) }
      }
      return { ok: true, json: async () => ({ results: [{ title: '招标原文', url: 'https://www.cebpubservice.com/same', content: '采购正文' }] }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const { materials, notices } = await collectDiscoverMaterials('tvly-test', { query: '氢能重卡', days: 90, region: '河北' })
    expect(notices).toEqual(['垂直通道暂不可用：policy', '已补充不限站点的公开检索'])
    expect(materials.map((item) => [item.channel, item.url, item.title])).toEqual([
      ['tender', 'https://www.cebpubservice.com/same', '招标原文'],
      ['news', 'https://news.example.com/h2', '行业新闻'],
      ['web', 'https://www.in-en.com/extra', '公开补漏'],
    ])
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })
})
