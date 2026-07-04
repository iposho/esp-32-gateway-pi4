"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Send,
  Trash2,
  Pencil,
  Camera,
  CameraOff,
  RefreshCw,
  Zap,
  Terminal,
  Upload,
  Cpu,
  FolderOpen,
  ArrowLeft,
  Activity,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeviceStatusBar } from "./device-status-bar";
import { MetricsGrid } from "./metrics-grid";
import {
  getDetailMetricGroups,
  hasCameraMetrics,
} from "@/lib/metrics";
import { getCommandIcon } from "@/lib/commands";
import type { CommandDef, Device, Telemetry } from "@/lib/types";
import { toast } from "sonner";
import { PinManagerModal } from "./pin-manager-modal";
import { FileManagerModal } from "./file-manager-modal";

type DeviceWithLatest = Device & { latest: Telemetry | null };

const OTA_LABELS: Record<string, string> = {
  downloading: "OTA: загрузка",
  writing: "OTA: запись",
  success: "OTA: готово",
  failed: "OTA: ошибка",
};

export function DeviceDetailView({
  device,
  onCommand,
  onDelete,
  onRename,
}: {
  device: DeviceWithLatest;
  onCommand: (
    deviceId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  onDelete?: (deviceId: string) => Promise<void>;
  onRename?: (deviceId: string, name: string) => Promise<void>;
}) {
  const [custom, setCustom] = useState('{ "action": "led", "value": true }');
  const [sending, setSending] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(device.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [imgTimestamp, setImgTimestamp] = useState(Date.now());
  const [imgLoading, setImgLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const online = device.is_online;
  const payload = device.latest?.payload ?? {};
  const metricGroups = getDetailMetricGroups(device.metadata, payload);
  const isCamera = hasCameraMetrics(payload);

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

  useEffect(() => {
    if (payload.capture_count) {
      setImgTimestamp(Date.now());
    }
  }, [payload.capture_count]);

  useEffect(() => {
    if (!isEditingName) setDraftName(device.name);
  }, [device.name, isEditingName]);

  useEffect(() => {
    if (isEditingName) nameInputRef.current?.select();
  }, [isEditingName]);

  async function saveName() {
    const trimmed = draftName.trim();
    if (!trimmed) {
      toast.error("Название не может быть пустым");
      setDraftName(device.name);
      setIsEditingName(false);
      return;
    }
    if (trimmed === device.name) {
      setIsEditingName(false);
      return;
    }
    if (!onRename) {
      setIsEditingName(false);
      return;
    }

    setIsSavingName(true);
    try {
      await onRename(device.device_id, trimmed);
      toast.success("Название обновлено");
      setIsEditingName(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка переименования");
      setDraftName(device.name);
    } finally {
      setIsSavingName(false);
    }
  }

  function cancelEditName() {
    setDraftName(device.name);
    setIsEditingName(false);
  }

  function startEditName() {
    if (!onRename || isSavingName) return;
    setDraftName(device.name);
    setIsEditingName(true);
  }

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
    } catch {
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
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Ошибка OTA обновления",
      );
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
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            asChild
            className="mt-0.5 shrink-0 text-muted-foreground"
          >
            <Link href="/dashboard" aria-label="Назад к списку">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            {isEditingName ? (
              <Input
                ref={nameInputRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveName();
                  if (e.key === "Escape") cancelEditName();
                }}
                onBlur={() => void saveName()}
                disabled={isSavingName}
                className="h-9 max-w-md rounded-lg px-2 text-xl font-semibold"
                maxLength={100}
              />
            ) : (
              <div className="group/name flex min-w-0 items-center gap-1">
                <h1 className="truncate text-xl font-semibold tracking-tight sm:text-3xl">
                  {device.name}
                </h1>
                {onRename && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 shrink-0 text-muted-foreground/50 hover:text-foreground"
                    onClick={startEditName}
                    title="Переименовать"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
              </div>
            )}
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground sm:text-sm">
              {device.device_id}
            </p>
          </div>
        </div>

        {onDelete && (
          <Button
            variant="outline"
            size="sm"
            className="w-full shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 sm:w-auto"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="size-3.5" />
            Удалить
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px]">
        {/* ── Левая колонка: метрики и камера ── */}
        <div className="space-y-6">
          <Card className="overflow-hidden bg-card/75">
            <div
              className={`h-0.5 w-full ${
                online
                  ? "bg-gradient-to-r from-emerald-500 via-primary to-emerald-400"
                  : "bg-muted"
              }`}
            />
            <div className="p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-3">
                <div
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                    online
                      ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Activity className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Статус
                  </p>
                  <DeviceStatusBar
                    online={online}
                    lastSeen={device.last_seen}
                    payload={payload}
                    compact
                  />
                </div>
              </div>

              {metricGroups.map(({ group, metrics }) => (
                <section key={group} className="mt-6 first:mt-0">
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {group}
                  </h2>
                  <MetricsGrid metrics={metrics} variant="detail" />
                </section>
              ))}
            </div>
          </Card>

          {isCamera && (
            <Card className="overflow-hidden bg-card/75">
              <div className="border-b border-border/60 px-4 py-3 sm:px-5">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <Camera className="size-3" />
                  Камера
                </h2>
              </div>
              <div className="relative">
                <Badge
                  variant="outline"
                  className={`absolute left-4 top-4 z-10 h-6 border px-2 text-[10px] shadow-sm backdrop-blur-sm ${
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
                    <CameraOff className="size-10 opacity-40" />
                    <span className="text-sm">Камера офлайн</span>
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
                <div className="flex items-center gap-2 border-t border-border bg-background/45 p-3 sm:p-4">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 flex-1"
                    disabled={!online || sending !== null}
                    onClick={() => send({ action: "capture" }, "capture")}
                  >
                    <Camera className="size-3.5" />
                    {sending === "capture" ? "Делаем..." : "Снимок"}
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={refreshPhoto}
                    title="Обновить картинку"
                  >
                    <RefreshCw
                      className={`size-3.5 ${imgLoading ? "animate-spin" : ""}`}
                    />
                  </Button>
                </div>
              )}
            </Card>
          )}

          {otaStatus && (
            <Card className="border-primary/15 bg-primary/5 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                <span className="flex items-center gap-1.5">
                  <RefreshCw
                    className={`size-3.5 ${isOtaActive ? "animate-spin" : ""}`}
                  />
                  Обновление прошивки
                </span>
                <span className="text-muted-foreground">{otaLabel}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                <div
                  className={`h-full transition-all duration-500 ${otaStatus === "failed" ? "bg-destructive" : "bg-primary"}`}
                  style={{
                    width: `${Math.max(0, Math.min(100, otaProgress))}%`,
                  }}
                />
              </div>
              <div className="mt-2 text-right text-xs font-medium text-muted-foreground">
                {Math.round(otaProgress)}%
              </div>
            </Card>
          )}
        </div>

        {/* ── Правая колонка: управление ── */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {sketchCommands.length > 0 && (
            <Card className="bg-card/75 p-4 sm:p-5">
              <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <Zap className="size-3" />
                Управление
              </h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
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
                      className="h-10 justify-start"
                    >
                      <Icon
                        className={`size-3.5 ${cmd.type === "trigger" && isSending ? "animate-spin" : ""}`}
                      />
                      {isSending ? "…" : cmd.title}
                    </Button>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="bg-card/75 p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Zap className="size-3" />
              Система
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!online || sending !== null || isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="h-10 justify-start"
              >
                <Upload
                  className={`size-3.5 ${isUploading ? "animate-bounce" : ""}`}
                />
                {isUploading ? "OTA..." : "OTA"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!online || sending !== null}
                onClick={() => setIsPinModalOpen(true)}
                className="h-10 justify-start"
              >
                <Cpu className="size-3.5" />
                Пины
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!online || sending !== null}
                onClick={() => setIsFileModalOpen(true)}
                className="col-span-2 h-10 justify-start sm:col-span-1"
              >
                <FolderOpen className="size-3.5" />
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
          </Card>

          <Card className="bg-card/75 p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Terminal className="size-3" />
              Произвольная команда
            </h2>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="h-10 rounded-xl bg-background/60 font-mono text-xs"
                spellCheck={false}
                placeholder='{ "action": "..." }'
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!online || sending !== null}
                onClick={sendCustom}
                className="h-10 shrink-0 sm:px-4"
              >
                <Send className="size-3.5" />
                {sending === "custom" ? "…" : "Отправить"}
              </Button>
            </div>
          </Card>
        </div>
      </div>

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
