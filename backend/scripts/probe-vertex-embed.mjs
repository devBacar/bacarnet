import { loadTestEnv } from './get-test-token.mjs'
import { embedTexts } from '../lib/modules/rag/embeddings.js'

loadTestEnv()

try {
  const vectors = await embedTexts(['probe vertex'])
  console.log('EMBED_OK dims=', vectors[0]?.length)
} catch (err) {
  console.log('EMBED_ERROR:', err instanceof Error ? err.message : err)
}
