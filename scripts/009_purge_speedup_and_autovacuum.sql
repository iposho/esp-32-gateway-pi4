-- =====================================================================
-- Ускорение удаления устройств и защита от bloat таблицы telemetry.
-- Выполните в SQL-редакторе Supabase после 007_purge_device_rows.sql.
--
-- Что было не так:
--   1. PostgREST подключается ролью authenticator, у которой
--      statement_timeout = 8s. Этот таймаут наследуют запросы админки,
--      поэтому вызов purge_device_rows падал с
--      "canceling statement due to statement timeout".
--   2. Каждая успевшая примениться пачка добавляла мёртвые строки в
--      telemetry. Autovacuum не успевал: порог по умолчанию —
--      20% от 1,2 млн строк ≈ 250 тыс. мёртвых кортежей. Пока их было
--      меньше, таблица и индекс не чистились, индекс раздувался
--      (по одному device_id в индексе лежало 106 тыс. TID при
--      21 тыс. живых строк), и каждая следующая пачка читала десятки
--      тысяч страниц с диска — снова упираясь в 8s. Замкнутый круг.
--
-- Что делает этот скрипт:
--   1. Ставит функции свой statement_timeout, поэтому 8-секундный
--      лимит PostgREST её больше не касается.
--   2. Удаляет пачки по ctid: прямой поиск по индексу device_id без
--      повторного сканирования таблицы по id.
--   3. Включает агрессивный autovacuum для telemetry — bloat больше
--      не накапливается.
-- =====================================================================

-- 1 + 2. Пакетная очистка истории устройства
create or replace function public.purge_device_rows(
  p_device_id text,
  p_limit int default 5000
) returns int
language plpgsql
security definer
set statement_timeout = '120s'
set lock_timeout = '30s'
as $$
declare
  deleted     int := 0;
  cmd_deleted int := 0;
begin
  delete from public.telemetry t
   where t.ctid in (
     select ctid
       from public.telemetry
      where device_id = p_device_id
      limit p_limit
   );
  get diagnostics deleted = row_count;

  if deleted < p_limit then
    delete from public.commands c
     where c.ctid in (
       select ctid
         from public.commands
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

-- 3. Autovacuum для telemetry: чистка при ~2% изменений (≈25 тыс. строк)
--    вместо 20% (≈250 тыс.), плюс более частый ANALYZE.
alter table public.telemetry set (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_vacuum_cost_delay = 0,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_analyze_threshold = 1000
);

-- Разовая чистка уже накопленного bloat.
-- ВАЖНО: обычный VACUUM (не FULL) — таблицу не блокирует.
-- Параллельные воркеры отключены: в контейнере Supabase /dev/shm = 64 МБ,
-- и параллельный vacuum падает с "could not resize shared memory segment".
set max_parallel_maintenance_workers = 0;
vacuum (analyze) public.telemetry;

-- Проверка:
--   select n_live_tup, n_dead_tup from pg_stat_user_tables where relname = 'telemetry';
--   -- n_dead_tup должен быть близок к нулю
