#!/usr/bin/env python3
"""
Camelion LSH11/A60/RGBCW Bridge — управление Tuya-лампой через облачное API.

Установка на RPi:
  pip3 install tinytuya paho-mqtt

MQTT-протокол (subscribe):
  devices/esp32-bedroom/out/camelion  ← команды от ESP32 с кровати

Формат команды (JSON):
  {"action":"power",      "value":1|0}       — вкл/выкл
  {"action":"brightness", "value":0..100}    — яркость
  {"action":"temperature","value":0..100}     — цветовая температура (0=тёплый, 100=холодный)
  {"action":"mode",       "value":0|1|2}      — 0=white, 1=colour, 2=scene

MQTT-протокол (publish):
  devices/camelion/telemetry  ← состояние лампы (retained)
"""

from __future__ import annotations

import json
import logging
import signal
import sys
import time
from dataclasses import dataclass
from typing import Any

import paho.mqtt.client as mqtt
import tinytuya

# ───────────────────────────── CONFIG ─────────────────────────────
# Все настройки — через переменные окружения (для Docker).
# При локальном запуске можно задать их в export или заменить значения ниже.

import os

MQTT_BROKER = os.getenv("MQTT_BROKER", "192.168.100.43")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "esp32")
MQTT_PASS = os.getenv("MQTT_PASS", "change-me-esp32")

TUYA_ACCESS_ID = os.getenv("TUYA_ACCESS_ID", "your_tuya_access_id")
TUYA_ACCESS_SECRET = os.getenv("TUYA_ACCESS_SECRET", "your_tuya_access_secret")
TUYA_DEVICE_ID = os.getenv("TUYA_DEVICE_ID", "your_tuya_device_id")
TUYA_REGION = os.getenv("TUYA_REGION", "eu")

TOPIC_COMMAND = "devices/esp32-bedroom/out/camelion"
TOPIC_TELEMETRY = "devices/camelion/telemetry"
TOPIC_STATUS = "devices/camelion/status"

POLL_INTERVAL = 60  # секунд между опросом состояния лампы

# Диапазоны лампы (из getdps):
#   bright_value_v2: 10-1000
#   temp_value_v2:   0-1000
BRIGHT_MIN = 10
BRIGHT_MAX = 1000
TEMP_MIN = 0
TEMP_MAX = 1000

# ──────────────────────────── Bridge ──────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("camelion_bridge")


@dataclass
class LampState:
    power: bool = False
    mode: str = "white"
    brightness: int = 100  # 0-100 (внешний)
    temperature: int = 50  # 0-100 (внешний)

    def to_dict(self) -> dict[str, Any]:
        return {
            "power": self.power,
            "mode": self.mode,
            "brightness": self.brightness,
            "temperature": self.temperature,
        }


