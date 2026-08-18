import { defineConfig } from 'drizzle-kit'
import { config } from 'dotenv'

config({ path: '../../.env', quiet: true })

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://qingpu:qingpu@localhost:5432/qingpu_agent',
  },
  strict: true,
  verbose: true,
})
