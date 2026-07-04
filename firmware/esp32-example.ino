/*
 * Пример прошивки ESP32 для шлюза esp32.kuzyak.in
 * Библиотеки: WiFi.h, PubSubClient (Nick O'Leary), ArduinoJson, HTTPUpdate.
 *
 * Топики:
 *   devices/<deviceId>/status        — online/offline (offline через LWT)
 *   devices/<deviceId>/telemetry     — JSON с метриками (+ ota/progress при OTA)
 *   devices/<deviceId>/capabilities  — описание команд для UI (retained)
 *   devices/<deviceId>/command       — входящие команды от админки
 */
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <HTTPUpdate.h>

const char *WIFI_SSID = "your-ssid";
const char *WIFI_PASS = "your-pass";

// IP Raspberry Pi в локальной сети + порт Mosquitto (проброшен в compose).
const char *MQTT_HOST = "192.168.1.10";
const int MQTT_PORT = 1883;
const char *MQTT_USER = "esp32";
const char *MQTT_PASS = "change-me-esp32";

const char *DEVICE_ID = "esp32-livingroom";

// Публиковать прогресс OTA в телеметрию ({"ota":"downloading","progress":40}).
// По умолчанию включено для новых устройств.
#ifndef OTA_PROGRESS_TELEMETRY
#define OTA_PROGRESS_TELEMETRY true
#endif

WiFiClient net;
PubSubClient client(net);

char topicStatus[64];
char topicTelemetry[64];
char topicCommand[64];
char topicCapabilities[64];

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
  ],
  "metrics": [
    { "key": "ip", "label": "IP", "icon": "globe", "group": "Сеть", "dashboard": true, "order": 0 },
    { "key": "rssi", "label": "Сигнал", "icon": "signal", "format": "rssi", "group": "Сеть", "dashboard": true, "order": 1 },
    { "key": "uptime", "label": "Аптайм", "icon": "clock", "format": "uptime", "group": "Система", "dashboard": true, "order": 2 },
    { "key": "heap", "keys": ["heap", "free_heap"], "label": "RAM", "icon": "memory", "format": "bytes", "group": "Система", "dashboard": true, "order": 3 },
    { "key": "fw_version", "label": "Прошивка", "icon": "cpu", "group": "Система", "order": 10 },
    { "key": "fw_date", "label": "Дата прошивки", "icon": "clock", "format": "text", "group": "Система", "order": 11 }
  ],
  "dashboard": {
    "summary": ["ip", "rssi", "uptime", "heap"],
    "max_items": 4
  },
  "features": {
    "ota_progress": true
  }
})";

const char *FW_VERSION = "1.0.0";
const char *FW_BUILD_DATE = __DATE__ " " __TIME__;

unsigned long lastTelemetry = 0;
bool otaInProgress = false;
int lastOtaProgress = -1;
unsigned long lastOtaPublish = 0;

void publishTelemetryJson(JsonDocument &doc) {
  char buf[256];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  client.publish(topicTelemetry, buf, n);
}

void publishOtaStatus(const char *status, int progress = -1) {
  StaticJsonDocument<96> doc;
  doc["ota"] = status;
  if (OTA_PROGRESS_TELEMETRY && progress >= 0) {
    doc["progress"] = progress;
  }
  publishTelemetryJson(doc);
}

void publishOtaProgressThrottled(int progress) {
  if (!OTA_PROGRESS_TELEMETRY) return;
  unsigned long now = millis();
  if (progress == lastOtaProgress && now - lastOtaPublish < 2000) return;
  if (progress - lastOtaProgress < 5 && progress < 100 && now - lastOtaPublish < 1000)
    return;

  lastOtaProgress = progress;
  lastOtaPublish = now;
  publishOtaStatus("downloading", progress);
}

void performOta(const char *url) {
  if (!url || !url[0]) return;

  otaInProgress = true;
  lastOtaProgress = -1;
  publishOtaStatus("downloading", 0);

  HTTPUpdate httpUpdate;
  httpUpdate.onProgress([](size_t current, size_t total) {
    if (total == 0) return;
    int pct = (int)((current * 100UL) / total);
    publishOtaProgressThrottled(pct);
  });

  WiFiClient httpClient;
  t_httpUpdate_return ret = httpUpdate.update(httpClient, url);

  otaInProgress = false;

  if (ret == HTTP_UPDATE_OK) {
    publishOtaStatus("success", 100);
    delay(500);
    ESP.restart();
    return;
  }

  publishOtaStatus("failed", lastOtaProgress >= 0 ? lastOtaProgress : 0);
  Serial.printf("[OTA] failed, err=%d\n", httpUpdate.getLastError());
}

void handleCommand(char *topic, byte *payload, unsigned int length) {
  StaticJsonDocument<384> doc;
  if (deserializeJson(doc, payload, length)) return;

  const char *action = doc["action"];
  if (!action) return;

  if (strcmp(action, "led") == 0) {
    bool on = doc["value"] | false;
    digitalWrite(LED_BUILTIN, on ? HIGH : LOW);
    return;
  }

  if (strcmp(action, "relay") == 0) {
    bool on = doc["value"] | false;
    digitalWrite(2, on ? HIGH : LOW);
    return;
  }

  if (strcmp(action, "reboot") == 0) {
    delay(100);
    ESP.restart();
    return;
  }

  if (strcmp(action, "ota") == 0) {
    const char *url = doc["url"];
    performOta(url);
  }
}

void connect() {
  while (!client.connected()) {
    // LWT: если устройство отвалится — брокер опубликует offline.
    if (client.connect(DEVICE_ID, MQTT_USER, MQTT_PASS,
                       topicStatus, 1, true, "{\"status\":\"offline\"}")) {
      client.publish(topicStatus, "{\"status\":\"online\"}", true);
      client.publish(topicCapabilities, CAPABILITIES, true);
      client.subscribe(topicCommand, 1);
    } else {
      Serial.printf("[MQTT] connect failed, rc=%d\n", client.state());
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(2, OUTPUT);
  snprintf(topicStatus, sizeof(topicStatus), "devices/%s/status", DEVICE_ID);
  snprintf(topicTelemetry, sizeof(topicTelemetry), "devices/%s/telemetry", DEVICE_ID);
  snprintf(topicCommand, sizeof(topicCommand), "devices/%s/command", DEVICE_ID);
  snprintf(topicCapabilities, sizeof(topicCapabilities), "devices/%s/capabilities", DEVICE_ID);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  client.setServer(MQTT_HOST, MQTT_PORT);
  client.setCallback(handleCommand);
}

void loop() {
  if (!client.connected()) connect();
  client.loop();

  if (otaInProgress) return;

  if (millis() - lastTelemetry > 10000) {
    lastTelemetry = millis();
    StaticJsonDocument<192> doc;
    doc["uptime"] = millis() / 1000;
    doc["rssi"] = WiFi.RSSI();
    doc["heap"] = ESP.getFreeHeap();
    doc["ip"] = WiFi.localIP().toString();
    doc["fw_version"] = FW_VERSION;
    doc["fw_date"] = FW_BUILD_DATE;
    publishTelemetryJson(doc);
  }
}
