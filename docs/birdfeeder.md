# Кормушка: ESP32-CAM → шлюз → kuzyak.in

Камера у кормушки сама делает кадр раз в секунду, ищет движение (без нейронки)
и сохраняет снимки с движением на SD. Шлюз кэширует ответы камеры в памяти
процесса `admin`, чтобы любое число зрителей сайта давало ESP32 не больше одного
запроса в секунду.

Если задан `AI_GATEWAY_API_KEY`, шлюз отправляет каждый новый снимок в модель
через Vercel AI Gateway и пишет ответ в `bird_detections`. Тогда визиты, последний
снимок и лента считаются только по подтверждённым птицам, а у снимков есть вид
(раздел «Распознавание птиц»).

```
esp32-bird-cam (LAN)                         Pi: esp32-admin                     kuzyak.in (Vercel)
 ├ /latest.jpg  кадр из RAM, 1 fps ───▶ /api/camera/birdfeeder/frame  1 с ─▶ /api/birdfeeder/frame/?b=<окно 2 с>  CDN s-maxage=10
 ├ /photo?id=N  снимок птицы с SD ───▶ /api/camera/birdfeeder/bird   10 мин ▶ /api/birdfeeder/bird/?id=N        CDN 60 с
 ├ /birds.json  журнал снимков ────▶ /api/camera/birdfeeder/birds 10 с ─▶ /api/birdfeeder/birds/              CDN 15 с
 └ MQTT telemetry: bird_last_at, ──▶ Node-RED → Supabase ─▶ /api/camera/birdfeeder 5 с ▶ /api/birdfeeder/  CDN 5 с
   bird_visits_today, daylight,
   motion, bird_photo_id, last_photo_url (IP камеры)
```

Новых контейнеров нет. IP камеры шлюз берёт из `last_photo_url` в телеметрии,
поэтому резервировать IP в роутере не обязательно.

## Эндпоинты шлюза

Все — под тем же `CAMERA_API_TOKEN`, что и `/api/camera/latest`
(`Authorization: Bearer …` или `?token=`), CORS открыт.

| Метод | Путь | Ответ |
|-------|------|-------|
| GET | `/api/camera/birdfeeder` | JSON `{ online, daylight, motion, birdLastAt, visitsToday, birdPhotoId, updatedAt, ai, motionVisitsToday, species, speciesToday }` |
| GET | `/api/camera/birdfeeder/frame` | JPEG — живой кадр (кэш 1 с, 503 если камера офлайн) |
| GET | `/api/camera/birdfeeder/bird?id=N` | JPEG — снимок с птицей с SD (без `id` — последний) |
| GET | `/api/camera/birdfeeder/birds` | JSON `{ shots: [{ id, at, bird, count, species, latin, confidence }] }` — последние снимки (до 24, новые первыми; кэш 10 с). Снимки, где нейронка не нашла птицу, убраны; `bird: null` — ещё не проверен |
| GET | `/api/camera/birdfeeder/stats` | JSON — статистика по подтверждённым птицам: `totalVisits`, `recentVisits` (30 дней), `species[{ species, latin, visits, recentVisits, firstSeenAt, lastSeenAt }]`, `byHour[24]` и `byDay[{ date, visits }]` за 30 дней (время `BIRDFEEDER_TZ`), `records{ busiestDay, earliest, latest, mostBirds }`. Кэш 5 мин |
| GET | `/api/camera/birdfeeder/usage` | JSON — расход модели в USD: `balanceUsd`, `today { calls, spentUsd }`, `days[]`, `last7Usd`, `last30Usd`, `avgPhotoUsd`, `daysLeft` (раздел «Расход в долларах») |
| POST | `/api/camera/birdfeeder/classify?id=N` | JSON — прогнать снимок N через модель с текущим промптом; в БД не пишет, в дневной лимит не входит, но вызов платный. Для отладки промпта |

## Переменные `.env`

```bash
# уже есть — используется и балконным виджетом
CAMERA_API_TOKEN=...
# необязательно, по умолчанию esp32-bird-cam
BIRDFEEDER_DEVICE_ID=esp32-bird-cam
```

## Развёртывание

1. **Прошивка камеры ≥ 1.2.0**, для настройки цвета — ≥ 1.3.3 (репозиторий `arduino`, скетч `esp32_bird_cam`):
   `./scripts/build-ota.sh birdcam` → OTA из дашборда шлюза. Раздел — только `min_spiffs`.
