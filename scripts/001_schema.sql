-- =====================================================================
-- ESP32 Gateway — схема БД для self-hosted Supabase
-- Выполните этот скрипт один раз в SQL-редакторе вашего Supabase
-- (Studio -> SQL Editor) или через psql.
-- =====================================================================

-- Устройства ESP32
create table if not exists public.devices (
  id            uuid primary key default gen_random_uuid(),
  device_id     text unique not null,          -- уникальный ID, например "esp32-kitchen"
  name          text not null,                 -- человекочитаемое имя
  description   text,
  -- last_seen обновляется при каждом сообщении статуса/телеметрии
  last_seen     timestamptz,
  is_online     boolean not null default false,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- Телеметрия (временной ряд: температура, влажность, состояние реле и т.д.)
create table if not exists public.telemetry (
  id          bigint generated always as identity primary key,
  device_id   text not null references public.devices(device_id) on delete cascade,
  topic       text not null,                   -- полный MQTT-топик
  payload     jsonb not null,                  -- распарсенный JSON payload
  created_at  timestamptz not null default now()
);
create index if not exists telemetry_device_time_idx
  on public.telemetry (device_id, created_at desc);

-- Команды, отправленные из админки на устройства (аудит)
create table if not exists public.commands (
  id          bigint generated always as identity primary key,
  device_id   text not null references public.devices(device_id) on delete cascade,
  topic       text not null,
  payload     jsonb not null,
  status      text not null default 'sent',    -- sent | acked | failed
  created_at  timestamptz not null default now()
);
create index if not exists commands_device_time_idx
  on public.commands (device_id, created_at desc);

-- =====================================================================
-- Realtime: включаем публикацию изменений для админки
-- =====================================================================
alter publication supabase_realtime add table public.devices;
alter publication supabase_realtime add table public.telemetry;
alter publication supabase_realtime add table public.commands;

-- =====================================================================
-- RLS. Админка ходит через service_role (обходит RLS),
-- Node-RED — тоже через service_role. Публичный anon-доступ закрыт.
-- =====================================================================
alter table public.devices   enable row level security;
alter table public.telemetry enable row level security;
alter table public.commands  enable row level security;

-- Никаких политик для anon => anon ничего не видит.
-- service_role обходит RLS автоматически.

-- =====================================================================
-- Хелпер: upsert устройства + отметка last_seen (используется Node-RED)
-- =====================================================================
create or replace function public.touch_device(
  p_device_id text,
  p_name text default null
) returns void
language plpgsql
security definer
as $$
begin
  insert into public.devices (device_id, name, last_seen, is_online)
  values (p_device_id, coalesce(p_name, p_device_id), now(), true)
  on conflict (device_id) do update
    set last_seen = now(),
        is_online = true,
        name = coalesce(public.devices.name, excluded.name);
end;
$$;

-- Сохранить команды из MQTT capabilities в metadata устройства (Node-RED)
create or replace function public.merge_device_commands(
  p_device_id text,
  p_commands jsonb
) returns void
language plpgsql
security definer
as $$
begin
  insert into public.devices (device_id, name, metadata)
  values (p_device_id, p_device_id, jsonb_build_object('commands', p_commands))
  on conflict (device_id) do update
    set metadata = coalesce(public.devices.metadata, '{}'::jsonb)
                   || jsonb_build_object('commands', p_commands);
end;
$$;

-- Пример тестовых устройств (можно удалить)
insert into public.devices (device_id, name, description)
values
  ('esp32-kitchen', 'Кухня', 'Датчик температуры + реле'),
  ('esp32-garage',  'Гараж',  'Датчик двери + реле света')
on conflict (device_id) do nothing;