class CamelionBridge:
    def __init__(self) -> None:
        self.state = LampState()
        self.last_poll = 0.0

        # MQTT
        self.mqtt_client = mqtt.Client(client_id="camelion-bridge")
        self.mqtt_client.username_pw_set(MQTT_USER, MQTT_PASS)
        self.mqtt_client.will_set(
            TOPIC_STATUS, json.dumps({"status": "offline"}), retain=True
        )
        self.mqtt_client.on_connect = self._on_mqtt_connect
        self.mqtt_client.on_message = self._on_mqtt_message

        # Tuya Cloud API
        self.cloud = tinytuya.Cloud(
            apiRegion=TUYA_REGION,
            apiKey=TUYA_ACCESS_ID,
            apiSecret=TUYA_ACCESS_SECRET,
        )
        self._cmd_path = f"/v1.0/iot-03/devices/{TUYA_DEVICE_ID}/commands"

    def start(self) -> None:
        self.mqtt_client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
        self.mqtt_client.loop_start()

        log.info("Camelion Bridge (Cloud API) started")
        log.info("MQTT: %s:%d", MQTT_BROKER, MQTT_PORT)
        log.info("Tuya device: %s (region=%s)", TUYA_DEVICE_ID, TUYA_REGION)

        try:
            while True:
                self._poll()
                time.sleep(1)
        except KeyboardInterrupt:
            log.info("Shutting down...")
        finally:
            self.mqtt_client.publish(
                TOPIC_STATUS, json.dumps({"status": "offline"}), retain=True
            )
            self.mqtt_client.loop_stop()

    # ── MQTT ──────────────────────────────────────────────────────

    def _on_mqtt_connect(
        self, client: mqtt.Client, userdata: Any, flags: dict, rc: int
    ) -> None:
        if rc != 0:
            log.error("MQTT connect failed, rc=%d", rc)
            return
        log.info("MQTT connected")
        client.subscribe(TOPIC_COMMAND, qos=1)
        client.publish(TOPIC_STATUS, json.dumps({"status": "online"}), retain=True)
        self._publish_telemetry()

    def _on_mqtt_message(
        self, client: mqtt.Client, userdata: Any, msg: mqtt.MQTTMessage
    ) -> None:
        try:
            payload = msg.payload.decode("utf-8")
            log.info("MQTT << %s", payload)
            cmd = json.loads(payload)
            self._handle_command(cmd)
        except Exception as e:
            log.error("Failed to handle MQTT message: %s", e)

    def _handle_command(self, cmd: dict[str, Any]) -> None:
        action = cmd.get("action")
        value = cmd.get("value")
        log.info("Command: %s = %s", action, value)

        commands = []

        if action == "power":
            val = bool(value)
            self.state.power = val
            commands.append({"code": "switch_led", "value": val})

        elif action == "brightness":
            val = max(0, min(100, int(value)))
            self.state.brightness = val
            if not self.state.power and val > 0:
                self.state.power = True
                commands.append({"code": "switch_led", "value": True})
            if val == 0:
                self.state.power = False
                commands.append({"code": "switch_led", "value": False})
            else:
                commands.append(
                    {"code": "bright_value_v2", "value": self._scale_brightness(val)}
                )

        elif action == "temperature":
            val = max(0, min(100, int(value)))
            self.state.temperature = val
            self.state.mode = "white"
            commands.append({"code": "work_mode", "value": "white"})
            commands.append(
                {"code": "temp_value_v2", "value": self._scale_temperature(val)}
            )

        elif action == "mode":
            mode_map = {0: "white", 1: "colour", 2: "scene", 3: "music"}
            self.state.mode = mode_map.get(int(value), "white")
            commands.append({"code": "work_mode", "value": self.state.mode})

        else:
            log.warning("Unknown action: %s", action)
            return

        if commands:
            self._send_commands(commands)

    def _send_commands(self, commands: list[dict]) -> None:
        """Отправляет команды через Tuya Cloud API."""
        try:
            res = self.cloud.cloudrequest(
                self._cmd_path,
                post={"commands": commands},
            )
            if res and res.get("success"):
                log.info("OK: %s", commands)
            else:
                log.warning("Cloud API error: %s", res)
        except Exception as e:
            log.error("Cloud API exception: %s", e)

        self._publish_telemetry()

    # ── Polling ────────────────────────────────────────────────────

    def _poll(self) -> None:
        if time.time() - self.last_poll < POLL_INTERVAL:
            return
        self.last_poll = time.time()

        try:
            res = self.cloud.getstatus(TUYA_DEVICE_ID)
            if not res or not res.get("result"):
                log.warning("Poll: no result")
                return

            for dp in res["result"]:
                code = dp.get("code")
                val = dp.get("value")
                if code == "switch_led":
                    self.state.power = bool(val)
                elif code == "bright_value_v2":
                    self.state.brightness = self._scale_brightness_inv(int(val))
                elif code == "temp_value_v2":
                    self.state.temperature = self._scale_temperature_inv(int(val))
                elif code == "work_mode":
                    self.state.mode = str(val)

            self._publish_telemetry()
            log.info("Poll OK: power=%s bright=%d temp=%d mode=%s",
                     self.state.power, self.state.brightness,
                     self.state.temperature, self.state.mode)
        except Exception as e:
            log.warning("Poll failed: %s", e)

    # ── Telemetry ─────────────────────────────────────────────────

    def _publish_telemetry(self) -> None:
        self.mqtt_client.publish(
            TOPIC_TELEMETRY,
            json.dumps(self.state.to_dict()),
            retain=True,
        )

    # ── Scale helpers ─────────────────────────────────────────────

    @staticmethod
    def _scale_brightness(val: int) -> int:
        """0-100 → 10-1000"""
        if val <= 0:
            return 0
        return max(BRIGHT_MIN, int(val * BRIGHT_MAX / 100))

    @staticmethod
    def _scale_brightness_inv(val: int) -> int:
        """10-1000 → 0-100"""
        if val <= 0:
            return 0
        return int(val * 100 / BRIGHT_MAX)

    @staticmethod
    def _scale_temperature(val: int) -> int:
        """0-100 → 0-1000"""
        return int(val * TEMP_MAX / 100)

    @staticmethod
    def _scale_temperature_inv(val: int) -> int:
        """0-1000 → 0-100"""
        return int(val * 100 / TEMP_MAX)


# ───────────────────────────── Main ───────────────────────────────


def main() -> int:
    bridge = CamelionBridge()

    def handle_sig(signum, frame):
        log.info("Signal %d received, exiting...", signum)
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_sig)
    signal.signal(signal.SIGINT, handle_sig)

    bridge.start()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
