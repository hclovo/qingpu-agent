import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import '../env.js'
import { createDatabaseConnection } from './client.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('执行迁移前必须配置 DATABASE_URL')

const { db, client } = createDatabaseConnection(databaseUrl)
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

try {
  await migrate(db, { migrationsFolder })
  console.log('数据库迁移完成')
} finally {
  await client.end()
}
