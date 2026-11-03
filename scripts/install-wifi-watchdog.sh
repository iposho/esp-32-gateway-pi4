#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────
#  Установка systemd-таймера Wi-Fi watchdog.
#
#  Запускать на самом Raspberry Pi:
#      sudo ./scripts/install-wifi-watchdog.sh
#
#  Скрипт берёт wifi-watchdog.sh прямо из репозитория, поэтому
#  после `git pull` изменения подхватываются без переустановки.
# ────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_DIR="/etc/systemd/system"
SERVICE_SRC="$REPO_DIR/scripts/esp32-wifi-watchdog.service"
TIMER_SRC="$REPO_DIR/scripts/esp32-wifi-watchdog.timer"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Нужны права root: sudo $0" >&2
  exit 1
fi

[[ -r "$REPO_DIR/.env" ]] || echo "Внимание: $REPO_DIR/.env не найден — уведомления в Telegram не будут отправляться" >&2

chmod 0755 "$REPO_DIR/scripts/wifi-watchdog.sh"
sed "s|@REPO_DIR@|$REPO_DIR|g" "$SERVICE_SRC" >"$UNIT_DIR/esp32-wifi-watchdog.service"
cp "$TIMER_SRC" "$UNIT_DIR/esp32-wifi-watchdog.timer"

systemctl daemon-reload
systemctl enable --now esp32-wifi-watchdog.timer

echo "Установлено. Проверить:"
echo "  systemctl status esp32-wifi-watchdog.timer"
echo "  systemctl start esp32-wifi-watchdog.service && journalctl -u esp32-wifi-watchdog -n 20 --no-pager"
