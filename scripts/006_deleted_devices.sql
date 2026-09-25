-- =====================================================================
-- Удаление устройств из админки.
-- Выполните в SQL-редакторе Supabase после 003_device_features.sql.
--
-- Проблема: touch_device / set_device_status / merge_device_commands
-- делают upsert, поэтому любое MQTT-сообщение (телеметрия раз в 10 с,
-- retained status/capabilities при переподключении Node-RED) тут же
-- создавало удалённое устройство заново.
--
-- Решение: «надгробие» в deleted_devices. Пока оно есть, Node-RED
-- не может создать устройство. Снимается, когда устройство заново
-- подключается к брокеру и публикует status=online.
-- =====================================================================

create table if not exists public.deleted_devices (
  device_id  text primary key,
  deleted_at timestamptz not null default now()
);

alter table public.deleted_devices enable row level security;

create or replace function public.touch_device(
  p_device_id text,
  p_name text default null
) returns void
language plpgsql
security definer
as $$
begin
  if exists (select 1 from public.deleted_devices where device_id = p_device_id) then
    return;
  end if;

  insert into public.devices (device_id, name, last_seen, is_online)
  values (p_device_id, coalesce(p_name, p_device_id), now(), true)
  on conflict (device_id) do update
    set last_seen = now(),
        is_online = true;
end;
$$;

create or replace function public.set_device_status(
  p_device_id text,
  p_is_online boolean
) returns void
language plpgsql
security definer
as $$
begin
  if exists (select 1 from public.deleted_devices where device_id = p_device_id) then
    -- Свежий online = устройство переподключилось к брокеру → возвращаем его.
    -- (retained online админка стирает при удалении, так что это не «эхо»)
    if not p_is_online then
      return;
    end if;
    delete from public.deleted_devices where device_id = p_device_id;
  end if;

  insert into public.devices (device_id, name, last_seen, is_online)
  values (p_device_id, p_device_id, now(), p_is_online)
  on conflict (device_id) do update
    set last_seen = now(),
        is_online = p_is_online;
end;
$$;

create or replace function public.merge_device_commands(
  p_device_id text,
  p_commands jsonb,
  p_metrics jsonb default null,
  p_dashboard jsonb default null,
  p_features jsonb default null
) returns void
language plpgsql
security definer
as $$
begin
  if exists (select 1 from public.deleted_devices where device_id = p_device_id) then
    return;
  end if;

  insert into public.devices (device_id, name, metadata)
  values (
    p_device_id,
    p_device_id,
    jsonb_strip_nulls(jsonb_build_object(
      'commands', p_commands,
      'metrics', p_metrics,
      'dashboard', p_dashboard,
      'features', p_features
    ))
  )
  on conflict (device_id) do update
    set metadata = coalesce(public.devices.metadata, '{}'::jsonb)
                   || jsonb_strip_nulls(jsonb_build_object(
                        'commands', p_commands,
                        'metrics', p_metrics,
                        'dashboard', p_dashboard,
                        'features', p_features
                      ));
end;
$$;
