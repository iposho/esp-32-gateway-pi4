import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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
