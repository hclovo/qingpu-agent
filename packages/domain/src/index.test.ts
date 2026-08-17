import { describe, expect, it } from 'vitest'
import type { AnalyzeOpportunityInput, Product } from '@qingpu/contracts'
import { gradeForScore, matchProducts, scoreOpportunity } from './index'

const baseInput: AnalyzeOpportunityInput = {
  companyName: '某长江航运集团',
  title: '内河货船氢能动力改造项目招标',
  signal: '首批三艘船计划采用200kW燃料电池系统，项目已进入招标阶段。',
  industry: '船舶航运',
  region: '长江经济带',
  signalType: 'procurement',
  expectedScale: '3艘，单船200kW',
  maturity: 'tendering',
  contactability: 'public-channel',
  sourceTitle: '公开招标公告',
  occurredAt: '2026-08-10',
  sourceKind: 'public',
  strategic: true,
}

describe('scoreOpportunity', () => {
  it('明确且近期的船舶招标应成为高优先级商机', () => {
    const result = scoreOpportunity(baseInput, new Date('2026-08-17T00:00:00Z'))
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.grade).toBe('A')
    expect(result.dimensions).toHaveLength(6)
  })

  it('等级边界稳定', () => {
    expect(gradeForScore(80)).toBe('A')
    expect(gradeForScore(65)).toBe('B')
    expect(gradeForScore(50)).toBe('C')
    expect(gradeForScore(49)).toBe('D')
  })
})

describe('matchProducts', () => {
  it('船舶场景优先匹配带 CCS 的船用系统', () => {
    const products: Product[] = [
      { id: 'ocean-200', model: 'OCEAN200', family: '船用燃料电池系统', ratedPower: '200kW', peakPower: '264kW', certifications: ['CCS'], scenarios: ['内河船舶'], highlights: [], source: '产品单页' },
      { id: 'e200', model: 'E200', family: '车用燃料电池系统', ratedPower: '200kW', certifications: [], scenarios: ['重卡'], highlights: [], source: '产品单页' },
    ]
    expect(matchProducts(baseInput, products)[0]?.productId).toBe('ocean-200')
  })
})

