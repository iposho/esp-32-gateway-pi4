import { NextResponse, type NextRequest } from 'next/server'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  verifyCredentials,
} from '@/lib/auth'

export async function POST(req: NextRequest) {
  let body: { user?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { user = '', password = '' } = body

  if (!verifyCredentials(user, password)) {
    return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 })
  }

  const token = await createSessionToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
  return res
}
