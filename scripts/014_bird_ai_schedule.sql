-- =====================================================================
-- Кормушка: часы работы распознавания птиц, редактируются в дашборде.
-- Выполните после 013_bird_ai_budget.sql:
--   docker exec -i supabase-db psql -U postgres -d postgres \
--     < scripts/014_bird_ai_schedule.sql
--
-- schedule — JSON из lib/bird-schedule.ts:
--   { "mode": "sun", "edge": "civil" | "sun", "startOffsetMin": 0, "endOffsetMin": 0 }
--   { "mode": "fixed", "start": "06:00", "end": "20:00" }
--   { "mode": "always" }
-- Нет строки — действует шаблон по умолчанию (по солнцу, с сумерками).
-- =====================================================================

create table if not exists public.bird_ai_settings (
  id         smallint primary key default 1 check (id = 1),
  schedule   jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.bird_ai_settings enable row level security;

-- Читает и пишет только admin (service_role), не PostgREST от имени пользователей
revoke all on public.bird_ai_settings from public, anon, authenticated;
grant all on public.bird_ai_settings to service_role;
