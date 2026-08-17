import type { AgentMode, OpportunityStage, SourceType } from './types'

export const stageLabels: Record<OpportunityStage, string> = {
  new: '新线索',
  verifying: '待核验',
  qualified: '已研判',
  engaging: '跟进中',
  converted: '已转化',
  closed: '已关闭',
}

export const roleLabels: Record<string, string> = {
  customer: '客户',
  prospect: '潜客',
  supplier: '上游厂商',
  partner: '生态伙伴',
}

export const modeLabels: Record<string, string> = {
  smart: '智能模式',
  intelligent: '智能模式',
  rules: '规则模式',
  demo: '演示发现',
}

export const sourceLabels: Record<string, string> = {
  public: '公开资料',
  'enterprise-provided': '企业提供',
  'demo-simulated': '模拟数据',
}

export const knowledgeStatusLabels: Record<string, string> = {
  ready: '可用',
  pending: '待解析',
  review: '需复核',
  'review-needed': '需复核',
  failed: '处理失败',
}

export function displayMode(mode?: AgentMode) {
  return modeLabels[mode ?? ''] ?? mode ?? '模式未知'
}

export function displaySource(source?: SourceType) {
  return sourceLabels[source ?? ''] ?? source ?? '来源待补充'
}

export function formatDate(value?: string, withTime = false) {
  if (!value) return '待补充'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

export function numberEntries(
  value: Record<string, number> | Array<{ label?: string; name?: string; grade?: string; industry?: string; stage?: string; value: number }> | undefined,
) {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map((item) => ({
      label: item.label ?? item.name ?? item.grade ?? item.industry ?? item.stage ?? '其他',
      value: item.value,
    }))
  }
  return Object.entries(value).map(([label, count]) => ({ label, value: count }))
}
