import { config } from 'dotenv'

const rootEnvFile = new URL('../../../.env', import.meta.url)

config({ path: rootEnvFile, quiet: true })
