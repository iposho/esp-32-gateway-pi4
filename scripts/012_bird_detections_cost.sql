-- =====================================================================
-- Кормушка: цена вызова модели в USD для каждого снимка.
-- Выполните после 011_bird_detections.sql:
--   docker exec -i supabase-db psql -U postgres -d postgres \
--     < scripts/012_bird_detections_cost.sql
--
-- Цена — из ответа AI Gateway, иначе по токенам и прайсу модели.
-- Включает неудачные попытки того же снимка. Точный расход по дням
-- (со всеми вызовами) — отчёт Gateway по тегу birdfeeder: /api/camera/birdfeeder/usage.
-- =====================================================================

alter table public.bird_detections
  add column if not exists cost_usd numeric(12, 8);
