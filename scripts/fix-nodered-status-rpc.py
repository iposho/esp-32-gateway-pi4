#!/usr/bin/env python3
"""
Переводит запись статуса в развёрнутом flow Node-RED на RPC set_device_status.

Старые flows делали прямой upsert POST /devices?on_conflict=device_id.
Такой запрос не снимает «надгробие» из deleted_devices, а триггер
devices_block_deleted (008) молча отбрасывает вставку — удалённое
устройство никогда не возвращается, и его телеметрия не пишется (FK).

Скрипт берёт function-узел(ы) за mqtt-in `devices/+/status` в
node-red/data/flows.json и подставляет код fn-status из
node-red/flows.example.json. Следующий за ним http request переводится
в режим method=use с пустым url (метод и URL задаёт function-узел).
Перед записью делается копия flows.json.bak-<время>.

Запуск на Pi из корня репозитория:
  python3 scripts/fix-nodered-status-rpc.py            # применить
  python3 scripts/fix-nodered-status-rpc.py --dry-run  # только показать
затем: docker compose restart nodered
"""
import json
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FLOWS = ROOT / "node-red" / "data" / "flows.json"
EXAMPLE = ROOT / "node-red" / "flows.example.json"
STATUS_TOPIC = "devices/+/status"


def by_id(nodes):
    return {n.get("id"): n for n in nodes}


def targets(node, index):
    return [index[w] for out in node.get("wires", []) for w in out if w in index]


def main():
    dry_run = "--dry-run" in sys.argv[1:]

    example = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    ref_func = by_id(example)["fn-status"]["func"]

    flows = json.loads(FLOWS.read_text(encoding="utf-8"))
    index = by_id(flows)

    status_in = [
        n for n in flows
        if n.get("type") == "mqtt in" and n.get("topic") == STATUS_TOPIC
    ]
    if not status_in:
        sys.exit(f"В {FLOWS} нет mqtt-in узла с топиком {STATUS_TOPIC}")

    changed = []
    for src in status_in:
        for fn in targets(src, index):
            if fn.get("type") != "function":
                print(f"! {src['id']} → {fn.get('id')} ({fn.get('type')}): "
                      "не function-узел, пропускаю — проверь вручную")
                continue
            if fn.get("func") != ref_func:
                fn["func"] = ref_func
                fn["outputs"] = 1
                changed.append(f"function {fn['id']} ({fn.get('name', '')}): "
                               "код заменён на POST /rpc/set_device_status")
            for http in targets(fn, index):
                if http.get("type") != "http request":
                    continue
                if http.get("method") != "use" or http.get("url"):
                    changed.append(
                        f"http request {http['id']} ({http.get('name', '')}): "
                        f"method {http.get('method')!r} url {http.get('url')!r} "
                        "→ method 'use', url ''")
                    http["method"] = "use"
                    http["url"] = ""

    # Прочие прямые upsert в devices — только предупреждаем.
    for n in flows:
        if n.get("type") == "function" and "on_conflict=device_id" in n.get("func", ""):
            if n.get("func") != ref_func:
                print(f"! function {n['id']} ({n.get('name', '')}) всё ещё делает "
                      "прямой upsert в /devices — сверь с flows.example.json")

    if not changed:
        print("Изменений не требуется: статус уже пишется через set_device_status.")
        return

    for line in changed:
        print("* " + line)

    if dry_run:
        print("--dry-run: flows.json не изменён.")
        return

    backup = FLOWS.with_name(f"flows.json.bak-{time.strftime('%Y%m%d-%H%M%S')}")
    shutil.copy2(FLOWS, backup)
    FLOWS.write_text(json.dumps(flows, ensure_ascii=False, indent=4) + "\n",
                     encoding="utf-8")
    print(f"Готово. Копия: {backup.name}. Теперь: docker compose restart nodered")


if __name__ == "__main__":
    main()
