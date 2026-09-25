-- =====================================================================
-- Удаление истории устройства пачками.
-- Выполните в SQL-редакторе Supabase после 006_deleted_devices.sql.
--
-- Проблема: при удалении устройства каскад (on delete cascade) стирает
-- всю его телеметрию одним запросом. При отправке раз в 10 с это сотни
-- тысяч строк, и запрос падает с
--   "canceling statement due to statement timeout".
--
-- Решение: админка вызывает purge_device_rows в цикле, каждый вызов
-- удаляет не больше p_limit строк и укладывается в таймаут. Когда
-- функция вернёт 0, строку devices можно удалять — каскаду уже нечего делать.
-- =====================================================================

create or replace function public.purge_device_rows(
  p_device_id text,
  p_limit int default 5000
) returns int
language plpgsql
security definer
as $$
declare
  deleted     int;
  cmd_deleted int;
begin
  delete from public.telemetry
  where id in (
    select id from public.telemetry
    where device_id = p_device_id
    limit p_limit
  );
  get diagnostics deleted = row_count;

  if deleted < p_limit then
    delete from public.commands
    where id in (
      select id from public.commands
      where device_id = p_device_id
      limit p_limit - deleted
    );
    get diagnostics cmd_deleted = row_count;
    deleted := deleted + cmd_deleted;
  end if;

  return deleted;
end;
$$;

revoke all on function public.purge_device_rows(text, int) from public, anon, authenticated;
