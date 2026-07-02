import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Серверный клиент Supabase с service_role ключом.
 *
 * Внутри Docker-сети SUPABASE_URL указывает на Kong-шлюз вашего
 * self-hosted Supabase, например http://kong:8000 (общая docker-сеть).
 * service_role обходит RLS — использовать ТОЛЬКО на сервере.
 */
let cached: SupabaseClient | null = null

export function getServiceClient(): SupabaseClient {
  if (cached) return cached

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Не заданы SUPABASE_URL и/или SUPABASE_SERVICE_ROLE_KEY. Проверьте переменные окружения.',
    )
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 10 } },
  })

  return cached
}

/**
 * Серверный клиент Supabase для API routes с cookie-based сессией.
 * Использует anon key — операции идут через RLS от имени текущего пользователя.
 * Для data-запросов, не требующих проверки пользователя, используйте getServiceClient().
 */
export async function getAuthClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // setAll вызывается из Server Component — куки read-only, это ок.
            // Middleware обновит куки при следующем запросе.
          }
        },
      },
    },
  )
}

