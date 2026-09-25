/**
 * Muestra JSON crudo de GET /accounts/balances (api-gw.interbanking.com.ar).
 * Uso: node backend/scripts/finanzas-interbanking-raw-probe.mjs
 */
import { readInterbankingEnvConfig } from '../lib/modules/finanzas/adapters/interbanking-provider.js'
import { loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const config = readInterbankingEnvConfig()
const mod = await import('interbanking-client')
const client = mod.createClient({ ...config, logger: null })

const raw = await client.getBalances()
const accounts = Array.isArray(raw?.accounts) ? raw.accounts : raw?.accounts ?? []

process.stdout.write(`${JSON.stringify({ accountCount: accounts.length, sample: accounts[0] ?? null }, null, 2)}\n`)
