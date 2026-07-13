/*
 * esp32-bedroom — Camelion WiFi-лампа + KY-040 энкодер
 *
 * Плата: ESP32 Dev Module, Partition Scheme: Default (4MB with spiffs/OTA)
 *
 * Подключение KY-040:
 *   CLK → GPIO 25, DT → GPIO 26, SW → GPIO 27, VCC → 3.3V, GND → GND
 *
 * Библиотеки: WiFi.h, PubSubClient, ArduinoJson, HTTPUpdate
 *
 * Топики:
 *   devices/esp32-bedroom/status        — online/offline (LWT)
 *   devices/esp32-bedroom/telemetry     — телеметрия (каждые 10 с + сразу при смене)
 *   devices/esp32-bedroom/capabilities  — retained JSON с командами (для админки)
 *   devices/esp32-bedroom/command       — входящие команды от админки
 *   devices/esp32-bedroom/out/camelion  — relay-команды на Python-мост (RPi)
 *
 * Телеметрия:
 *   - Каждые 10 с
 *   - Сразу после MQTT-connect (ensureMqtt)
 *   - Сразу после изменения любого toggle-состояния (camelion_power, camelion_brightness, camelion_temp, led)
 *   - Встроенный LED (GPIO 2) выключен по умолчанию, Active LOW
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <ArduinoJson.h>

// =====================
// Configuration
// =====================

// Wi-Fi and MQTT credentials — copy secrets.example.h to secrets.h and fill in
#ifndef SECRETS_H
#define SECRETS_H

#define WIFI_SSID        "your_wifi_ssid"
#define WIFI_PASS        "your_wifi_password"
#define DEVICE_HOSTNAME  "esp32-bedroom"

// MQTT-broker (Mosquitto на Raspberry Pi)
#define MQTT_HOST        "192.168.100.43"
#define MQTT_PORT        1883
#define MQTT_USER        "esp32"
#define MQTT_PASS        "change-me-esp32"

#endif

// Firmware version
#ifndef FW_VERSION
#define FW_VERSION "1.0.0"
#endif

#define FW_BUILD_DATE __DATE__
#define FW_BUILD_TIME __TIME__

// =====================
// Built-in LED (GPIO 2)
// =====================
#ifndef LED_BUILTIN
#define LED_BUILTIN 2
#endif

// =====================
// KY-040 Encoder pins
// =====================
#define ENCODER_CLK  25
#define ENCODER_DT   26
#define ENCODER_SW   27

// Направление энкодера: замените на !digitalRead(DT) если направление инвертировано
#define ENCODER_DIR(dt, clk)  digitalRead(dt)

// Acceleration thresholds
#define ENCODER_ACCEL_STEP1   1   // медленное вращение
#define ENCODER_ACCEL_STEP2   5   // среднее
#define ENCODER_ACCEL_STEP3   10  // быстрое
#define ENCODER_ACCEL_STEP4   20  // очень быстрое
#define ENCODER_ACCEL_MS1     120 // порог медленного
#define ENCODER_ACCEL_MS2     60  // порог среднего
#define ENCODER_ACCEL_MS3     30  // порог быстрого

#define BUTTON_DEBOUNCE_MS  50UL
#define LONG_PRESS_MS       600UL
#define DOUBLE_CLICK_MS     400UL

// =====================
// Intervals
// =====================
const unsigned long MQTT_TELEMETRY_INTERVAL = 10UL * 1000UL;
const unsigned long WIFI_RETRY_INTERVAL     = 30UL * 1000UL;

// =====================
// MQTT topics
// =====================
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

char topicStatus[64];
char topicTelemetry[64];
char topicCommand[64];
char topicCapabilities[64];
char topicCamelionOut[64];
bool mqttTopicsReady = false;

// =====================
// Capabilities JSON (retained)
// =====================
const char *CAPABILITIES = R"CAP({
  "commands": [
    {
      "action": "camelion_power",
      "title": "Лампа Camelion",
      "type": "toggle",
      "icon": "lightbulb",
      "description": "Вкл/выкл лампу Camelion"
    },
    {
      "action": "camelion_brightness",
      "title": "Яркость",
      "type": "range",
      "min": 0,
      "max": 100,
      "icon": "sun"
    },
    {
      "action": "camelion_temp",
      "title": "Температура",
      "type": "range",
      "min": 0,
      "max": 100,
      "icon": "thermometer"
    },
    {
      "action": "reboot",
      "title": "Перезагрузка",
      "type": "trigger",
      "icon": "rotate-cw",
      "description": "ESP.restart()"
    }
  ],
  "metrics": [
    { "key": "ip", "label": "IP-адрес", "icon": "globe", "group": "Сеть", "dashboard": true, "order": 0 },
    { "key": "rssi", "label": "Сигнал Wi-Fi", "icon": "signal", "format": "rssi", "group": "Сеть", "dashboard": true, "order": 1 },
    { "key": "uptime", "label": "Аптайм", "icon": "clock", "format": "uptime", "group": "Система", "dashboard": true, "order": 2 },
    { "key": "heap", "keys": ["heap", "free_heap"], "label": "Свободная RAM", "icon": "memory", "format": "bytes", "group": "Система", "dashboard": true, "order": 3 },
    { "key": "camelion_power", "label": "Лампа", "icon": "lightbulb", "format": "boolean", "group": "Camelion", "dashboard": true, "order": 4 },
    { "key": "camelion_brightness", "label": "Яркость", "icon": "sun", "format": "percent", "group": "Camelion", "dashboard": true, "order": 5 },
    { "key": "camelion_temp", "label": "Температура", "icon": "thermometer", "format": "percent", "group": "Camelion", "order": 6 },
    { "key": "fw_version", "label": "Версия прошивки", "icon": "cpu", "group": "Система", "order": 20 }
  ],
  "dashboard": {
    "summary": ["camelion_power", "camelion_brightness", "rssi", "uptime"],
    "max_items": 4
  }
})CAP";

// =====================
// State
// =====================
bool boardLedOn = false;

// Camelion lamp state (local — что хотим от лампы)
bool   camelionPower      = false;
int    camelionBrightness = 100;   // 0–100
int    camelionTemp       = 50;    // 0–100 (0=тёплый, 100=холодный)

// Encoder
volatile int encoderDelta = 0;
unsigned long lastEncoderTick = 0;
unsigned long encoderPressTime = 0;

// Button
bool lastSwState = HIGH;
unsigned long lastSwChange = 0;
bool longPressActive = false;
unsigned long lastClickTime = 0;

char statusLine[64] = "Booting";

unsigned long lastMqttTelemetry = 0;
unsigned long lastWifiRetry = 0;

char otaUrl[256] = "";
bool otaPending = false;
int lastOtaProgress = -1;

// =====================
// Forward declarations
// =====================
void setStatus(const char* msg);
void setBoardLed(bool on);
void handleEncoder();
void handleButton();
void connectWiFi();
void initMqttTopics();
void ensureMqtt();
void publishMqttTelemetry();
void publishCamelionCommand(const char* action, int value);
void camelionToggle();
void camelionSetBrightness(int val);
void camelionSetTemp(int val);
void queueOtaUpdate(const char* url);
void performOtaUpdate(const char* url);
void handleMqttCommand(char* topic, byte* payload, unsigned int length);

// =====================
// Helpers: firmware info
// =====================
void logFirmwareInfo(const char* device) {
  Serial.printf("[FW] %s version=%s build=%s %s\n",
                device, FW_VERSION, FW_BUILD_DATE, FW_BUILD_TIME);
}

void addFirmwareTelemetry(JsonDocument& doc) {
  doc["fw_version"] = FW_VERSION;
  doc["fw_build"] = FW_BUILD_DATE " " FW_BUILD_TIME;
}

void addNetworkTelemetry(JsonDocument& doc) {
  if (WiFi.status() == WL_CONNECTED) {
    doc["ip"] = WiFi.localIP().toString();
    doc["wifi_ssid"] = WiFi.SSID();
    doc["rssi"] = WiFi.RSSI();
  } else {
    doc["ip"] = "";
    doc["wifi_ssid"] = "";
    doc["rssi"] = 0;
  }
}

// =====================
// Encoder interrupt
// =====================
void IRAM_ATTR handleEncoderISR() {
  int dt = ENCODER_DIR(ENCODER_DT, ENCODER_CLK);
  int clk = digitalRead(ENCODER_CLK);
  if (dt == clk) {
    encoderDelta--;
  } else {
    encoderDelta++;
  }
}

// =====================
// Helpers
// =====================
void setStatus(const char* msg) {
  strncpy(statusLine, msg, sizeof(statusLine) - 1);
  statusLine[sizeof(statusLine) - 1] = '\0';
  Serial.printf("[Status] %s\n", statusLine);
}

void setBoardLed(bool on) {
  boardLedOn = on;
  digitalWrite(LED_BUILTIN, on ? LOW : HIGH);
}

// =====================
// Encoder processing (called from loop)
// =====================
void handleEncoder() {
  int delta;
  noInterrupts();
  delta = encoderDelta;
  encoderDelta = 0;
  interrupts();

  if (delta == 0) return;

  unsigned long now = millis();
  unsigned long gap = now - lastEncoderTick;
  lastEncoderTick = now;

  // Acceleration
  int step;
  if (gap < ENCODER_ACCEL_MS3) {
    step = ENCODER_ACCEL_STEP4;
  } else if (gap < ENCODER_ACCEL_MS2) {
    step = ENCODER_ACCEL_STEP3;
  } else if (gap < ENCODER_ACCEL_MS1) {
    step = ENCODER_ACCEL_STEP2;
  } else {
    step = ENCODER_ACCEL_STEP1;
  }

  bool holding = (digitalRead(ENCODER_SW) == LOW);

  if (delta > 0) {
    // CW
    if (holding) {
      camelionTemp = constrain(camelionTemp + step, 0, 100);
      camelionSetTemp(camelionTemp);
      Serial.printf("[Encoder] Temp +%d → %d\n", step, camelionTemp);
    } else {
      if (!camelionPower) {
        camelionPower = true;
        publishCamelionCommand("power", 1);
      }
      camelionBrightness = constrain(camelionBrightness + step, 0, 100);
      camelionSetBrightness(camelionBrightness);
      Serial.printf("[Encoder] Bright +%d → %d\n", step, camelionBrightness);
    }
  } else {
    // CCW
    if (holding) {
      camelionTemp = constrain(camelionTemp - step, 0, 100);
      camelionSetTemp(camelionTemp);
      Serial.printf("[Encoder] Temp -%d → %d\n", step, camelionTemp);
    } else {
      camelionBrightness = constrain(camelionBrightness - step, 0, 100);
      if (camelionBrightness == 0 && camelionPower) {
        camelionPower = false;
        publishCamelionCommand("power", 0);
      }
      camelionSetBrightness(camelionBrightness);
      Serial.printf("[Encoder] Bright -%d → %d\n", step, camelionBrightness);
    }
  }

  publishMqttTelemetry();
}

// =====================
// Button processing (called from loop)
// =====================
void handleButton() {
  bool reading = digitalRead(ENCODER_SW);
  unsigned long now = millis();

  if (reading != lastSwState) {
    lastSwChange = now;
    lastSwState = reading;
    return;
  }
  if (now - lastSwChange < BUTTON_DEBOUNCE_MS) return;

  if (reading == LOW) {
    if (!longPressActive && (now - lastSwChange >= LONG_PRESS_MS)) {
      longPressActive = true;
      camelionBrightness = 100;
      if (!camelionPower) {
        camelionPower = true;
        publishCamelionCommand("power", 1);
      }
      camelionSetBrightness(camelionBrightness);
      publishMqttTelemetry();
      Serial.println("[Button] Long press → 100% brightness");
    }
  }

  if (reading == HIGH && longPressActive) {
    longPressActive = false;
    lastSwChange = now;
    Serial.println("[Button] Long press release");
  }

  if (reading == HIGH && !longPressActive && (now - lastSwChange >= BUTTON_DEBOUNCE_MS)) {
    if (now - lastClickTime <= DOUBLE_CLICK_MS) {
      lastClickTime = 0;
      Serial.println("[Button] Double click (mode cycle — not yet implemented)");
    } else {
      lastClickTime = now;
      camelionPower = !camelionPower;
      publishCamelionCommand("power", camelionPower ? 1 : 0);
      publishMqttTelemetry();
      Serial.printf("[Button] Click → power %s\n", camelionPower ? "ON" : "OFF");
    }
    lastSwChange = now;
  }
}

// =====================
// Camelion commands via MQTT
// =====================
void publishCamelionCommand(const char* action, int value) {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<96> doc;
  doc["action"] = action;
  doc["value"] = value;

  char buf[96];
  size_t n = serializeJson(doc, buf);
  mqttClient.publish(topicCamelionOut, buf, n);
  mqttClient.loop();
  Serial.printf("[Camelion] -> %s: %d\n", action, value);
}

void camelionToggle() {
  camelionPower = !camelionPower;
  publishCamelionCommand("power", camelionPower ? 1 : 0);
  publishMqttTelemetry();
}

void camelionSetBrightness(int val) {
  camelionBrightness = constrain(val, 0, 100);
  if (val == 0) {
    camelionPower = false;
    publishCamelionCommand("power", 0);
  } else {
    if (!camelionPower) {
      camelionPower = true;
      publishCamelionCommand("power", 1);
    }
    publishCamelionCommand("brightness", camelionBrightness);
  }
  publishMqttTelemetry();
}

void camelionSetTemp(int val) {
  camelionTemp = constrain(val, 0, 100);
  publishCamelionCommand("mode", 0); // white mode
  publishCamelionCommand("temperature", camelionTemp);
  publishMqttTelemetry();
}

// =====================
// Wi-Fi
// =====================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  WiFi.mode(WIFI_STA);
  WiFi.setHostname(DEVICE_HOSTNAME);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi connecting");

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" OK");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    setStatus("WiFi connected");
  } else {
    Serial.println(" FAILED");
    setStatus("WiFi failed");
  }
}

// =====================
// MQTT
// =====================
void initMqttTopics() {
  if (mqttTopicsReady) return;

  snprintf(topicStatus, sizeof(topicStatus), "devices/%s/status", DEVICE_HOSTNAME);
  snprintf(topicTelemetry, sizeof(topicTelemetry), "devices/%s/telemetry", DEVICE_HOSTNAME);
  snprintf(topicCommand, sizeof(topicCommand), "devices/%s/command", DEVICE_HOSTNAME);
  snprintf(topicCapabilities, sizeof(topicCapabilities), "devices/%s/capabilities", DEVICE_HOSTNAME);
  snprintf(topicCamelionOut, sizeof(topicCamelionOut), "devices/%s/out/camelion", DEVICE_HOSTNAME);

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(handleMqttCommand);
  mqttClient.setBufferSize(1024);
  mqttTopicsReady = true;
}

void handleMqttCommand(char* topic, byte* payload, unsigned int length) {
  Serial.printf("[MQTT] << %s (%u): %.*s\n", topic, length, length, payload);

  DynamicJsonDocument doc(length + 64);
  if (deserializeJson(doc, payload, length)) {
    Serial.println("[MQTT] JSON parse error");
    return;
  }

  const char* action = doc["action"];
  if (!action) {
    Serial.println("[MQTT] no action field");
    return;
  }
  Serial.printf("[MQTT] action=%s\n", action);

  if (strcmp(action, "camelion_power") == 0 || strcmp(action, "camelion") == 0) {
    if (doc["value"].is<bool>()) {
      camelionPower = doc["value"];
    } else if (doc["value"].is<int>()) {
      camelionPower = (doc["value"] != 0);
    } else {
      camelionPower = !camelionPower;
    }
    publishCamelionCommand("power", camelionPower ? 1 : 0);
    publishMqttTelemetry();
    return;
  }

  if (strcmp(action, "camelion_brightness") == 0) {
    if (doc["value"].is<int>()) {
      camelionSetBrightness(doc["value"]);
    }
    return;
  }

  if (strcmp(action, "camelion_temp") == 0) {
    if (doc["value"].is<int>()) {
      camelionSetTemp(doc["value"]);
    }
    return;
  }

  if (strcmp(action, "reboot") == 0) {
    Serial.println("[MQTT] reboot");
    delay(300);
    ESP.restart();
    return;
  }

  Serial.printf("[MQTT] unknown action: %s\n", action);
}

void ensureMqtt() {
  if (WiFi.status() != WL_CONNECTED) return;

  initMqttTopics();

  if (mqttClient.connected()) return;

  if (mqttClient.connect(DEVICE_HOSTNAME, MQTT_USER, MQTT_PASS,
                         topicStatus, 1, true, "{\"status\":\"offline\"}")) {
    mqttClient.publish(topicStatus, "{\"status\":\"online\"}", true);
    mqttClient.subscribe(topicCommand, 1);
    if (mqttClient.publish(topicCapabilities, CAPABILITIES, true)) {
      Serial.printf("[MQTT] capabilities -> %s\n", topicCapabilities);
    } else {
      Serial.printf("[MQTT] capabilities publish FAILED (%u bytes)\n", strlen(CAPABILITIES));
    }
    Serial.println("[MQTT] connected");
    Serial.printf("[MQTT] command  <- %s\n", topicCommand);
    Serial.printf("[MQTT] telemetry -> %s\n", topicTelemetry);
    Serial.printf("[MQTT] camelion -> %s\n", topicCamelionOut);
    setStatus("MQTT connected");
    publishMqttTelemetry();
  } else {
    Serial.printf("[MQTT] connect failed, rc=%d\n", mqttClient.state());
  }
}

void publishMqttTelemetry() {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<384> doc;
  doc["uptime"] = millis() / 1000UL;
  doc["heap"] = ESP.getFreeHeap();
  doc["camelion_power"] = camelionPower;
  doc["camelion_brightness"] = camelionBrightness;
  doc["camelion_temp"] = camelionTemp;
  doc["led"] = boardLedOn;
  addNetworkTelemetry(doc);
  addFirmwareTelemetry(doc);

  char buf[384];
  size_t n = serializeJson(doc, buf);
  mqttClient.publish(topicTelemetry, buf, n);
}

// =====================
// OTA (minimal — full progress in ota_mqtt.h)
// =====================
void queueOtaUpdate(const char* url) {
  strncpy(otaUrl, url, sizeof(otaUrl) - 1);
  otaUrl[sizeof(otaUrl) - 1] = '\0';
  otaPending = true;
}

void performOtaUpdate(const char* url) {
  Serial.printf("[OTA] starting: %s (heap=%u)\n", url, ESP.getFreeHeap());
  setStatus("OTA starting");

  WiFi.setSleep(WIFI_PS_NONE);

  t_httpUpdate_return ret = httpUpdate.update(wifiClient, url);
  if (ret != HTTP_UPDATE_OK) {
    Serial.printf("[OTA] failed: %s\n", httpUpdate.getLastErrorString().c_str());
    setStatus("OTA failed");
  }
}

// =====================
// Setup / loop
// =====================
void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(ENCODER_CLK, INPUT_PULLUP);
  pinMode(ENCODER_DT, INPUT_PULLUP);
  pinMode(ENCODER_SW, INPUT_PULLUP);
  setBoardLed(false);

  attachInterrupt(digitalPinToInterrupt(ENCODER_CLK), handleEncoderISR, RISING);

  lastSwState = digitalRead(ENCODER_SW);
  lastSwChange = millis();

  Serial.println();
  Serial.println("ESP32 Bedroom Camelion Controller (KY-040)");
  logFirmwareInfo("esp32-bedroom");
  Serial.printf("Encoder: CLK=%d DT=%d SW=%d\n", ENCODER_CLK, ENCODER_DT, ENCODER_SW);

  connectWiFi();
  ensureMqtt();
}

void loop() {
  if (otaPending) {
    otaPending = false;
    performOtaUpdate(otaUrl);
    return;
  }

  handleEncoder();
  handleButton();

  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastWifiRetry >= WIFI_RETRY_INTERVAL) {
      lastWifiRetry = now;
      connectWiFi();
    }
  } else {
    ensureMqtt();
    mqttClient.loop();

    if (now - lastMqttTelemetry >= MQTT_TELEMETRY_INTERVAL) {
      lastMqttTelemetry = now;
      publishMqttTelemetry();
    }
  }

  delay(5);
}
