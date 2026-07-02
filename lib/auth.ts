/**
 * Простая авторизация одного администратора.
 * Учётка задаётся переменными окружения:
 *   ADMIN_USER, ADMIN_PASSWORD
 * Сессия — подписанная HMAC-SHA256 кука (AUTH_SECRET).
 *
 * Реализация на Web Crypto, чтобы работать и в middleware (edge runtime).
 */

export const SESSION_COOKIE = 'esp32_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 дней

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('Не задан AUTH_SECRET. Сгенерируйте: openssl rand -base64 32')
  }
  return secret
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad
  const str = atob(b64)
  const bytes = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i)
  return bytes
}

async function hmac(data: string): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return new Uint8Array(sig)
}

/** Проверка логина/пароля админа (constant-time-ish сравнение). */
export function verifyCredentials(user: string, password: string): boolean {
  const expectedUser = process.env.ADMIN_USER ?? ''
  const expectedPass = process.env.ADMIN_PASSWORD ?? ''
  if (!expectedUser || !expectedPass) return false
  return safeEqual(user, expectedUser) && safeEqual(password, expectedPass)
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Создать подписанный токен сессии. */
export async function createSessionToken(): Promise<string> {
  const payload = {
    sub: 'admin',
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = base64UrlEncode(await hmac(payloadB64))
  return `${payloadB64}.${sig}`
}

/** Проверить токен сессии. Возвращает true, если валиден и не истёк. */
export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const [payloadB64, sig] = token.split('.')
  if (!payloadB64 || !sig) return false

  const expectedSig = base64UrlEncode(await hmac(payloadB64))
  if (!safeEqual(sig, expectedSig)) return false

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)))
    if (typeof payload.exp !== 'number') return false
    return payload.exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

export const SESSION_MAX_AGE = SESSION_TTL_SECONDS
