import { timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

export function isCameraRoute(pathname: string): boolean {
  return (
    pathname === '/api/camera/latest' ||
    /^\/api\/devices\/[^/]+\/camera$/.test(pathname)
  )
}

export function isValidCameraToken(request: NextRequest): boolean {
  const expected = process.env.CAMERA_API_TOKEN
  if (!expected) return false

  const fromQuery = request.nextUrl.searchParams.get('token')
  if (fromQuery && safeEqual(fromQuery, expected)) return true

  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const bearer = auth.slice(7)
    if (safeEqual(bearer, expected)) return true
  }

  return false
}

export const cameraCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization',
}
