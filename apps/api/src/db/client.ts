import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres, { type Sql } from 'postgres'
import * as schema from './schema/index.js'

export type AppDatabase = PostgresJsDatabase<typeof schema>

export interface DatabaseConnection {
  db: AppDatabase
  client: Sql
}

export function createDatabaseConnection(databaseUrl: string): DatabaseConnection {
  const configuredPoolSize = Number(process.env.DATABASE_POOL_SIZE || 10)
  const poolSize = Number.isInteger(configuredPoolSize) && configuredPoolSize > 0 ? configuredPoolSize : 10
  const client = postgres(databaseUrl, {
    max: poolSize,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  })
  return { db: drizzle(client, { schema }), client }
}
