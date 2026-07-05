-- =====================================================================
-- Retention mqtt_events через pg_cron (внутри Postgres / Supabase)
-- Выполните после 004_mqtt_events.sql в SQL-редакторе Supabase Studio.
--
-- Требуется расширение pg_cron (есть в self-hosted Supabase по умолчанию).
-- Проверка: SELECT * FROM cron.job;
-- =====================================================================

create extension if not exists pg_cron with schema extensions;

-- Пересоздать job, если скрипт запускают повторно
select cron.unschedule(jobid)
from cron.job
where jobname = 'cleanup-mqtt-events';

-- Каждый день в 03:00 UTC — удалить записи старше 7 дней
select cron.schedule(
  'cleanup-mqtt-events',
  '0 3 * * *',
  $$select public.cleanup_mqtt_events(7)$$
);

-- Проверка: должна появиться одна строка с jobname = cleanup-mqtt-events
-- SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname = 'cleanup-mqtt-events';
