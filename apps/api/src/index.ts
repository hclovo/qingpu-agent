import './env.js'
import { serve } from '@hono/node-server'
import { app } from './app.js'

const port = Number(process.env.PORT || 4111)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`氢能企业关系与商机 Agent API 已启动：http://localhost:${info.port}`)
})
