-- =====================================================================
-- Кормушка: архив снимков, ушедших в модель, и разметка для проверки модели.
-- Выполните после 014_bird_ai_schedule.sql:
--   docker exec -i supabase-db psql -U postgres -d postgres \
--     < scripts/015_bird_photos.sql
--
-- Снимки лежат в Storage, бакет bird-photos (приватный, только service_role).
-- Разметка — ваш ответ «птица или нет» и вид: по ней /api/birdfeeder/eval
-- считает точность модели и промпта. Размечать — в Studio, например:
--   update bird_detections set label_bird = true,
--          label_species_latin = 'Parus major', labeled_at = now()
--    where id = 123;
-- =====================================================================

alter table public.bird_detections
  -- Уверенность модели, что птица есть, 0..1 (уверенность в виде — confidence)
  add column if not exists bird_confidence real,
  -- Версия промпта (BIRD_PROMPT_VERSION в lib/bird-ai.ts); null — до v3
  add column if not exists prompt_version text,
  -- Снимок в бакете bird-photos; null — архив выключен или Storage недоступен
  add column if not exists photo_path text,
  -- Кадр «без птиц», показанный модели для сравнения (BIRD_AI_REFERENCE=1)
  add column if not exists reference_path text,
  -- Разметка человеком: правильный ответ
  add column if not exists label_bird boolean,
  add column if not exists label_species_latin text,
  add column if not exists labeled_at timestamptz;

create index if not exists bird_detections_labeled_idx
  on public.bird_detections (id desc)
  where label_bird is not null and photo_path is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bird-photos', 'bird-photos', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;
