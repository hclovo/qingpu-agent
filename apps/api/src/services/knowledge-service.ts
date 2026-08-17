import type { CreateKnowledgeInput, KnowledgeItem } from '@qingpu/contracts'
import type { MemoryStore } from '../store/memory-store.js'

export class KnowledgeService {
  constructor(private readonly store: MemoryStore) {}

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