2. **Шлюз на Pi:**
   ```bash
   cd ~/esp32-gateway-pi4        # путь к репозиторию на Pi
   git pull
   grep -q '^BIRDFEEDER_DEVICE_ID=' .env || echo 'BIRDFEEDER_DEVICE_ID=esp32-bird-cam' >> .env
   docker compose up -d --build admin
   ```
   Остальные сервисы (mosquitto, nodered, telegram-bot) не трогаются.
3. **Проверка:**
   ```bash
   T=$(grep -m1 '^CAMERA_API_TOKEN=' .env | cut -d= -f2- | tr -d '"')
   curl -s -H "Authorization: Bearer $T" https://esp32.kuzyak.in/api/camera/birdfeeder | jq
   curl -s -o /tmp/f.jpg -w '%{http_code} %{size_download}\n' \
     -H "Authorization: Bearer $T" https://esp32.kuzyak.in/api/camera/birdfeeder/frame
   curl -s -o /dev/null -w '%{http_code}\n' https://esp32.kuzyak.in/api/camera/birdfeeder   # без токена → 401
   ```
   Ожидается: JSON с `"online": true`, кадр `200` размером 20–60 КБ.
   Если `online: false` — камера не шлёт телеметрию (смотри `devices/esp32-bird-cam/status` в MQTT).
   Если `frame` → 503 при `online: true` — контейнер `admin` не видит LAN-IP камеры:
   `docker exec esp32-admin wget -qO- http://<ip-камеры>/ota.json`.
4. **Сайт:** применить SQL из `sql/init.sql` репозитория `kuzyak.in` (колонка
   `system_settings.birdfeeder_widget` + обновлённая функция `get_public_system_settings`),
   затем в админке сайта «Виджеты → Кормушка» вписать `CAMERA_API_TOKEN` и включить.

## Распознавание птиц

Прошивка ловит только движение: ветки, тени и смену света она не отличает от птицы.
Поэтому решение «птица или нет» и вид принимает модель на шлюзе.

```
камера: движение → снимок на SD (SVGA 800×600; OV3660 на AI-Thinker — RGB565 VGA 640×480) → bird_photo_id в телеметрии
admin, раз в 15 с (lib/bird-classifier.ts):
  bird_photo_id сменился → /birds.json → новые снимки → JPEG → модель (AI Gateway)
  → bird_detections(is_bird, bird_count, species, species_latin, confidence, токены)
статус и лента → только is_bird = true
```

- **Промпт** учитывает особенности камеры: пересвеченное белое у OV3660 уходит в розовый,
  а птица вплотную к объективу выглядит размытым серым пятном, обрезанным краем кадра, —
  это тоже `bird=true` (вид обычно `null`). Цвет подбирается в прошивке ≥ 1.3.3
  слайдерами «Экспозиция», «Насыщенность», «Баланс белого» на странице камеры.
- **Часы работы** настраиваются в дашборде на карточке камеры (таблица `bird_ai_settings`,
  scripts/014): вне рабочего окна снимки не забираются с камеры и сразу пишутся
  с `model='filter:night'`. Птицы у кормушки дневные, а свет лампы или фонаря обманывает
  и детектор камеры, и фильтр по яркости. Доступны пресеты: «По солнцу, с сумерками»
  (по умолчанию: от начала утренних до конца вечерних гражданских сумерек), «От восхода до
  заката», «Восход −30 мин … закат +30 мин», фиксированные часы («06:00–20:00», «07:00–19:00»),
  «Круглосуточно» или своё время. Восход и закат запрашиваются из `sunrise-sunset.org`
  с автоматическим переходом на локальный расчёт NOAA (`lib/sun.ts`), если API недоступен.
  `BIRD_AI_NIGHT_SKIP=0` в `.env` принудительно отключает ограничение.
- **Тёмные снимки** в модель не уходят: шлюз раскодирует JPEG (`jpeg-js`, ~0,1 с на Pi)
  и считает среднюю яркость так же, как прошивка. Ниже `BIRD_AI_MIN_LUMA` (по умолчанию 40
  из 255) — строка `is_bird=false`, `model='filter:dark'`, без цены и без учёта в дневном
  лимите. Яркость каждого снимка пишется в лог (`luma N`) — по ней удобно подобрать порог.
  Прошивка ночью и так не ищет движение, но её порог (`DAYLIGHT_LUMA_*`, 30–45) не спасает
  от тёмной комнаты или фонаря.
