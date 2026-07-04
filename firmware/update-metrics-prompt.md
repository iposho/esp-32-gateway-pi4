# Prompt: декларация метрик телеметрии в скетче ESP32

Обнови скетч ESP32 в `firmware/` так, чтобы **устройство само решало, какие метрики показывать в админке**.

## Контекст

Проект — MQTT-шлюз ESP32 Gateway (`esp32.kuzyak.in`).

Сейчас:
- Телеметрия публикуется в `devices/<deviceId>/telemetry` как произвольный JSON
- Команды декларируются в retained-топике `devices/<deviceId>/capabilities` (поле `commands`)
- Админка **динамически рисует UI** по декларации из capabilities

Нужно добавить в capabilities поля **`metrics`** и **`dashboard`**, чтобы прошивка описывала:
1. Какие метрики показывать на **компактной карточке** дашборда
2. Как группировать и подписывать метрики на **странице устройства**

Если `metrics` не задан — админка использует fallback (все ключи payload + дефолтные ip/rssi/uptime/heap на дашборде).

## Формат capabilities (retained JSON)

```json
{
  "commands": [ ... ],
  "metrics": [
    {
      "key": "ip",
      "label": "IP-адрес",
      "icon": "globe",
      "group": "Сеть",
      "dashboard": true,
      "order": 0
    },
    {
      "key": "rssi",
      "keys": ["rssi", "wifi_rssi"],
      "label": "Сигнал Wi-Fi",
      "icon": "signal",
      "format": "rssi",
      "group": "Сеть",
      "dashboard": true,
      "order": 1
    },
    {
      "key": "uptime",
      "keys": ["uptime", "uptime_s"],
      "label": "Аптайм",
      "icon": "clock",
      "format": "uptime",
      "group": "Система",
      "dashboard": true,
      "order": 2
    },
    {
      "key": "heap",
      "keys": ["free_heap", "heap"],
      "label": "Свободная RAM",
      "icon": "memory",
      "format": "bytes",
      "group": "Система",
      "dashboard": true,
      "order": 3
    },
    {
      "key": "temp",
      "label": "Температура",
      "icon": "thermometer",
      "format": "temperature",
      "unit": "°C",
      "group": "Датчики",
      "order": 10
    },
    {
      "key": "humidity",
      "label": "Влажность",
      "icon": "droplets",
      "format": "percent",
      "group": "Датчики",
      "order": 11
    },
    {
      "key": "fw_version",
      "label": "Версия прошивки",
      "icon": "cpu",
      "group": "Система",
      "order": 20
    }
  ],
  "dashboard": {
    "summary": ["ip", "rssi", "uptime", "heap"],
    "max_items": 4
  }
}
```

## Поля MetricDef

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `key` | string | да | Основной ключ в payload телеметрии |
| `keys` | string[] | нет | Альтернативные имена (alias), проверяются по порядку |
| `label` | string | нет | Подпись в UI; без неё — автогенерация из key |
| `unit` | string | нет | Единица, добавляется к значению |
| `icon` | string | нет | Иконка: `globe`, `signal`, `clock`, `memory`, `thermometer`, `droplets`, `battery`, `cpu`, `wifi`, `gauge`, `activity` |
| `format` | string | нет | Формат: `number`, `boolean`, `text`, `bytes`, `uptime`, `temperature`, `percent`, `rssi` |
| `group` | string | нет | Секция на странице устройства (по умолчанию «Телеметрия») |
| `dashboard` | boolean | нет | Показывать на компактной карточке дашборда |
| `order` | number | нет | Порядок сортировки |
| `hidden` | boolean | нет | Скрыть из UI (служебные поля) |

## Поле dashboard

| Поле | Тип | Описание |
|------|-----|----------|
| `summary` | string[] | Явный список `key` метрик для карточки на дашборде (приоритет над `dashboard: true`) |
| `max_items` | number | Максимум метрик на карточке (по умолчанию 4) |

## Что изменить в скetче

### 1. Расширить константу CAPABILITIES

Добавить массив `metrics` и объект `dashboard` к существующему JSON с `commands`.
Опиши **только те метрики, которые реально отправляются** в телеметрии.

Пример для `esp32-example.ino` (uptime, rssi, heap):

```cpp
const char *CAPABILITIES = R"({
  "commands": [ ... существующие команды ... ],
  "metrics": [
    { "key": "ip", "label": "IP", "icon": "globe", "group": "Сеть", "dashboard": true, "order": 0 },
    { "key": "rssi", "label": "Сигнал", "icon": "signal", "format": "rssi", "group": "Сеть", "dashboard": true, "order": 1 },
    { "key": "uptime", "label": "Аптайм", "icon": "clock", "format": "uptime", "group": "Система", "dashboard": true, "order": 2 },
    { "key": "heap", "keys": ["heap", "free_heap"], "label": "RAM", "icon": "memory", "format": "bytes", "group": "Система", "dashboard": true, "order": 3 },
    { "key": "fw_version", "label": "Прошивка", "icon": "cpu", "group": "Система", "order": 10 }
  ],
  "dashboard": {
    "summary": ["ip", "rssi", "uptime", "heap"],
    "max_items": 4
  }
})";
```

### 2. Добавить недостающие поля в телеметрию

Если метрика объявлена в `metrics`, она **должна присутствовать** в payload телеметрии:

```cpp
doc["uptime"] = millis() / 1000;
doc["rssi"] = WiFi.RSSI();
doc["heap"] = ESP.getFreeHeap();
doc["ip"] = WiFi.localIP().toString();
doc["fw_version"] = "1.0.0";
```

### 3. Служебные поля — не декларировать

Не добавляй в `metrics` служебные ключи, которые обрабатывает UI отдельно:
- `ota`, `progress` — прогресс OTA
- `last_photo_url`, `camera_ready`, `capture_count` — камера
- `pin_*`, `fs_*` — пины и файловая система

### 4. Публиковать capabilities при коннекте (retained)

Без изменений — `client.publish(topicCapabilities, CAPABILITIES, true);`

Node-RED сохранит `metrics` и `dashboard` в `devices.metadata` через RPC `merge_device_commands`.

## Проверка

После изменений:

1. ESP32 публикует retained capabilities с `commands`, `metrics`, `dashboard`
2. Телеметрия содержит все ключи из `metrics`
3. На дашборде — только метрики из `dashboard.summary` (или с `dashboard: true`)
4. На странице `/dashboard/devices/<id>` — все метрики, сгруппированные по `group`
5. Скетч компилируется без ошибок

## Пример для устройства с датчиками

Если скетч читает DHT22:

```cpp
// telemetry
doc["temp"] = dht.readTemperature();
doc["humidity"] = dht.readHumidity();

// capabilities metrics
{ "key": "temp", "label": "Температура", "icon": "thermometer", "format": "temperature", "group": "Климат", "dashboard": true, "order": 0 },
{ "key": "humidity", "label": "Влажность", "icon": "droplets", "format": "percent", "group": "Климат", "dashboard": true, "order": 1 }
```

```json
"dashboard": { "summary": ["temp", "humidity", "rssi"], "max_items": 3 }
```

## Связанные файлы в репозитории

- `lib/types.ts` — TypeScript-типы `MetricDef`, `DashboardMetricsConfig`
- `lib/metrics.ts` — парсинг и рендер метрик на UI
- `components/dashboard/device-card.tsx` — компактная карточка (дашборд)
- `components/dashboard/device-detail-view.tsx` — полная страница устройства
- `scripts/002_device_metrics.sql` — миграция RPC для сохранения metrics
- `node-red/flows.example.json` — обработка capabilities с metrics
