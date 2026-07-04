"use client";

import { useEffect, useState, useRef } from "react";
import {
  Send,
  Gauge,
  ChevronDown,
  Trash2,
  Camera,
  CameraOff,
  RefreshCw,
  Zap,
  Terminal,
  Activity,
  Upload,
  Cpu,
  FolderOpen,
  WifiOff,
  Globe,
  Wifi,
  Signal,
  Clock,
  MemoryStick,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { timeAgo, formatValue, labelForKey } from "@/lib/format";
import type { Device, Telemetry } from "@/lib/types";
import { getCommandIcon } from "@/lib/commands";
import type { CommandDef } from "@/lib/types";
import { toast } from "sonner";
import { PinManagerModal } from "./pin-manager-modal";
import { FileManagerModal } from "./file-manager-modal";

type DeviceWithLatest = Device & { latest: Telemetry | null };

const SERVICE_TELEMETRY_KEYS = new Set([
  "last_photo_url",
  "ota",
  "progress",
  "camera_ready",
  "pin_error",
  "pin_status",
  "fs_ls",
  "fs_file",
  "content",
]);

const isServiceTelemetryKey = (key: string) => {
  const normalized = key.toLowerCase();
  return (
    SERVICE_TELEMETRY_KEYS.has(normalized) ||
    normalized.startsWith("pin_") ||
    normalized.startsWith("fs_")
  );
};

const OTA_LABELS: Record<string, string> = {
  downloading: "OTA: загрузка",
  writing: "OTA: запись",
  success: "OTA: готово",
  failed: "OTA: ошибка",
};

const QUICK_STATUS_FIELDS = [
  { keys: ["ip"], label: "IP", icon: Globe },
  { keys: ["wifi_ssid", "ssid"], label: "Wi-Fi", icon: Wifi },
  { keys: ["rssi", "wifi_rssi"], label: "Сигнал", icon: Signal },
  { keys: ["uptime", "uptime_s", "uptime_sec"], label: "Аптайм", icon: Clock },
  { keys: ["free_heap", "heap"], label: "RAM", icon: MemoryStick },
  { keys: ["fw_version", "sdk_version"], label: "Прошивка", icon: Cpu },
] as const;

const QUICK_STATUS_KEY_SET = new Set(
  QUICK_STATUS_FIELDS.flatMap((f) => f.keys.map((k) => k.toLowerCase())),
);

function getPayloadValue(
  payload: Record<string, unknown>,
  keys: readonly string[],
) {
  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null)
      return { value: payload[key], key };
    const found = Object.entries(payload).find(
      ([k]) => k.toLowerCase() === key.toLowerCase(),
    );
    if (found) return { value: found[1], key: found[0] };
  }
  return null;
}

