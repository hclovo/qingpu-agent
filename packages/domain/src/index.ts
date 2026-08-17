import type {
  AgentInsight,
  AnalyzeOpportunityInput,
  OpportunityGrade,
  Product,
  ProductMatch,
  Relationship,
  ScoreDimension,
  ScoreResult,
} from '@qingpu/contracts'

export const SCORE_VERSION = '1.0.0'

const SCENARIO_TERMS = [
  '重卡', '矿卡', '物流', '船舶', '航运', '轨道', '高铁', '制氢', '储能', '发电',
  '叉车', '无人机', '两轮车', '公交', '环卫', '港口', '钢铁', '煤矿', '园区',
]

const STRONG_DEMAND_TERMS = ['招标', '采购', '替换', '改造', '开工', '交付', '投产', '扩产', '试运营', '示范运营']
const SCALE_TERMS = ['辆', '艘', '台', '套', 'mw', 'kw', 'nm³', '预算', '首批', '规模']

const includesAny = (text: string, terms: string[]) => terms.some((term) => text.toLowerCase().includes(term.toLowerCase()))
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value))

export function gradeForScore(score: number): OpportunityGrade {
  if (score >= 80) return 'A'
  if (score >= 65) return 'B'
  if (score >= 50) return 'C'
  return 'D'
}

function daysSince(date: string, now: Date): number {
  const timestamp = new Date(date).getTime()
  if (Number.isNaN(timestamp)) return 3650
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000))
}

export function scoreOpportunity(input: AnalyzeOpportunityInput, now = new Date()): ScoreResult {
  const text = `${input.title} ${input.signal} ${input.industry} ${input.expectedScale ?? ''}`
  const fit = clamp((includesAny(text, SCENARIO_TERMS) ? 22 : 8) + (input.strategic ? 5 : 0) + (includesAny(text, ['氢', '燃料电池']) ? 3 : 0), 30)
  const demand = clamp((includesAny(text, STRONG_DEMAND_TERMS) ? 12 : 5) + (includesAny(text, SCALE_TERMS) ? 8 : 2), 20)
  const age = daysSince(input.occurredAt, now)
  const recency = age <= 30 ? 20 : age <= 90 ? 16 : age <= 180 ? 10 : age <= 365 ? 5 : 0
  const maturityMap: Record<AnalyzeOpportunityInput['maturity'], number> = {
    awareness: 3,
    planning: 7,
    approved: 10,
    tendering: 13,
    pilot: 13,
    operating: 14,
    'repeat-purchase': 15,
  }
  const contactabilityMap: Record<AnalyzeOpportunityInput['contactability'], number> = {
    unknown: 1,
    'public-channel': 5,
    'known-contact': 8,
    'existing-relationship': 10,
  }
  const strategic = clamp((input.strategic ? 3 : 0) + (includesAny(text, ['标杆', '示范', '产业园', '政府', '跨省']) ? 2 : 1), 5)
  const dimensions: ScoreDimension[] = [
    { key: 'fit', label: '场景/产品匹配', score: fit, maxScore: 30, reason: fit >= 22 ? '信号命中氢璞重点行业或应用场景' : '场景信息有限，需补充技术需求' },
    { key: 'demand', label: '需求与采购能力', score: demand, maxScore: 20, reason: demand >= 18 ? '存在明确行动信号和规模信息' : '需求强度或采购规模仍需核实' },
    { key: 'recency', label: '信号时效', score: recency, maxScore: 20, reason: `信号距今约 ${age} 天` },
    { key: 'maturity', label: '项目成熟度', score: maturityMap[input.maturity], maxScore: 15, reason: `当前阶段：${input.maturity}` },
    { key: 'contactability', label: '可触达性', score: contactabilityMap[input.contactability], maxScore: 10, reason: `联系条件：${input.contactability}` },
    { key: 'strategic', label: '战略价值', score: strategic, maxScore: 5, reason: strategic >= 4 ? '具有标杆或战略协同价值' : '暂未发现明显战略加成' },
  ]
  const score = Math.round(dimensions.reduce((sum, item) => sum + item.score, 0))
  return { score, grade: gradeForScore(score), scoreVersion: SCORE_VERSION, dimensions }
}

