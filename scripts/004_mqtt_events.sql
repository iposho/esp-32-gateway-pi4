-- =====================================================================
-- ESP32 Gateway — audit log всех MQTT-сообщений для дашборда трафика
-- Выполните после 001_schema.sql в SQL-редакторе Supabase Studio.
-- =====================================================================

create table if not exists public.mqtt_events (
  id           bigint generated always as identity primary key,
  device_id    text,
  topic        text not null,
  event_type   text not null,
  payload      jsonb not null,
  payload_size int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists mqtt_events_time_idx
  on public.mqtt_events (created_at desc);

create index if not exists mqtt_events_device_time_idx
  on public.mqtt_events (device_id, created_at desc);

create index if not exists mqtt_events_type_time_idx
  on public.mqtt_events (event_type, created_at desc);

-- Realtime для live-ленты в админке
alter publication supabase_realtime add table public.mqtt_events;

alter table public.mqtt_events enable row level security;

-- Аутентифицированные пользователи админки могут читать audit log
create policy "Authenticated users can read mqtt_events"
  on public.mqtt_events for select
  to authenticated
  using (true);

-- Удаление старых записей (retention).
-- Автоочистка: выполни scripts/005_mqtt_events_retention_cron.sql (pg_cron).
-- Ручной запуск: SELECT public.cleanup_mqtt_events(7);
create or replace function public.cleanup_mqtt_events(keep_days int default 7)
returns bigint
language plpgsql
security definer
as $$
declare
  deleted bigint;
begin
  delete from public.mqtt_events
  where created_at < now() - (keep_days || ' days')::interval;
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;