export function DeviceCard({
  device,
  onCommand,
  onDelete,
}: {
  device: DeviceWithLatest;
  onCommand: (
    deviceId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  onDelete?: (deviceId: string) => Promise<void>;
}) {
  const [custom, setCustom] = useState('{ "action": "led", "value": true }');
  const [sending, setSending] = useState<string | null>(null);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [telemetryExpanded, setTelemetryExpanded] = useState(false);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [imgTimestamp, setImgTimestamp] = useState(Date.now());
  const [imgLoading, setImgLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const online = device.is_online;
  const payload = device.latest?.payload ?? {};
  const detailEntries = Object.entries(payload).filter(
    ([k]) =>
      !isServiceTelemetryKey(k) && !QUICK_STATUS_KEY_SET.has(k.toLowerCase()),
  );
  const isCamera =
    payload.camera_ready !== undefined || payload.last_photo_url !== undefined;

  const otaStatus = payload.ota as string | undefined;
  const otaProgress =
    typeof payload.progress === "number" ? payload.progress : 0;
  const isOtaActive =
    otaStatus && otaStatus !== "failed" && otaStatus !== "success";
  const otaLabel = otaStatus
    ? (OTA_LABELS[otaStatus] ?? `OTA: ${otaStatus}`)
    : null;
  const cameraReady = payload.camera_ready === true;
  const cameraStatusLabel =
    payload.camera_ready === true
      ? "Камера готова"
      : payload.camera_ready === false
        ? "Камера не готова"
        : "Есть снимок";
  const hasCameraSignal = cameraReady || Boolean(payload.last_photo_url);

  // Обновляем картинку при изменении телеметрии с новой фотографией
  useEffect(() => {
    if (payload.capture_count) {
      setImgTimestamp(Date.now());
    }
  }, [payload.capture_count]);

  async function send(payload: Record<string, unknown>, key: string) {
    setSending(key);
    try {
      await onCommand(device.device_id, payload);
      toast.success("Команда отправлена");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка отправки");
    } finally {
      setSending(null);
    }
  }

  function sendCustom() {
    try {
      const parsed = JSON.parse(custom);
      void send(parsed, "custom");
    } catch (err: any) {
      toast.error("Невалидный JSON");
    }
  }

  function handleSketchCommand(cmd: CommandDef) {
    if (cmd.type === "toggle") {
      const next = !(toggles[cmd.action] ?? false);
      setToggles((prev) => ({ ...prev, [cmd.action]: next }));
      void send({ action: cmd.action, value: next }, cmd.action);
    } else {
      if (
        cmd.action === "reboot" &&
        !window.confirm(`Перезагрузить ${device.device_id}?`)
      )
        return;
      void send({ action: cmd.action }, cmd.action);
    }
  }

  function refreshPhoto() {
    setImgLoading(true);
    setImgTimestamp(Date.now());
  }

  async function handleDelete() {
    if (!onDelete) return;
    if (
      !window.confirm(
        `Вы уверены, что хотите удалить устройство ${device.name || device.device_id}?`,
      )
    )
      return;

    setIsDeleting(true);
    try {
      await onDelete(device.device_id);
      toast.success("Устройство удалено");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка удаления");
      setIsDeleting(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("deviceId", device.device_id);

      const res = await fetch("/api/ota", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка загрузки");
      }

      toast.success("Прошивка отправлена на устройство");
    } catch (err: any) {
      toast.error(err.message || "Ошибка OTA обновления");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  const sketchCommands =
    (device.metadata?.commands as CommandDef[] | undefined) ?? [];

  return (
    <>
      <Card
        className={`group/card relative flex flex-col overflow-hidden bg-card/75 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 ${
          isDeleting ? "opacity-50 pointer-events-none scale-[0.98]" : ""
        } ${online ? "hover:shadow-emerald-500/10" : ""}`}
      >
        {/* ── Status accent strip ── */}
        <div
          className={`h-1 w-full transition-colors duration-500 ${
            online
              ? "bg-gradient-to-r from-emerald-500 via-primary to-emerald-400"
              : "bg-muted"
          }`}
        />

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 p-4 pb-2 sm:p-5 sm:pb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors ${
                  online
                    ? "bg-emerald-500/10 text-emerald-600 shadow-inner shadow-white/10 dark:bg-emerald-400/10 dark:text-emerald-400"
                    : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                }`}
              >
                <Activity className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold tracking-tight text-foreground">
                  {device.name}
                </h3>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground/70">
                  {device.device_id}
                </p>
              </div>
            </div>
          </div>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground/55 opacity-100 hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover/card:opacity-100"
              onClick={handleDelete}
              title="Удалить устройство"
            >
              <Trash2 className="size-3" />
            </Button>
          )}
        </div>

        {/* ── Quick status (одинаковый для всех плат) ── */}
        <div className="px-4 pb-3 sm:px-5">
          <div className="rounded-2xl border border-border bg-background/35 p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge
                variant={online ? "online" : "outline"}
                className={`h-7 px-2.5 text-xs ${online ? "" : "border-border text-muted-foreground"}`}
              >
                {online ? (
                  <>
                    <span className="relative flex size-1.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-40" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-current" />
                    </span>
                    Онлайн
                  </>
                ) : (
                  <>
                    <WifiOff className="size-3" />
                    Оффлайн
                  </>
                )}
              </Badge>
              <span className="text-xs text-muted-foreground tabular-nums">
                {timeAgo(device.last_seen)}
              </span>
              {otaLabel && (
                <Badge
                  variant="outline"
                  className={`h-7 px-2.5 text-xs ${
                    otaStatus === "failed"
                      ? "border-destructive/25 bg-destructive/10 text-destructive"
                      : "border-primary/25 bg-primary/10 text-primary"
                  }`}
                >
                  <RefreshCw
                    className={`size-3 ${isOtaActive ? "animate-spin" : ""}`}
                  />
                  {otaLabel}
                  {isOtaActive ? ` ${Math.round(otaProgress)}%` : ""}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
              {QUICK_STATUS_FIELDS.map(({ keys, label, icon: Icon }) => {
                const found = getPayloadValue(payload, keys);
                return (
                  <div key={keys[0]} className="min-w-0">
                    <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                      <Icon className="size-2.5 shrink-0" />
                      {label}
                    </div>
                    <p
                      className={`mt-0.5 truncate font-mono text-sm tabular-nums ${
                        found
                          ? "font-medium text-foreground"
                          : "text-muted-foreground/40"
                      }`}
                      title={
                        found ? formatValue(found.value, found.key) : undefined
                      }
                    >
                      {found ? formatValue(found.value, found.key) : "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Camera section ── */}
        {isCamera && (
          <div className="px-4 pb-3 sm:px-5">
            <div className="overflow-hidden rounded-2xl border border-border bg-muted/25">
              <div className="relative">
                <Badge
                  variant="outline"
                  className={`absolute left-2 top-2 z-10 h-6 border px-2 text-[10px] shadow-sm backdrop-blur-sm ${
                    hasCameraSignal
                      ? "border-primary/30 bg-primary/20 text-primary"
                      : "border-border/80 bg-background/75 text-muted-foreground"
                  }`}
                >
                  {hasCameraSignal ? (
                    <Camera className="size-2.5" />
                  ) : (
                    <CameraOff className="size-2.5" />
                  )}
                  {cameraStatusLabel}
                </Badge>
                {!online && !payload.last_photo_url ? (
                  <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-muted/40 text-muted-foreground/60">
                    <CameraOff className="size-8 opacity-40" />
                    <span className="text-xs">Камера офлайн</span>
                  </div>
                ) : payload.last_photo_url ? (
                  <div className="flex aspect-video items-center justify-center bg-black/5 dark:bg-black/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/devices/${device.device_id}/camera?t=${imgTimestamp}`}
                      alt="Camera snapshot"
                      className={`h-full w-full object-contain transition-opacity duration-300 ${imgLoading ? "opacity-50" : "opacity-100"}`}
                      onLoad={() => setImgLoading(false)}
                      onError={() => setImgLoading(false)}
                    />
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                    Нет снимка
                  </div>
                )}
              </div>
              {online && (
                <div className="flex items-center gap-2 border-t border-border bg-background/45 p-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 flex-1 text-xs text-muted-foreground hover:text-foreground"
                    disabled={!online || sending !== null}
                    onClick={() => send({ action: "capture" }, "capture")}
                  >
                    <Camera className="size-3" />
                    {sending === "capture" ? "Делаем..." : "Снимок"}
                  </Button>
                  <div className="w-px h-4 bg-border" />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    onClick={refreshPhoto}
                    title="Обновить картинку"
                  >
                    <RefreshCw
                      className={`size-3 ${imgLoading ? "animate-spin" : ""}`}
                    />
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Telemetry (сворачиваемая) ── */}
        {detailEntries.length > 0 && (
          <div className="px-4 pb-3 sm:px-5">
            <div className="rounded-2xl border border-border bg-background/35">
              <button
                type="button"
                onClick={() => setTelemetryOpen((s) => !s)}
                className="flex w-full items-center justify-between gap-2 p-3 text-left transition-colors hover:bg-muted/20"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <Gauge className="size-3" />
                  Телеметрия
                  <span className="font-normal normal-case tracking-normal text-muted-foreground/60">
                    · {detailEntries.length}
                  </span>
                </div>
                <ChevronDown
                  className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                    telemetryOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {telemetryOpen && (
                <div className="border-t border-border/50 px-3 pb-3">
                  <div className="space-y-0">
                    {detailEntries
                      .slice(0, telemetryExpanded ? detailEntries.length : 6)
                      .map(([k, v], i) => (
                        <div
                          key={k}
                          className={`flex items-center justify-between gap-3 py-2 ${
                            i > 0 ? "border-t border-border/50" : ""
                          }`}
                        >
                          <span className="min-w-0 truncate text-sm text-muted-foreground">
                            {labelForKey(k)}
                          </span>
                          <span className="shrink-0 text-right font-mono text-sm font-medium tabular-nums text-foreground">
                            {formatValue(v, k)}
                          </span>
                        </div>
                      ))}
                  </div>
                  {detailEntries.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setTelemetryExpanded((s) => !s)}
                      className="mt-1 flex min-h-8 items-center gap-1 text-xs font-medium text-primary/75 transition-colors hover:text-primary"
                    >
                      <ChevronDown
                        className={`size-3 transition-transform duration-200 ${
                          telemetryExpanded ? "rotate-180" : ""
                        }`}
                      />
                      {telemetryExpanded
                        ? "Свернуть"
                        : `Ещё ${detailEntries.length - 6}`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── OTA Progress ── */}
        {otaStatus && (
          <div className="px-4 pb-3 sm:px-5">
            <div className="rounded-2xl border border-primary/15 bg-primary/10 p-3">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                <span className="flex items-center gap-1.5">
                  <RefreshCw
                    className={`size-3 ${isOtaActive ? "animate-spin" : ""}`}
                  />
                  Обновление прошивки
                </span>
                <span className="text-muted-foreground">{otaLabel}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className={`h-full transition-all duration-500 ${otaStatus === "failed" ? "bg-destructive" : "bg-primary"}`}
                  style={{
                    width: `${Math.max(0, Math.min(100, otaProgress))}%`,
                  }}
                />
              </div>
              <div className="mt-1.5 text-right text-[10px] font-medium text-muted-foreground">
                {Math.round(otaProgress)}%
              </div>
            </div>
          </div>
        )}

        {/* ── Actions: команды из скетча ── */}
        {sketchCommands.length > 0 && (
          <div className="px-4 pb-2 sm:px-5">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Zap className="size-3" />
              Управление
            </div>
            <div className="grid grid-cols-2 gap-2">
              {sketchCommands.map((cmd) => {
                const Icon = getCommandIcon(cmd.icon);
                const isToggle = cmd.type === "toggle";
                const toggleValue = toggles[cmd.action] ?? false;
                const isSending = sending === cmd.action;
                return (
                  <Button
                    key={cmd.action}
                    size="sm"
                    variant={isToggle && toggleValue ? "default" : "outline"}
                    disabled={!online || sending !== null}
                    onClick={() => handleSketchCommand(cmd)}
                    className="h-9 justify-start"
                  >
                    <Icon
                      className={`size-3 ${cmd.type === "trigger" && isSending ? "animate-spin" : ""}`}
                    />
                    {isSending ? "…" : cmd.title}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Admin features ── */}
        <div className="px-4 pb-4 sm:px-5">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <Zap className="size-3" />
            Система
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!online || sending !== null || isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="h-9 justify-start"
            >
              <Upload
                className={`size-3 ${isUploading ? "animate-bounce" : ""}`}
              />
              {isUploading ? "OTA..." : "OTA"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!online || sending !== null}
              onClick={() => setIsPinModalOpen(true)}
              className="h-9 justify-start"
            >
              <Cpu className="size-3" />
              Пины
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!online || sending !== null}
              onClick={() => setIsFileModalOpen(true)}
              className="h-9 justify-start"
            >
              <FolderOpen className="size-3" />
              Файлы
            </Button>
            <input
              type="file"
              accept=".bin"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
          </div>
        </div>

        {/* ── Custom command ── */}
        <div className="mt-auto border-t border-border/50 bg-background/30 px-4 py-3 sm:px-5">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <Terminal className="size-3" />
            Произвольная команда
          </div>
          <div className="flex gap-2">
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="h-9 rounded-xl bg-background/60 font-mono text-xs"
              spellCheck={false}
              placeholder='{ "action": "..." }'
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!online || sending !== null}
              onClick={sendCustom}
              className="h-9 shrink-0"
            >
              <Send className="size-3" />
              {sending === "custom" ? "…" : "Отпр."}
            </Button>
          </div>
        </div>
      </Card>

      <PinManagerModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSend={async (payload) => {
          await send(payload, "pin");
        }}
        isSending={sending === "pin"}
        latestTelemetry={device.latest}
      />

      <FileManagerModal
        isOpen={isFileModalOpen}
        onClose={() => setIsFileModalOpen(false)}
        onSend={async (payload) => {
          await send(payload, "file");
        }}
        isSending={sending === "file"}
        latestTelemetry={device.latest}
      />
    </>
  );
}
