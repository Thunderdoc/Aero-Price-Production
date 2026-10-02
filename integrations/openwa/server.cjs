const express = require('express')
const openwa = require('@open-wa/wa-automate')

const port = Number(process.env.PORT || 8787)
const bridgeToken = String(process.env.WHATSAPP_BRIDGE_TOKEN || '').trim()

if (!bridgeToken) {
  console.error('WHATSAPP_BRIDGE_TOKEN is required.')
  process.exit(1)
}

const app = express()
app.use(express.json({ limit: '64kb' }))

let clientPromise

function requireAuth(req, res, next) {
  const header = String(req.headers.authorization || '')
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (token !== bridgeToken) return res.status(401).json({ detail: 'Unauthorized' })
  return next()
}

function getClient() {
  if (!clientPromise) {
    clientPromise = openwa.create({
      sessionId: process.env.OPENWA_SESSION_ID || 'aeroprice',
      multiDevice: true,
      headless: true,
      qrTimeout: 0,
      authTimeout: 0,
      cacheEnabled: false,
      useChrome: true,
      killProcessOnBrowserClose: true,
    })
  }
  return clientPromise
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'aeroprice-openwa-bridge' })
})

app.post('/send', requireAuth, async (req, res) => {
  const to = String(req.body?.to || '').trim()
  const message = String(req.body?.message || '').trim()
  if (!to || !message) return res.status(422).json({ detail: 'Both to and message are required.' })

  const client = await getClient()
  const chatId = to.includes('@c.us') || to.includes('@g.us') ? to : `${to.replace(/\D/g, '')}@c.us`
  const result = await client.sendText(chatId, message)
  res.json({ status: 'sent', result })
})

app.listen(port, () => {
  console.log(`AeroPrice OpenWA bridge listening on :${port}`)
})
