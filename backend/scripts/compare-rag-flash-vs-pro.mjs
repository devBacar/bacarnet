/**
 * Comparación lado a lado Flash vs Pro (mismas preguntas, generateContent directo).
 *
 *   npm --prefix backend run build
 *   node backend/scripts/compare-rag-flash-vs-pro.mjs
 */
import { google } from 'googleapis'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTestEnv } from './get-test-token.mjs'
import { getEnv } from '../lib/config/env.js'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro']

const QUESTIONS = [
  {
    id: 'inventario',
    prompt:
      'Sos asistente interno Bacarsas. El usuario pregunta: "¿Cuántos tipos de archivo distintos suele haber en una carpeta de Sistemas y cómo explicarías la diferencia entre PDF y Word para un usuario no técnico?" Respondé en español, máximo 150 palabras, sin inventar cifras exactas.',
  },
  {
    id: 'procedimiento',
    prompt:
      'Sos asistente interno. Pregunta: "¿Qué pasos debería seguir alguien de otra área para pedir acceso a un documento compartido en Drive si no lo ve en su carpeta?" Respondé con lista numerada, español rioplatense, sin IDs técnicos.',
  },
  {
    id: 'mail_borrador',
    prompt:
      'Sos asistente interno. El usuario dice: "Redactá un borrador corto para avisar al equipo que el viernes habrá mantenimiento de la intranet de 18 a 20 hs." Solo el texto del mail (asunto + cuerpo), tono profesional.',
  },
  {
    id: 'calendario',
    prompt:
      'Sos asistente interno. Pregunta: "¿Cómo le explico a un colega la diferencia entre crear un evento de todo el día vs con hora en Google Calendar?" Máximo 120 palabras.',
  },
  {
    id: 'rag_limites',
    prompt:
      'Sos asistente interno con acceso solo a documentos de Sistemas indexados y exclusiones regulatorias (Cumplimiento/RESTRINGIDO). Pregunta: "¿Puedo usar el asistente para leer documentos de Cumplimiento?" Respondé claro sobre límites, sin inventar políticas nuevas.',
  },
]

loadTestEnv()

async function getToken() {
  const key = process.env.DRIVE_SERVICE_ACCOUNT_KEY_PATH
  if (!key) throw new Error('DRIVE_SERVICE_ACCOUNT_KEY_PATH requerido')
  const jwt = new google.auth.JWT({
    keyFile: resolve(key),
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  const { token } = await jwt.getAccessToken()
  if (!token) throw new Error('sin token Vertex')
  return token
}

async function generate(model, prompt, token) {
  const projectId = getEnv().gcpProjectId || process.env.GCP_PROJECT_ID || 'bacar-web'
  const location = getEnv().ragEmbeddingLocation
  const url =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
    `/locations/${location}/publishers/google/models/${model}:generateContent`

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error?.message ?? `HTTP ${res.status}`)
  }
  const text =
    body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? ''
  return text
}

const token = await getToken()
const location = getEnv().ragEmbeddingLocation
console.log(`Región: ${location}\n`)

const report = { location, generatedAt: new Date().toISOString(), comparisons: [] }

for (const q of QUESTIONS) {
  console.log(`\n======== ${q.id} ========\n`)
  const row = { id: q.id, flash: '', pro: '' }
  for (const model of MODELS) {
    try {
      const text = await generate(model, q.prompt, token)
      if (model.includes('flash')) row.flash = text
      else row.pro = text
      console.log(`--- ${model} ---\n${text}\n`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (model.includes('flash')) row.flash = `[ERROR] ${msg}`
      else row.pro = `[ERROR] ${msg}`
      console.log(`--- ${model} --- ERROR: ${msg}\n`)
    }
  }
  report.comparisons.push(row)
}

mkdirSync(OUT, { recursive: true })
const outPath = resolve(OUT, 'rag-flash-vs-pro-comparison.json')
writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')
console.log(`\nGuardado: ${outPath}`)
