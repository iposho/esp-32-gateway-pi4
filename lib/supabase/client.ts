import { createBrowserClient } from '@supabase/ssr'

/**
 * Клиентский Supabase (браузер).
 * Использует anon key — все операции идут через RLS.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
