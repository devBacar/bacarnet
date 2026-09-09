/**
 * Fase 5 — pruebas en vivo contra prod.
 *   node backend/scripts/test-rag-phase5-live.mjs
 */

import { getDrive } from '../lib/lib/google/driveClient.js'
import { initAdmin, loadTestEnv, getTestIdToken } from './get-test-token.mjs'
import { getRagConfig } from '../lib/modules/rag/config.js'
import { RAG_CHUNKS_COLLECTION, RAG_PILOT_GOVERNING_AREA_ID } from '../lib/modules/rag/constants.js'
import { getFirestore } from 'firebase-admin/firestore'
import { chunkPassesIndexedAcl } from '../lib/modules/rag/chunkAccess.js'

loadTestEnv()
initAdmin()

const API_BASE = process.env.RAG_API_BASE_URL ?? 'https://bacarnet.web.app'
const SUPER_EMAIL = process.env.RAG_TEST_SUPER_EMAIL?.trim() || 'sistemas.ti@bacarsa.com.ar'
const RESTRICTED_EMAIL =
  process.env.RAG_TEST_RESTRICTED_EMAIL?.trim() || 'implementaciones.it@bacarsa.com.ar'

const LATENCY_QUESTIONS = [
  '¿Cómo instalo el driver de las cámaras?',
  '¿Qué pasos hay para configurar Smart PSS?',
  '¿Cómo se instala el cliente de RustDesk?',
  '¿Qué dice la documentación sobre backup o respaldo?',
  '¿Cómo configurar una impresora Ricoh o Lexmark?',
]

async function askQuestion(idToken, question) {
  const started = Date.now()
  const res = await fetch(`${API_BASE}/api/drive/ask`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question }),
  })
  const body = await res.json().catch(() => ({}))
  return {
    ok: res.ok,
    status: res.status,
    latencyMs: Date.now() - started,
    body,
  }
}

async function loadIndexedFiles() {
  const db = getFirestore()
  const snap = await db
    .collection(RAG_CHUNKS_COLLECTION)
    .where('governingAreaId', '==', RAG_PILOT_GOVERNING_AREA_ID)
    .get()

  const byFile = new Map()
  for (const doc of snap.docs) {
    const fileId = doc.get('fileId')
    if (typeof fileId !== 'string') continue
    if (byFile.has(fileId)) continue
    byFile.set(fileId, {
      fileId,
      fileName: doc.get('fileName') ?? fileId,
      allowedReaders: Array.isArray(doc.get('allowedReaders')) ? doc.get('allowedReaders') : [],
      domainAccess: doc.get('domainAccess') ?? null,
      textPreview: doc.get('textPreview') ?? '',
    })
  }
  return [...byFile.values()]
}

async function driveCanRead(email, fileId) {
  try {
    const drive = await getDrive(email)
    await drive.files.get({ fileId, supportsAllDrives: true, fields: 'id,name' })
    return true
  } catch {
    return false
  }
}

async function pickAclLeakCandidate(files, restrictedEmail) {
  const normalized = restrictedEmail.trim().toLowerCase()

  for (const file of files) {
    const hasDomain = file.domainAccess && typeof file.domainAccess.domain === 'string'
    if (hasDomain) continue

    const readers = file.allowedReaders.map((e) => String(e).toLowerCase())
    if (readers.length === 0) continue
    if (readers.includes(normalized)) continue

    const superCan = await driveCanRead(SUPER_EMAIL, file.fileId)
    const restrictedCan = await driveCanRead(normalized, file.fileId)
    if (superCan && !restrictedCan) {
      return { file, restrictedCan, superCan }
    }
  }

  return null
}

function printAskResult(label, question, result) {
  console.log(`\n${'='.repeat(72)}`)
  console.log(label)
  console.log(`Pregunta: ${question}`)
  console.log(`HTTP ${result.status} · ${result.latencyMs} ms`)
  if (!result.ok) {
    console.log('Error:', result.body.error ?? JSON.stringify(result.body))
    return
  }
  console.log(`Impersonación: ${result.body.impersonatedAs}`)
  console.log('\n--- Respuesta ---')
  console.log(result.body.answer ?? '')
  console.log('\n--- Fuentes ---')
  for (const [index, citation] of (result.body.citations ?? []).entries()) {
    console.log(
      `[${index + 1}] ${citation.fileName} (fileId=${citation.fileId}, chunk=${citation.chunkIndex})`,
    )
    if (citation.webViewLink) console.log(`    ${citation.webViewLink}`)
    const excerpt = String(citation.excerpt ?? '').slice(0, 280)
    if (excerpt) console.log(`    «${excerpt}${citation.excerpt?.length > 280 ? '…' : ''}»`)
  }
}

