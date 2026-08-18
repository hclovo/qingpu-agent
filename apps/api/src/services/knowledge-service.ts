import type { CreateKnowledgeInput, KnowledgeItem } from '@qingpu/contracts'
import type { BusinessStore } from '../store/store.js'

export class KnowledgeService {
  constructor(private readonly store: BusinessStore) {}

  list(query?: string, status?: KnowledgeItem['status']) {
    return this.store.listKnowledge(query, status)
  }

  search(query: string, limit?: number) {
    return this.store.searchKnowledge(query, limit)
  }

  create(input: CreateKnowledgeInput) {
    return this.store.createKnowledge(input)
  }
}
