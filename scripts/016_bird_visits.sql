-- =====================================================================
-- Кормушка: визиты птиц считаются в БД, а не в admin.
-- Выполните после 011_bird_detections.sql:
--   docker exec -i supabase-db psql -U postgres -d postgres \
--     < scripts/016_bird_visits.sql
--
-- Визит — серия снимков с птицами (is_bird) без пауз дольше p_gap_seconds
-- (BIRD_VISIT_GAP_MS в lib/birdfeeder.ts). Вид визита — самый уверенный
-- ответ модели среди его снимков с названным видом, при равенстве — ранний.
-- Статистика (lib/bird-stats.ts) получает по строке на визит вместо всех снимков.
-- =====================================================================

create or replace function public.bird_visits(p_device_id text, p_gap_seconds int default 60)
returns table (
  started_at    timestamptz,
  species       text,
  species_latin text,
  confidence    real,
  max_count     int
)
language sql
stable
security definer
set search_path = public
as $$
  with shots as (
    select shot_at, bird_count, species, species_latin, confidence,
           case
             when shot_at - lag(shot_at) over (order by shot_at)
                  <= make_interval(secs => p_gap_seconds) then 0
             else 1
           end as is_new
      from bird_detections
     where device_id = p_device_id and is_bird
  ),
  numbered as (
    select *, sum(is_new) over (order by shot_at rows unbounded preceding) as visit
      from shots
  ),
  ranked as (
    select *,
           row_number() over (
             partition by visit
             order by case when species is null then -1 else coalesce(confidence, 0) end desc, shot_at
           ) as rn
      from numbered
  )
  select min(shot_at),
         max(species) filter (where rn = 1),
         max(species_latin) filter (where rn = 1),
         max(confidence) filter (where rn = 1 and species is not null),
         max(bird_count)::int
    from ranked
   group by visit
   order by min(shot_at)
$$;

-- Вызывает только admin (service_role)
revoke all on function public.bird_visits(text, int) from public, anon, authenticated;
grant execute on function public.bird_visits(text, int) to service_role;

-- Снимки с птицами одной кормушки по времени — для оконных функций выше
create index if not exists bird_detections_birds_idx
  on public.bird_detections (device_id, shot_at)
  where is_bird;
