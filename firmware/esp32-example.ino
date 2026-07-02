/*
 * Пример прошивки ESP32 для шлюза esp32.kuzyak.in
 * Библиотеки: WiFi.h, PubSubClient (Nick O'Leary), ArduinoJson.
 *
 * Топики:
 *   devices/<deviceId>/status     — online/offline (offline через LWT)
 *   devices/<deviceId>/telemetry  — JSON с метриками
 *   devices/<deviceId>/command    — входящие команды от админки
 */
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

const char *WIFI_SSID = "your-ssid";
const char *WIFI_PASS = "your-pass";

// IP Raspberry Pi в локальной сети + порт Mosquitto (проброшен в compose).
const char *MQTT_HOST = "192.168.1.10";
const int MQTT_PORT = 1883;
const char *MQTT_USER = "esp32";
const char *MQTT_PASS = "change-me-esp32";

const char *DEVICE_ID = "esp32-livingroom";

WiFiClient net;
PubSubClient client(net);

char topicStatus[64];
char topicTelemetry[64];
char topicCommand[64];

unsigned long lastTelemetry = 0;

void handleCommand(char *topic, byte *payload, unsigned int length) {
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, payload, length)) return;

  const char *action = doc["action"];  // напр. "relay"
  if (strcmp(action, "relay") == 0) {
    bool on = doc["value"];
    digitalWrite(2, on ? HIGH : LOW);  // пример: реле на GPIO2
  }
  // ...другие команды
}

void connect() {
  while (!client.connected()) {
    // LWT: если устройство отвалится — брокер опубликует offline.
    if (client.connect(DEVICE_ID, MQTT_USER, MQTT_PASS,
                       topicStatus, 1, true, "{\"status\":\"offline\"}")) {
      client.publish(topicStatus, "{\"status\":\"online\"}", true);
      client.subscribe(topicCommand, 1);
    } else {
      delay(2000);
    }
  }
}

void setup() {
  pinMode(2, OUTPUT);
  snprintf(topicStatus, sizeof(topicStatus), "devices/%s/status", DEVICE_ID);
  snprintf(topicTelemetry, sizeof(topicTelemetry), "devices/%s/telemetry", DEVICE_ID);
  snprintf(topicCommand, sizeof(topicCommand), "devices/%s/command", DEVICE_ID);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  client.setServer(MQTT_HOST, MQTT_PORT);
  client.setCallback(handleCommand);
}

void loop() {
  if (!client.connected()) connect();
  client.loop();

  if (millis() - lastTelemetry > 10000) {
    lastTelemetry = millis();
    StaticJsonDocument<128> doc;
    doc["uptime"] = millis() / 1000;
    doc["rssi"] = WiFi.RSSI();
    doc["heap"] = ESP.getFreeHeap();
    char buf[128];
    size_t n = serializeJson(doc, buf);
    client.publish(topicTelemetry, buf, n);
  }
}
