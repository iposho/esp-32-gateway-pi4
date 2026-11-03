#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────
#  Wi-Fi watchdog шлюза ESP32
#
#  Проверяет, что интерфейс, через который ESP32 видят MQTT-
#  брокер, реально подключён к сети. Если связи нет дольше
#  WIFI_WATCHDOG_FAIL_SECONDS — шлёт уведомление в Telegram,
#  после восстановления — ещё одно.
#
#  Запускается systemd-таймером раз в минуту (см.
#  scripts/install-wifi-watchdog.sh). Состояние хранится в
#  STATE_DIR, поэтому повторных уведомлений не будет.
# ────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env}"

# Значения по умолчанию (можно переопределить переменными окружения или .env)
WIFI_IFACE="${WIFI_IFACE:-wlan0}"
WIFI_GATEWAY="${WIFI_GATEWAY:-192.168.100.1}"
WIFI_WATCHDOG_FAIL_SECONDS="${WIFI_WATCHDOG_FAIL_SECONDS:-120}"
STATE_DIR="${STATE_DIR:-/var/lib/esp32-wifi-watchdog}"
STATE_FILE="$STATE_DIR/state"
LOCK_FILE="$STATE_DIR/lock"

# ── Чтение .env (только нужные ключи, без source) ───────────
env_get() {
  local key="$1" value
  [[ -r "$ENV_FILE" ]] || return 0
  value="$(sed -n "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" | tail -n1)"
  # убрать обрамляющие кавычки
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "$value"
}

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-$(env_get TELEGRAM_BOT_TOKEN)}"
TELEGRAM_ALLOWED_CHAT_IDS="${TELEGRAM_ALLOWED_CHAT_IDS:-$(env_get TELEGRAM_ALLOWED_CHAT_IDS)}"
TELEGRAM_API_BASE="${TELEGRAM_API_BASE:-https://api.telegram.org}"

mkdir -p "$STATE_DIR"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  exit 0
fi

# ── Проверка здоровья ──────────────────────────────────────
# Интерфейс должен быть в состоянии connected (nmcli: 100)…
iface_state="$(nmcli -t -g GENERAL.STATE device show "$WIFI_IFACE" 2>/dev/null || true)"
iface_line="$(nmcli -t -f DEVICE,STATE,CONNECTION device status 2>/dev/null | grep -E "^${WIFI_IFACE}:" || true)"

healthy=0
if [[ "$iface_state" == 100* ]]; then
  # …и шлюз этой сети должен отвечать на ping.
  if ping -c 1 -W 2 "$WIFI_GATEWAY" >/dev/null 2>&1; then
    healthy=1
  fi
fi

now="$(date +%s)"
status="ok"
since="$now"
notified="0"

if [[ -f "$STATE_FILE" ]]; then
  # Формат: <status> <since_epoch> <notified 0|1>
  read -r prev_status since notified <"$STATE_FILE" || true
  [[ -n "${prev_status:-}" ]] || prev_status="ok"
  [[ -n "${since:-}" ]] || since="$now"
  [[ -n "${notified:-}" ]] || notified="0"
else
  prev_status="ok"
fi

# ── Telegram ───────────────────────────────────────────────
telegram_send() {
  local text="$1" chat_id
  [[ -n "$TELEGRAM_BOT_TOKEN" && -n "$TELEGRAM_ALLOWED_CHAT_IDS" ]] || {
    echo "wifi-watchdog: TELEGRAM_BOT_TOKEN/TELEGRAM_ALLOWED_CHAT_IDS не заданы — уведомление не отправлено" >&2
    return 0
  }

  IFS=',' read -ra chats <<<"$TELEGRAM_ALLOWED_CHAT_IDS"
  for chat_id in "${chats[@]}"; do
    chat_id="${chat_id//[[:space:]]/}"
    [[ -n "$chat_id" ]] || continue
    if ! curl -fsS --max-time 15 \
      -X POST "${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${chat_id}" \
      --data-urlencode "parse_mode=HTML" \
      --data-urlencode "disable_web_page_preview=true" \
      --data-urlencode "text=${text}" >/dev/null; then
      echo "wifi-watchdog: не удалось отправить сообщение в чат ${chat_id}" >&2
    fi
  done
}

format_duration() {
  local secs="$1"
  if (( secs < 60 )); then
    printf '%d сек' "$secs"
  elif (( secs < 3600 )); then
    printf '%d мин' "$((secs / 60))"
  elif (( secs < 86400 )); then
    printf '%d ч %d мин' "$((secs / 3600))" "$(((secs % 3600) / 60))"
  else
    printf '%d д %d ч' "$((secs / 86400))" "$(((secs % 86400) / 3600))"
  fi
}

# ── Логика переходов ───────────────────────────────────────
if [[ "$healthy" -eq 1 ]]; then
  if [[ "$prev_status" == "down" ]]; then
    downtime="$((now - since))"
    telegram_send "$(cat <<EOF
📶 <b>Wi-Fi на шлюзе восстановлен</b>
Интерфейс <code>${WIFI_IFACE}</code> снова в сети, простой $(format_duration "$downtime").
Устройства ESP32 снова могут подключиться к MQTT.
EOF
)"
  fi
  printf 'ok %s 0\n' "$now" >"$STATE_FILE"
  exit 0
fi

# Не здоровы
if [[ "$prev_status" != "down" ]]; then
  since="$now"
  notified="0"
fi

silent_for="$((now - since))"
if [[ "$notified" != "1" ]] && (( silent_for >= WIFI_WATCHDOG_FAIL_SECONDS )); then
  details="<code>${iface_line:-${WIFI_IFACE}: нет данных}</code>"
  telegram_send "$(cat <<EOF
🚨 <b>Wi-Fi на шлюзе пропал</b>
Интерфейс <code>${WIFI_IFACE}</code> не в сети уже $(format_duration "$silent_for").
ESP32 не могут подключиться к MQTT, данные в админку не поступают.

${details}
EOF
)"
  notified="1"
fi

printf 'down %s %s\n' "$since" "$notified" >"$STATE_FILE"
