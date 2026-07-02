import { NextResponse, type NextRequest } from 'next/server'
import { getAuthClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { email = '', password = '' } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email и пароль обязательны' }, { status: 400 })
  }

  const supabase = await getAuthClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return NextResponse.json(
      { error: 'Неверный email или пароль' },
      { status: 401 },
    )
  }

  return NextResponse.json({ ok: true })
}
