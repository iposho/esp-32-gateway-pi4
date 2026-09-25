-- =====================================================================
-- Запрет пересоздания удалённых устройств на уровне таблицы.
-- Выполните в SQL-редакторе Supabase после 006_deleted_devices.sql.
--
-- 006 закрывает только функции touch_device / set_device_status /
-- merge_device_commands (5 аргументов). Но устройство может вставляться
-- и в обход них: старые перегрузки merge_device_commands (3–4 аргумента
-- из 001/002), прямой upsert Node-RED в /rest/v1/devices и т.п.
-- Триггер ловит любую вставку: пока device_id есть в deleted_devices,
-- строка молча не создаётся (upsert просто ничего не делает).
--
-- Вернуть устройство: оно само вернётся при свежем status=online
-- (set_device_status снимает «надгробие»), или вручную:
--   delete from public.deleted_devices where device_id = '<id>';
-- =====================================================================

create or replace function public.block_deleted_device_insert()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.deleted_devices where device_id = new.device_id) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists devices_block_deleted on public.devices;
create trigger devices_block_deleted
  before insert on public.devices
  for each row
  execute function public.block_deleted_device_insert();

-- Старые перегрузки merge_device_commands без features больше не нужны:
-- Node-RED из репозитория вызывает версию с 5 аргументами.
drop function if exists public.merge_device_commands(text, jsonb);
drop function if exists public.merge_device_commands(text, jsonb, jsonb);
drop function if exists public.merge_device_commands(text, jsonb, jsonb, jsonb);
