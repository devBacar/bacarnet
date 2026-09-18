import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest()
}

/** Cifra texto con AES-256-GCM; salida base64url (iv + tag + ciphertext). */
export function encryptSecret(plaintext: string, secret: string): string {
  const key = deriveKey(secret)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

export function decryptSecret(payload: string, secret: string): string {
  const key = deriveKey(secret)
  const buf = Buffer.from(payload, 'base64url')
  if (buf.length < IV_BYTES + 16 + 1) {
    throw new Error('Payload cifrado inválido')
  }
  const iv = buf.subarray(0, IV_BYTES)
  const tag = buf.subarray(IV_BYTES, IV_BYTES + 16)
  const ciphertext = buf.subarray(IV_BYTES + 16)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
