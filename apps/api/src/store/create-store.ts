import { createDatabaseConnection } from '../db/client.js'
import { MemoryStore } from './memory-store.js'
import { PostgresStore } from './postgres-store.js'
import type { BusinessStore } from './store.js'

export function createStore(): BusinessStore {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) return new MemoryStore()
  const { db, client } = createDatabaseConnection(databaseUrl)
  return new PostgresStore(db, client)
}
