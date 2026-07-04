# Prompt: добавить декларацию команд в скетч ESP32

Обнови скетч ESP32 (`esp32-example.ino`) в `firmware/`.

## Контекст

Проект — MQTT-шлюз. ESP32 общается через брокер Mosquitto на Raspberry Pi.
Сейчас команды (`led`, `relay`, `reboot`) хардкодом и в прошивке, и в админке.

Нужно сделать так, чтобы скетч **сам декларировал свои команды** через новый топик `devices/<deviceId>/capabilities`. Админка будет читать их и динамически рисовать кнопки.

## Что изменить

### 1. Добавить новый топик capabilities

В `setup()` после `topicCommand`:

```cpp
char topicCapabilities[64];
// ...
snprintf(topicCapabilities, sizeof(topicCapabilities), "devices/%s/capabilities", DEVICE_ID);
```

### 2. Добавить константу CAPABILITIES

JSON с retained = true, чтобы админка всегда могла прочитать. Формат:

```cpp
const char *CAPABILITIES = R"({
  "commands": [
    {
      "action": "led",
      "title": "Светодиод",
      "type": "toggle",
      "icon": "lightbulb",
      "description": "Встроенный светодиод на GPIO (LED_BUILTIN)"
    },
    {
      "action": "relay",
      "title": "Реле",
      "type": "toggle",
      "icon": "zap",
      "description": "Реле на GPIO2"
    },
    {
      "action": "reboot",
      "title": "Перезагрузка",
      "type": "trigger",
      "icon": "rotate-cw",
      "description": "ESP.restart"
    }
  ]
})";
```

### 3. Публиковать CAPABILITIES при коннекте

В функции `connect()`, после публикации статуса `online` и подписки на command:

```cpp
client.publish(topicCapabilities, CAPABILITIES, true);
```

### 4. Обновить комментарий в начале файла

Добавить в список топиков:

```
 *   devices/<deviceId>/capabilities — retained JSON c описанием команд
```

### 5. Оставить handleCommand() без изменений

Логика выполнения команд не меняется, меняется только их декларация.

## Проверка

После изменений скетч должен:
- При коннекте публиковать retained-сообщение в `devices/<deviceId>/capabilities`
- Содержать ровно три команды: `led`, `relay`, `reboot`
- Сохранить всю существующую логику (WiFi, MQTT, телеметрия, LWT)
- Компилироваться без ошибок (библиотеки: WiFi.h, PubSubClient, ArduinoJson)
