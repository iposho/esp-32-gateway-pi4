# Кормушка: ESP32-CAM → шлюз → kuzyak.in

Камера у кормушки сама делает кадр раз в секунду, ищет движение (без нейронки)
и сохраняет снимки с птицами на SD. Шлюз **ничего не считает и не хранит** —
только кэширует ответы камеры в памяти процесса `admin`, чтобы любое число
зрителей сайта давало ESP32 не больше одного запроса в секунду.

```
esp32-bird-cam (LAN)                         Pi: esp32-admin                     kuzyak.in (Vercel)
 ├ /latest.jpg  кадр из RAM, 1 fps ───▶ /api/camera/birdfeeder/frame  1 с ─▶ /api/birdfeeder/frame/?b=<окно 2 с>  CDN s-maxage=10
 ├ /photo?id=N  снимок птицы с SD ───▶ /api/camera/birdfeeder/bird   10 мин ▶ /api/birdfeeder/bird/?id=N        CDN 1 ч
 ├ /birds.json  журнал снимков ────▶ /api/camera/birdfeeder/birds 10 с ─▶ /api/birdfeeder/birds/              CDN 15 с
 └ MQTT telemetry: bird_last_at, ──▶ Node-RED → Supabase ─▶ /api/camera/birdfeeder 5 с ▶ /api/birdfeeder/  CDN 5 с
   bird_visits_today, daylight,
   motion, bird_photo_id, last_photo_url (IP камеры)
```

Новых контейнеров нет. IP камеры шлюз берёт из `last_photo_url` в телеметрии,
поэтому резервировать IP в роутере не обязательно.

## Эндпоинты шлюза

Все четыре — под тем же `CAMERA_API_TOKEN`, что и `/api/camera/latest`
(`Authorization: Bearer …` или `?token=`), CORS открыт.

| Метод | Путь | Ответ |
|-------|------|-------|
| GET | `/api/camera/birdfeeder` | JSON `{ online, daylight, motion, birdLastAt, visitsToday, birdPhotoId, updatedAt }` |
| GET | `/api/camera/birdfeeder/frame` | JPEG — живой кадр (кэш 1 с, 503 если камера офлайн) |
| GET | `/api/camera/birdfeeder/bird?id=N` | JPEG — снимок с птицей с SD (без `id` — последний) |
| GET | `/api/camera/birdfeeder/birds` | JSON `{ shots: [{ id, at }] }` — последние снимки с птицами (до 24, новые первыми; кэш 10 с) |

## Переменные `.env`

```bash
# уже есть — используется и балконным виджетом
CAMERA_API_TOKEN=...
# необязательно, по умолчанию esp32-bird-cam
BIRDFEEDER_DEVICE_ID=esp32-bird-cam
```

## Развёртывание

1. **Прошивка камеры ≥ 1.2.0** (репозиторий `arduino`, скетч `esp32_cam`):
   `./scripts/build-ota.sh cam` → OTA из дашборда шлюза. Раздел — только `min_spiffs`.
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

## Калибровка детектора

Страница камеры `http://esp32-bird-cam.local/` показывает «Яркость», «Движение ‰»
и визиты. Пороги — константы `MOTION_*` / `DAYLIGHT_*` в `esp32_cam.ino`:

- ложные визиты от веток/теней → поднять `MOTION_TRIGGER_PERMILLE` (20 → 30–40);
- мелкие птицы не ловятся → опустить его (20 → 10) или `MOTION_PIXEL_DIFF` (28 → 20);
- «ночь» включается слишком рано/поздно → `DAYLIGHT_LUMA_OFF` / `DAYLIGHT_LUMA_ON`.

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
