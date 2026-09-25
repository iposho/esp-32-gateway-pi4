-- =====================================================================
-- Retention для telemetry и mqtt_events.
-- Выполните после 004_mqtt_events.sql и 009_purge_speedup_and_autovacuum.sql.
--
-- Контекст:
--   Раньше retention был только у mqtt_events, и тот не работал: cron-джоба
--   падала каждую ночь с "function public.cleanup_mqtt_events(integer)
--   does not exist" — скрипт 004 был применён частично (таблица есть,
--   функции нет). В итоге mqtt_events доросла до 1,6 млн строк / 1,2 ГБ,
--   а telemetry вообще не чистилась — 1,2 млн строк / 766 МБ.
--
--   Дашборду такая глубина не нужна: /api/flamingo читает окно 24 ч,
--   страница устройства — последние 50 строк телеметрии.
--
-- Политика хранения:
--   telemetry    — 30 дней (запас на ручной разбор инцидентов)
--   mqtt_events  — 7 дней (журнал трафика, как и было задумано в 005)
--
-- ВАЖНО: применяй скрипт от имени supabase_admin, как и 009 — функции
-- принадлежат этой роли, из-под postgres получишь
-- "must be owner of function".
-- =====================================================================

-- ── 1. telemetry: удаление по created_at (индекс idx_telemetry_created_at)
-- p_batch = null — удалить всё устаревшее за один вызов (штатный режим
-- для cron). p_batch задан — удалить не больше N строк, чтобы разгрести
-- большой backlog мягкими порциями.
create or replace function public.cleanup_telemetry(
  keep_days int default 30,
  p_batch int default null
) returns bigint
language plpgsql
security definer
set statement_timeout = '900s'
as $$
declare
  cutoff  timestamptz := now() - make_interval(days => keep_days);
  deleted bigint;
begin
  if p_batch is null then
    delete from public.telemetry where created_at < cutoff;
    get diagnostics deleted = row_count;
    return deleted;
  end if;

  delete from public.telemetry t
   where t.ctid in (
     select ctid
       from public.telemetry
      where created_at < cutoff
      order by created_at
      limit p_batch
   );
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

-- ── 2. mqtt_events: та же схема (пересоздаём версию из 004)
create or replace function public.cleanup_mqtt_events(
  keep_days int default 7,
  p_batch int default null
) returns bigint
language plpgsql
security definer
set statement_timeout = '900s'
as $$
declare
  cutoff  timestamptz := now() - make_interval(days => keep_days);
  deleted bigint;
begin
  if p_batch is null then
    delete from public.mqtt_events where created_at < cutoff;
    get diagnostics deleted = row_count;
    return deleted;
  end if;

  delete from public.mqtt_events t
   where t.ctid in (
     select ctid
       from public.mqtt_events
      where created_at < cutoff
      order by created_at
      limit p_batch
   );
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

-- Функции вызываются только из pg_cron. Без revoke любой, кто вошёл в
-- админку, мог бы дёрнуть их через PostgREST как RPC, например
-- cleanup_telemetry(0) — и стереть всю историю.
revoke all on function public.cleanup_telemetry(int, int) from public, anon, authenticated;
revoke all on function public.cleanup_mqtt_events(int, int) from public, anon, authenticated;

-- ── 3. Autovacuum для mqtt_events: как у telemetry, чистка при ~2%
-- изменений вместо 20%, иначе bloat от ночных удалений копится месяцами.
alter table public.mqtt_events set (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_vacuum_cost_delay = 0,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_analyze_threshold = 1000
);

-- ── 4. Cron-джобы (время в UTC).
-- Пересоздаём оба, чтобы команда точно соответствовала новой сигнатуре.
select cron.unschedule(jobid)
  from cron.job
 where jobname in ('cleanup-mqtt-events', 'cleanup-telemetry');

-- Журнал трафика — ежедневно в 03:00, старше 7 дней
select cron.schedule(
  'cleanup-mqtt-events',
  '0 3 * * *',
  $$select public.cleanup_mqtt_events(7)$$
);

-- Телеметрия — ежедневно в 04:00, старше 30 дней
select cron.schedule(
  'cleanup-telemetry',
  '0 4 * * *',
  $$select public.cleanup_telemetry(30)$$
);

-- Проверка:
--   select jobid, jobname, schedule, command from cron.job order by jobid;
--   select jobid, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 5;