- **Визит** — серия снимков с птицами без пауз дольше 60 с (как `BIRD_VISIT_GAP_MS`
  в прошивке). Вид визита — самый уверенный ответ модели среди его снимков.
  «Сегодня» считается по `BIRDFEEDER_TZ` (по умолчанию `Asia/Yerevan`).
- **Модель** — `BIRD_AI_MODEL`, по умолчанию `xiaomi/mimo-v2.6-flash`: самая дешёвая
  модель с тегом `vision` на Gateway. Рассуждения выключены (`reasoning: 'none'`), иначе
  они оплачиваются как выходные токены. Structured output (`Output.object`) не используется:
  MiMo схему игнорирует и отвечает произвольным JSON («есть птица»: «нет»). Поэтому JSON
  просим в промпте, а ответ разбираем терпимо к ключам (`bird`/`is_bird`/«есть птица»…)
  и типам («да», «80%»).
- **Стоимость:** около $0.0002–0.0003 за снимок, то есть $4 хватает на 15–20 тыс. снимков.
  Токены каждого запроса пишутся в `bird_detections.input_tokens/output_tokens`.
- **Защита кредитов:** не больше `BIRD_AI_DAILY_LIMIT` вызовов модели в сутки (по умолчанию 300),
  считаются и неудачные вызовы. За один проход (15 с) — не больше 3 вызовов, новые снимки первыми.
  После отказа Gateway по ключу или кредитам (401/402/403) цикл ждёт 30 мин,
  после 429 — 1 мин. Снимок, на котором модель трижды упала, записывается с `error`
  и больше не отправляется.
- **Без ключа** или с `BIRD_AI_DISABLED=1` всё работает как раньше: считает детектор камеры.
  Если таблицы `bird_detections` нет, статус тоже откатывается на детектор (в логе предупреждение).

### Расход в долларах

Каждый запрос уходит в Gateway с тегом `birdfeeder`. Сводку отдаёт
`/api/camera/birdfeeder/usage`, её же показывает карточка «Распознавание птиц» на
странице камеры в админке.

| Поле | Откуда | Что значит |
|------|--------|-----------|
| `balanceUsd`, `totalUsedUsd` | `gateway.getCredits()` | остаток и расход кредитов **всей команды** Vercel |
| `days[]`, `last7Usd`, `last30Usd`, `requests30` | отчёт Gateway по тегу `birdfeeder` | все вызовы кормушки, включая неудачные; дни в UTC, данные приходят с задержкой в несколько минут |
| `today { calls, spentUsd }` | счётчик процесса `admin` | сутки по `BIRDFEEDER_TZ`; после рестарта контейнера считается с нуля |
| `avgPhotoUsd` | `bird_detections.cost_usd` | средняя цена снимка по последним 200, с неудачными попытками |
| `budget { amountUsd, setAt, spentSinceUsd, remainingUsd }` | `bird_ai_budget` (scripts/013) | остаток кормушки, вписанный вручную: сумма на момент `setAt` минус `cost_usd` с тех пор |
| `daysLeft` | остаток ÷ средний дневной расход за 7 дней | на сколько дней хватит `budget.remainingUsd`, а если он не вписан — кредитов команды |

**Остаток редактируется в карточке** (карандаш на плитке «Остаток»): Gateway знает только
кредиты всей команды Vercel, поэтому сумму, выделенную на кормушку, вписываете вы. Сохраняет
`PUT /api/birdfeeder/budget { amountUsd }` — путь вне `/api/camera`, только для входа в админку,
`CAMERA_API_TOKEN` сайта туда не пускает. `amountUsd: null` — вернуться к кредитам команды.
Расход с момента записи берётся из `cost_usd`: вызовы без строки (упавшие до третьей попытки)
в него не попадают, а цена по прайсу бывает выше реальной — остаток скорее занижен.

Цена вызова берётся из ответа Gateway, а если её там нет — считается по токенам и прайсу
из `/v1/models`. Цена пишется в лог (`photo N: … (1234+40 tok, $0.000184, 2100 ms)`)
и в `bird_detections.cost_usd`: для колонки нужен `scripts/012_bird_detections_cost.sql`.
Без него строки пишутся без цены, в логе будет предупреждение.

