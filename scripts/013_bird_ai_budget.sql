-- =====================================================================
-- Кормушка: остаток кредитов на распознавание, заданный вручную в дашборде.
-- Выполните после 012_bird_detections_cost.sql:
--   docker exec -i supabase-db psql -U postgres -d postgres \
--     < scripts/013_bird_ai_budget.sql
--
-- Gateway отдаёт остаток всей команды Vercel. Здесь хранится сумма, которую
-- владелец вписал в карточке «Распознавание птиц», и момент, когда вписал:
-- остаток = amount_usd − расход модели (bird_detections.cost_usd) с set_at.
-- =====================================================================

create table if not exists public.bird_ai_budget (
  id         smallint primary key default 1 check (id = 1),
  amount_usd numeric(10, 4) not null check (amount_usd >= 0),
  set_at     timestamptz not null default now()
);

alter table public.bird_ai_budget enable row level security;

-- Расход модели с момента since: сумма на стороне БД, без выгрузки строк
create or replace function public.bird_ai_spent_since(since timestamptz)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(cost_usd), 0)
    from public.bird_detections
   where created_at >= since
$$;

-- Читают и пишут только admin (service_role), не PostgREST от имени пользователей
revoke all on function public.bird_ai_spent_since(timestamptz) from public, anon, authenticated;
grant execute on function public.bird_ai_spent_since(timestamptz) to service_role;
