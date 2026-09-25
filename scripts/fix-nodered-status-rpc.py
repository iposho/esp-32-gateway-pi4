#!/usr/bin/env python3
"""
Переводит запись статуса и «touch» устройства в развёрнутом flow Node-RED
на RPC, как в node-red/flows.example.json.

Старые flows делали прямой upsert POST /devices?on_conflict=device_id:
- в узле статуса — такой запрос не снимает «надгробие» из deleted_devices,
  а триггер devices_block_deleted (008) молча отбрасывает вставку:
  удалённое устройство никогда не возвращается, телеметрия не пишется (FK);
- в узле телеметрии — второй выход шлёт name: deviceId и перезаписал бы
  имя из админки, если бы не триггер preserve_custom_device_name (002).

Скрипт берёт function-узлы за mqtt-in `devices/+/status` и
`devices/+/telemetry` в node-red/data/flows.json и подставляет код
fn-status / fn-telemetry из node-red/flows.example.json. Следующие за ними
http request переводятся в режим method=use с пустым url (метод и URL
задаёт function-узел). Перед записью делается копия flows.json.bak-<время>.

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

# mqtt-in топик → id эталонного function-узла в flows.example.json
TARGETS = {
    "devices/+/status": "fn-status",
    "devices/+/telemetry": "fn-telemetry",
}


def by_id(nodes):
    return {n.get("id"): n for n in nodes}


def targets(node, index):
    return [index[w] for out in node.get("wires", []) for w in out if w in index]


def main():
    dry_run = "--dry-run" in sys.argv[1:]

    example = by_id(json.loads(EXAMPLE.read_text(encoding="utf-8")))
    refs = {topic: example[fn_id] for topic, fn_id in TARGETS.items()}

    flows = json.loads(FLOWS.read_text(encoding="utf-8"))
    index = by_id(flows)

    changed = []
    for topic, ref in refs.items():
        sources = [
            n for n in flows
            if n.get("type") == "mqtt in" and n.get("topic") == topic
        ]
        if not sources:
            print(f"! нет mqtt-in узла с топиком {topic} — пропускаю")
            continue

        for src in sources:
            for fn in targets(src, index):
                if fn.get("type") != "function":
                    print(f"! {src['id']} → {fn.get('id')} ({fn.get('type')}): "
                          "не function-узел, пропускаю — проверь вручную")
                    continue
                if len(fn.get("wires", [])) != ref["outputs"]:
                    print(f"! function {fn['id']}: выходов {len(fn.get('wires', []))}, "
                          f"в эталоне {ref['outputs']} — пропускаю, сверь вручную")
                    continue
                if fn.get("func") != ref["func"]:
                    fn["func"] = ref["func"]
                    changed.append(f"function {fn['id']} ({fn.get('name', '')}): "
                                   f"код заменён на {ref['id']} из flows.example.json")
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
    ref_funcs = {ref["func"] for ref in refs.values()}
    for n in flows:
        if n.get("type") == "function" and "on_conflict=device_id" in n.get("func", ""):
            if n.get("func") not in ref_funcs:
                print(f"! function {n['id']} ({n.get('name', '')}) всё ещё делает "
                      "прямой upsert в /devices — сверь с flows.example.json")

    if not changed:
        print("Изменений не требуется: статус и touch уже идут через RPC.")
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
