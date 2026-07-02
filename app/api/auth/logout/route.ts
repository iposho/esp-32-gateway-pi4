import { NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await getAuthClient()
  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}