Включение:

1. `scripts/011_bird_detections.sql`, `012_bird_detections_cost.sql` и `013_bird_ai_budget.sql` в Supabase.
2. В `.env` на Pi: `AI_GATEWAY_API_KEY=…` (vercel.com → AI Gateway → API Keys),
   по желанию `BIRD_AI_MODEL`, `BIRD_AI_DAILY_LIMIT`, `BIRDFEEDER_REGION`, `BIRDFEEDER_TZ`.
3. `docker compose up -d --build admin`, в логе: `[BirdAI] started, model …`.
4. После следующего визита: `docker logs esp32-admin | grep BirdAI` — строки
   `photo N: bird ×1 Большая синица 87% (… tok)` или `no bird`.

Что проверить по первым ответам:

```sql
select shot_at, is_bird, species, confidence, input_tokens, output_tokens, error
  from bird_detections order by shot_at desc limit 20;
```

## Калибровка детектора

Страница камеры `http://esp32-bird-cam.local/` показывает «Яркость», «Движение ‰»
и визиты. Пороги — константы `MOTION_*` / `DAYLIGHT_*` в `esp32_bird_cam.ino`:

- ложные визиты от веток/теней → поднять `MOTION_TRIGGER_PERMILLE` (20 → 30–40);
- мелкие птицы не ловятся → опустить его (20 → 10) или `MOTION_PIXEL_DIFF` (28 → 20);
- «ночь» включается слишком рано/поздно → `DAYLIGHT_LUMA_OFF` / `DAYLIGHT_LUMA_ON`.
- детектор ловит лишнее вокруг кормушки → сузить зону `MOTION_ROI_LEFT/TOP/RIGHT/BOTTOM_PCT`
  (проценты кадра, по умолчанию весь кадр);
- срабатывает на людей, руки, сдвинутую камеру → опустить `MOTION_MAX_BIRD_PERMILLE`
  (200 = 20% зоны; больше — не птица).

Детектор реагирует на движение и не распознаёт птиц: это делает шлюз (см. выше), поэтому
порог можно держать чувствительным — ложные снимки отсеет модель. До прошивки 1.2.4 он читал RGB565
не в том порядке байт, видел ~100‰ «изменений» на неподвижной сцене и писал ложный
визит каждые 10 с.

## Промпт для агента на Pi

Запускать в каталоге репозитория шлюза на Pi (Claude Code или аналог с доступом к shell):

```text
Ты на Raspberry Pi в репозитории esp32-gateway-pi4 (docker compose: admin, mosquitto,
nodered, telegram-bot). Нужно раскатить поддержку кормушки — подробности
в docs/birdfeeder.md. Задача:

1. git status: если есть локальные изменения — остановись и покажи их мне, ничего не
   откатывай. Иначе git pull.
2. В .env должен быть непустой CAMERA_API_TOKEN (не печатай его значение). Если нет
   строки BIRDFEEDER_DEVICE_ID — допиши BIRDFEEDER_DEVICE_ID=esp32-bird-cam. Другие строки .env
   не меняй.
3. Пересобери и перезапусти ТОЛЬКО сервис admin: docker compose up -d --build admin.
   Остальные контейнеры не перезапускай, volumes и сети не трогай, docker system prune
   не запускай.
4. Дождись healthy/running (docker compose ps admin, docker logs --tail 50 esp32-admin).
5. Проверь по разделу «Проверка» в docs/birdfeeder.md (токен читай из .env в переменную,
   в вывод не печатай):
   - GET https://esp32.kuzyak.in/api/camera/birdfeeder с Bearer → JSON, покажи его;
   - GET .../api/camera/birdfeeder/frame с Bearer → код и размер ответа;
   - GET .../api/camera/birdfeeder без токена → должен быть 401;
   - если online=false — покажи последние сообщения mosquitto_sub -C 3 -W 30
     -t devices/esp32-bird-cam/# (пользователь backend, пароль из .env MQTT_PASSWORD);
   - если frame=503 при online=true — проверь доступность IP камеры из контейнера
     (IP из last_photo_url в телеметрии): docker exec esp32-admin wget -qO- http://<ip>/ota.json
6. Отчитайся коротко: что сделал, результаты каждой проверки, что не получилось.
   Секреты (токены, пароли) в отчёт не включай.
```