type ProductRule = { terms: string[]; familyTerms: string[]; certification?: string }

const PRODUCT_RULES: ProductRule[] = [
  { terms: ['船', '航运', '内河', '沿海'], familyTerms: ['船用'], certification: 'CCS' },
  { terms: ['制氢', '绿氢', '电解'], familyTerms: ['制氢'] },
  { terms: ['无人机', '两轮车', '应急', '通信'], familyTerms: ['空冷'] },
  { terms: ['重卡', '矿卡', '物流车', '商用车', '公交', '环卫'], familyTerms: ['车用', '碳复合板', '金属'] },
  { terms: ['储能', '固定式发电', '电站'], familyTerms: ['碳复合板', '系统'] },
]

export function matchProducts(input: Pick<AnalyzeOpportunityInput, 'title' | 'signal' | 'industry' | 'expectedScale'>, products: Product[]): ProductMatch[] {
  const text = `${input.title} ${input.signal} ${input.industry} ${input.expectedScale ?? ''}`.toLowerCase()
  return products
    .map((product) => {
      let fitScore = 30
      const matchedOn: string[] = []
      const gaps: string[] = []
      for (const rule of PRODUCT_RULES) {
        if (includesAny(text, rule.terms) && includesAny(product.family, rule.familyTerms)) {
          fitScore += 42
          matchedOn.push(`场景匹配：${product.family}`)
          if (rule.certification) {
            if (product.certifications.includes(rule.certification)) {
              fitScore += 18
              matchedOn.push(`认证匹配：${rule.certification}`)
            } else {
              gaps.push(`需确认 ${rule.certification} 认证`)
            }
          }
        }
      }
      if (product.scenarios.some((scenario) => text.includes(scenario.toLowerCase()))) {
        fitScore += 18
        matchedOn.push('产品适用场景与信号直接重合')
      }
      if (!input.expectedScale) gaps.push('缺少功率/数量信息，需售前确认')
      if (matchedOn.length === 0) gaps.push('场景信息不足，当前为通用候选')
      return {
        productId: product.id,
        productModel: product.model,
        fitScore: Math.min(100, fitScore),
        matchedOn,
        gaps,
        rationale: matchedOn.length > 0 ? matchedOn.join('；') : '基于产品覆盖范围给出的待确认候选',
      }
    })
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, 3)
}

export function createRulesInsight(
  input: AnalyzeOpportunityInput,
  score: ScoreResult,
  matches: ProductMatch[],
  fallbackReason?: string,
): AgentInsight {
  const leadProduct = matches[0]
  return {
    mode: 'rules',
    summary: `${input.companyName}出现“${input.title}”信号，当前跟进优先级为 ${score.grade} 级（${score.score} 分）。${leadProduct ? `优先核实 ${leadProduct.productModel} 的适配条件。` : '暂未形成明确产品匹配。'}`,
    opportunityType: input.signalType,
    talkingPoints: [
      `围绕${input.industry}场景确认减碳目标、既有能源方案和项目时间表`,
      leadProduct ? `介绍 ${leadProduct.productModel} 的相似应用与交付边界` : '先获取功率、数量和认证要求',
    ],
    risks: [
      '当前结论来自公开/演示信号，需核验项目主体和时效',
      ...(leadProduct?.gaps ?? ['产品技术边界需由售前确认']),
    ],
    recommendedActions: [
      '核验项目负责人、预算来源和决策时间',
      '准备匹配案例与技术参数清单，由人工确认后再触达',
    ],
    questionsToVerify: ['目标功率、数量和工况是什么？', '氢源或加氢基础设施是否已具备？'],
    generatedAt: new Date().toISOString(),
    fallbackReason,
  }
}

export function relationshipHealth(relationship: Relationship, now = new Date()): Relationship['health'] {
  if (relationship.nextActionAt && new Date(relationship.nextActionAt) < now) return 'at-risk'
  if (!relationship.lastContactAt || daysSince(relationship.lastContactAt, now) > 45) return 'attention'
  return 'healthy'
}

