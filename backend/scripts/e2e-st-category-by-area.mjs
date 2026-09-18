/**
 * E2E: filtro de categoría por área en formulario Tickets.
 *
 *   npm run build
 *   node backend/scripts/e2e-st-category-by-area.mjs
 */
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const PORT = 5177

const FORBIDDEN = ['Categoria de prueba', 'Problemas de Depositarios']

const CASES = [
  {
    areaLabel: 'Mantenimiento',
    screenshot: 'st-form-category-mantenimiento.png',
    expectSelected: 'Area de Mantenimiento',
    expectOptionIds: ['23'],
    categoryDisabled: true,
  },
  {
    areaLabel: 'Implementaciones',
    screenshot: 'st-form-category-implementaciones.png',
    expectSelected: 'Area de Implementaciones',
    expectOptionIds: ['22'],
    categoryDisabled: true,
  },
  {
    areaLabel: 'DESARROLLO',
    screenshot: 'st-form-category-desarrollo.png',
    expectSelected: 'DESARROLLO',
    expectOptionIds: ['25'],
    categoryDisabled: true,
  },
  {
    areaLabel: 'SOPORTE - IT',
    screenshot: 'st-form-category-soporte-it.png',
    expectSelected: '',
    expectOptionIds: ['17', '18', '19', '20', '21'],
    categoryDisabled: false,
  },
]

loadTestEnv()
initAdmin()

function loadMockCatalog() {
  const raw = readFileSync(resolve(OUT, 'st-catalogo-dump.json'), 'utf8').replace(/^\uFEFF/, '')
  const parsed = JSON.parse(raw)
  return parsed.data
}

async function waitOk(url) {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`timeout ${url}`)
}

async function signIn(page, email) {
  const custom = await getAuth().createCustomToken((await getAuth().getUserByEmail(email)).uid)
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function')
  await page.evaluate(async (t) => window.__e2eSignInWithCustomToken(t), custom)
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })
}

async function optionValues(selectLocator) {
  return selectLocator.locator('option').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('value') ?? '').filter((v) => v !== ''),
  )
}

mkdirSync(OUT, { recursive: true })
const mockCatalog = loadMockCatalog()

const vite = spawn(
  'npx',
  ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: 'ignore', shell: true, env: { ...process.env, VITE_E2E: 'true' } },
)

try {
  await waitOk(`http://127.0.0.1:${PORT}/`)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  await page.route('**/api/st-tickets/catalogo', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: mockCatalog }),
    })
  })
  await page.route('**/api/st-tickets/mias', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tickets: [] }),
    })
  })

  await signIn(page, 'admin@bacarsa.com.ar')
  await page.goto(`http://127.0.0.1:${PORT}/soporte-ti`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Tickets', exact: true }).waitFor({ timeout: 60_000 })

  for (const testCase of CASES) {
    await page.getByRole('button', { name: 'Nuevo pedido' }).click()
    const form = page.getByTestId('st-ticket-create-form')
    await form.waitFor()
    await form.getByLabel('Área destinataria').selectOption({ label: testCase.areaLabel })
    const category = form.getByLabel('Categoría')
    if (testCase.categoryDisabled) {
      if (!(await category.isDisabled())) {
        throw new Error(`${testCase.areaLabel}: categoría debería estar deshabilitada`)
      }
    } else if (await category.isDisabled()) {
      throw new Error(`${testCase.areaLabel}: categoría debería estar habilitada`)
    }

    const optionIds = await optionValues(category)
    const allOptionText = (await category.locator('option').allTextContents()).join(' | ')
    for (const forbidden of FORBIDDEN) {
      if (allOptionText.includes(forbidden)) {
        throw new Error(`${testCase.areaLabel}: aparece categoría prohibida "${forbidden}"`)
      }
    }
    if (optionIds.some((id) => id === '16' || id === '24')) {
      throw new Error(`${testCase.areaLabel}: apareció categoría oculta 16 o 24`)
    }
    const sortedExpected = [...testCase.expectOptionIds].sort()
    const sortedActual = [...optionIds].sort()
    if (JSON.stringify(sortedActual) !== JSON.stringify(sortedExpected)) {
      throw new Error(
        `${testCase.areaLabel}: ids=${JSON.stringify(sortedActual)} esperado=${JSON.stringify(sortedExpected)}`,
      )
    }
    const selected = await category.inputValue()
    const selectedLabel =
      selected === ''
        ? ''
        : (await category.locator(`option[value="${selected}"]`).textContent())?.trim() ?? ''
    if (selectedLabel !== testCase.expectSelected) {
      throw new Error(
        `${testCase.areaLabel}: seleccionada="${selectedLabel}" esperado="${testCase.expectSelected}"`,
      )
    }

    await form.screenshot({ path: resolve(OUT, testCase.screenshot) })
    console.log(`✅ ${testCase.areaLabel} → ids ${JSON.stringify(optionIds)} selected="${selectedLabel}"`)
    await page.getByRole('button', { name: 'Cerrar formulario' }).click()
    await form.waitFor({ state: 'hidden' })
  }

  // Cambio de área resetea categoría inconsistente
  await page.getByRole('button', { name: 'Nuevo pedido' }).click()
  const form = page.getByTestId('st-ticket-create-form')
  await form.getByLabel('Área destinataria').selectOption({ label: 'SOPORTE - IT' })
  await form.getByLabel('Categoría').selectOption({ label: 'Red e Internet' })
  await form.getByLabel('Área destinataria').selectOption({ label: 'Mantenimiento' })
  const catAfter = form.getByLabel('Categoría')
  const val = await catAfter.inputValue()
  if (val !== '23') throw new Error(`Reset al cambiar área: value=${val} esperado 23`)
  console.log('✅ Cambio de área resetea categoría a la autoseleccionada')

  await browser.close()
} finally {
  if (!vite.killed) vite.kill('SIGTERM')
}