async function main() {
  const config = await getRagConfig()
  console.log('=== RAG Fase 5 — pruebas en vivo (prod) ===')
  console.log(`API: ${API_BASE}`)
  console.log(`Piloto: ${config.pilot.label}`)
  console.log('')

  process.env.TEST_EMAIL = SUPER_EMAIL
  const superUser = await getTestIdToken()
  console.log(`Super admin token: ${superUser.email}`)

  // 1) Consulta representativa — respuesta completa
  const mainQuestion =
    process.env.RAG_TEST_QUESTION?.trim() ||
    '¿Cómo instalo el driver ASR o Queclink para las cámaras de monitoreo?'
  const mainResult = await askQuestion(superUser.idToken, mainQuestion)
  printAskResult('1) CONSULTA REPRESENTATIVA (super_admin)', mainQuestion, mainResult)

  // 3) Latencia — 5 consultas
  console.log(`\n${'='.repeat(72)}`)
  console.log('3) LATENCIA — 5 consultas')
  const latencies = []
  for (const question of LATENCY_QUESTIONS) {
    const result = await askQuestion(superUser.idToken, question)
    latencies.push(result.latencyMs)
    console.log(`${result.ok ? 'OK' : 'FAIL'} ${result.latencyMs} ms — ${question.slice(0, 60)}`)
    if (!result.ok) console.log(`   → ${result.body.error ?? result.status}`)
  }
  const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
  const max = Math.max(...latencies)
  const min = Math.min(...latencies)
  console.log('')
  console.log(`Promedio: ${avg} ms (${(avg / 1000).toFixed(1)} s)`)
  console.log(`Peor caso: ${max} ms (${(max / 1000).toFixed(1)} s)`)
  console.log(`Mejor caso: ${min} ms (${(min / 1000).toFixed(1)} s)`)
  console.log(`Objetivo < 8 s: ${max < 8000 ? 'PASS' : 'FAIL'}`)

  // 2) Fuga de permisos
  console.log(`\n${'='.repeat(72)}`)
  console.log('2) FUGA DE PERMISOS')
  const files = await loadIndexedFiles()
  console.log(`Archivos únicos indexados: ${files.length}`)

  const domainWide = files.filter((f) => f.domainAccess).length
  const explicitReaders = files.filter((f) => !f.domainAccess && f.allowedReaders.length > 0).length
  console.log(`Con acceso domain-wide: ${domainWide}`)
  console.log(`Con lista explícita de lectores: ${explicitReaders}`)

  const candidate = await pickAclLeakCandidate(files, RESTRICTED_EMAIL)
  if (!candidate) {
    console.log('')
    console.log(
      `No se encontró un archivo indexado donde ${SUPER_EMAIL} tenga acceso Drive y ${RESTRICTED_EMAIL} no.`,
    )
    console.log(
      'La mayoría de archivos de Sistemas parecen compartidos a nivel dominio — el filtro ACL+RAG no se puede aislar con este par de usuarios.',
    )
    console.log('Sugerencia: repetir con un archivo restringido a usuarios puntuales en Drive.')
  } else {
    const { file } = candidate
    console.log('')
    console.log(`Archivo candidato: ${file.fileName}`)
    console.log(`fileId: ${file.fileId}`)
    console.log(`allowedReaders (${file.allowedReaders.length}): ${file.allowedReaders.slice(0, 5).join(', ')}`)
    console.log(`${SUPER_EMAIL} Drive: sí · ${RESTRICTED_EMAIL} Drive: no`)

    const leakQuestion =
      process.env.RAG_LEAK_TEST_QUESTION?.trim() ||
      `Según el documento «${file.fileName}», ¿qué información relevante contiene?`

    const superAsk = await askQuestion(superUser.idToken, leakQuestion)
    const superCitesTarget = (superAsk.body.citations ?? []).some((c) => c.fileId === file.fileId)

    process.env.TEST_EMAIL = RESTRICTED_EMAIL
    const restrictedUser = await getTestIdToken({ requireSuperAdmin: false })
    const restrictedAsk = await askQuestion(restrictedUser.idToken, leakQuestion)

    console.log('')
    console.log(`Pregunta de fuga: ${leakQuestion}`)
    console.log(`Super_admin HTTP ${superAsk.status}, cita archivo objetivo: ${superCitesTarget}`)
    console.log(
      `Restringido (${restrictedUser.email}) HTTP ${restrictedAsk.status} — pilot disabled? ${restrictedAsk.body.code ?? '—'}`,
    )

    if (restrictedAsk.status === 503 && restrictedAsk.body.code === 'RAG_PILOT_DISABLED') {
      console.log('')
      console.log(
        'NOTA: usuarios no super_admin reciben 503 mientras rag.enabled=false — no se puede probar fuga ACL en prod hasta habilitar piloto o usar endpoint de test.',
      )
    } else if (restrictedAsk.ok) {
      const leakCites = (restrictedAsk.body.citations ?? []).some((c) => c.fileId === file.fileId)
      const answerMentions = String(restrictedAsk.body.answer ?? '')
        .toLowerCase()
        .includes(file.fileName.toLowerCase().slice(0, 12))
      console.log(`Restringido cita archivo objetivo: ${leakCites}`)
      console.log(`Restringido menciona archivo en respuesta: ${answerMentions}`)
      console.log(`RESULTADO FUGA: ${leakCites || answerMentions ? 'FAIL — posible fuga' : 'PASS — sin contenido del archivo'}`)
      if (!leakCites) {
        console.log('\nRespuesta restringido (extracto):')
        console.log(String(restrictedAsk.body.answer ?? '').slice(0, 500))
      }
    } else {
      console.log(`Restringido error: ${restrictedAsk.body.error ?? restrictedAsk.status}`)
      console.log('RESULTADO FUGA: PASS (sin acceso al endpoint o sin respuesta)')
    }

    // Verificación offline ACL sobre chunks del archivo
    const db = getFirestore()
    const chunks = await db
      .collection(RAG_CHUNKS_COLLECTION)
      .where('fileId', '==', file.fileId)
      .limit(3)
      .get()
    const aclPass = chunks.docs.every((doc) =>
      chunkPassesIndexedAcl(
        {
          allowedReaders: doc.get('allowedReaders') ?? [],
          domainAccess: doc.get('domainAccess') ?? null,
        },
        RESTRICTED_EMAIL,
      ),
    )
    console.log(`ACL indexada bloquea a ${RESTRICTED_EMAIL} en chunks: ${!aclPass ? 'sí (esperado)' : 'no (revisar)'}`)
  }

  // 4) Costos — estimación (billing API suele requerir permisos extra)
  console.log(`\n${'='.repeat(72)}`)
  console.log('4) COSTO / BILLING')
  const indexState = await getFirestore()
    .collection('ragIndexState')
    .doc(RAG_PILOT_GOVERNING_AREA_ID)
    .get()
  const chunkCount = indexState.get('chunkCount') ?? 0
  console.log(`Chunks indexados: ${chunkCount}`)
  console.log(`Consultas en esta corrida: ${1 + LATENCY_QUESTIONS.length + (candidate ? 2 : 0)}`)
  console.log('')
  console.log('Estimación de cargos visibles en Billing (orden de magnitud):')
  console.log('- Vertex embeddings (indexación 77 chunks): ~USD 0.001–0.01')
  console.log('- Vertex/Gemini (≈6–8 consultas): ~USD 0.01–0.05')
  console.log('- GCS snapshot (~0.3 MB): < USD 0.01/mes')
  console.log('- Firestore 77 docs: despreciable')
  console.log('')
  console.log(
    'En Billing de GCP, con este volumen muchas líneas aparecen como $0.00 o no desglosadas aún (retraso 24–48 h). No hay Spanner/RAG Engine (= costo fijo $0).',
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
