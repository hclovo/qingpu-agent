import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  HttpUrlSchema,
  ResearchCandidateSchema,
  ResearchOutputSchema,
  shouldFallbackStructuredOutput,
} from './index.js'

const candidate = {
  companyName: '某港区运营公司',
  title: '氢能重卡采购招标',
  signal: '公开招标采购首批氢能重卡动力系统。',
  industry: '港口与物流',
  region: '天津',
  signalType: 'procurement' as const,
  sourceTitle: '招标公告',
  sourceUrl: 'https://www.cebpubservice.com/tender/1',
  occurredAt: '2026-08-10',
  confidence: 0.7,
}

describe('商机发现结构化输出 schema', () => {
  it('发给模型的 JSON Schema 不含 format=uri，避免兼容网关拒收', () => {
    const schema = JSON.stringify(z.toJSONSchema(ResearchOutputSchema))
    expect(schema).not.toMatch(/"format":\s*"uri"/)
    expect(schema).toContain('sourceUrl')
  })

  it('仍然只接受 http(s) URL', () => {
    expect(HttpUrlSchema.parse('https://www.nea.gov.cn/policy')).toBe('https://www.nea.gov.cn/policy')
    expect(() => HttpUrlSchema.parse('ftp://example.com/a')).toThrow()
    expect(() => HttpUrlSchema.parse('not-a-url')).toThrow()
    expect(ResearchCandidateSchema.parse(candidate).sourceUrl).toBe(candidate.sourceUrl)
  })

  it('结构化输出或网关 schema 报错时应回退到文本解析', () => {
    expect(shouldFallbackStructuredOutput("STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED")).toBe(true)
    expect(shouldFallbackStructuredOutput("Invalid schema for response_format 'response': 'uri' is not a valid format.")).toBe(true)
    expect(shouldFallbackStructuredOutput('Agent 调用超时')).toBe(false)
  })
})
