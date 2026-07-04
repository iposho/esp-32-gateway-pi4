-- =====================================================================
-- Сохранение пользовательского имени устройства
-- Выполните в SQL-редакторе Supabase после 001_schema.sql
-- =====================================================================

-- Статус online/offline без перезаписи name (для Node-RED status flow)
create or replace function public.set_device_status(
  p_device_id text,
  p_is_online boolean
) returns void
language plpgsql
security definer
as $$
begin
  insert into public.devices (device_id, name, last_seen, is_online)
  values (p_device_id, p_device_id, now(), p_is_online)
  on conflict (device_id) do update
    set last_seen = now(),
        is_online = p_is_online;
end;
$$;

-- touch_device: не трогаем name при обновлении существующей записи
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
        is_online = true;
end;
$$;

-- Защита от PostgREST upsert с name: deviceId (старые Node-RED flows)
create or replace function public.preserve_custom_device_name()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.name is not distinct from new.device_id
     and old.name is distinct from old.device_id then
    new.name := old.name;
  end if;
  return new;
end;
$$;

drop trigger if exists devices_preserve_custom_name on public.devices;
create trigger devices_preserve_custom_name
  before update of name on public.devices
  for each row
  execute function public.preserve_custom_device_name();
