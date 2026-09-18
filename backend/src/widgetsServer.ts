import cors from 'cors'
import express from 'express'
import { googlePersonalRouter } from './modules/googlePersonal/routes.js'

const app = express()

app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://localhost:5175',
      'http://127.0.0.1:5175',
      'http://localhost:5176',
      'http://127.0.0.1:5176',
      'http://localhost:5180',
      'http://127.0.0.1:5180',
      'http://localhost:5181',
      'http://127.0.0.1:5181',
      'http://localhost:5190',
      'http://127.0.0.1:5190',
      'http://localhost:5195',
      'http://127.0.0.1:5195',
      'https://bacarnet.web.app',
      'https://bacarnet.firebaseapp.com',
      'https://intranet-bacar.web.app',
      'https://intranet-bacar.firebaseapp.com',
    ],
    credentials: true,
  }),
)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'widgets' })
})

app.use('/api/me', googlePersonalRouter)

app.use((_req, res) => {
  res.status(404).json({ error: 'No encontrado' })
})

export { app }
