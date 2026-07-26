import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let cachedClient: SupabaseClient | null = null

/**
 * Клиентский Supabase (браузер).
 * Использует anon key — все операции идут через RLS.
 * Если переменные окружения не заданы, возвращает null (не выбрасывает фатальное исключение).
 */
export function createClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    if (typeof window !== 'undefined') {
      console.warn(
        '[Supabase] NEXT_PUBLIC_SUPABASE_URL или NEXT_PUBLIC_SUPABASE_ANON_KEY не заданы.',
      )
    }
    return null
  }

  if (!cachedClient) {
    cachedClient = createBrowserClient(url, key)
  }

  return cachedClient
}

