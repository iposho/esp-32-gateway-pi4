-- =====================================================================
-- Кормушка: результаты распознавания снимков нейронкой (lib/bird-classifier.ts).
-- Выполните в SQL-редакторе Supabase Studio или:
--   docker exec -i supabase-db psql -U postgres -d postgres \
--     < scripts/011_bird_detections.sql
--
-- Одна строка — один снимок с SD камеры, который шлюз отправил в модель.
-- id снимка на SD идут по кольцу из 4800, поэтому снимок определяется
-- парой (photo_id, shot_at).
-- =====================================================================

create table if not exists public.bird_detections (
  id            bigint generated always as identity primary key,
  device_id     text not null,
  photo_id      int not null,
  shot_at       timestamptz not null,
  -- null — модель не смогла ответить (см. error), снимок не считается
  is_bird       boolean,
  bird_count    smallint not null default 0,
  species       text,          -- русское название вида
  species_latin text,
  confidence    real,          -- уверенность в виде, 0..1
  model         text,
  input_tokens  int,
  output_tokens int,
  error         text,
  created_at    timestamptz not null default now(),
  unique (device_id, photo_id, shot_at)
);

create index if not exists bird_detections_device_shot_idx
  on public.bird_detections (device_id, shot_at desc);

-- Для дневного лимита запросов к модели
create index if not exists bird_detections_created_idx
  on public.bird_detections (created_at desc);

alter table public.bird_detections enable row level security;

drop policy if exists "Authenticated users can read bird_detections"
  on public.bird_detections;
create policy "Authenticated users can read bird_detections"
  on public.bird_detections for select
  to authenticated
  using (true);
