"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  ChevronDown,
  Cpu,
  FolderOpen,
  Loader2,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  WifiOff,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeviceStatusBar } from "./device-status-bar";
import {
  DeviceControls,
  getUserCommands,
  type SendCommand,
} from "./device-controls";
import { CommandsReference } from "./commands-reference";
import { PinManagerModal } from "./pin-manager-modal";
import { FileManagerModal } from "./file-manager-modal";
import {
  getDetailMetricGroups,
  getDeviceIp,
  getFirmwareInfo,
  hasCameraMetrics,
} from "@/lib/metrics";
import { getCommandIcon, isDangerousCommand } from "@/lib/commands";
import { getOtaStatus, uploadDeviceFirmware } from "@/lib/ota";
import type { CommandDef, Device, Telemetry } from "@/lib/types";
import { cn } from "@/lib/utils";

type DeviceWithLatest = Device & { latest: Telemetry | null };

/** Эти показания уже видны в «Обслуживании» — в основном списке не дублируем */
const SERVICE_INFO_KEYS = new Set([
  "ip",
  "fw_version",
  "fw_date",
  "firmware_version",
  "firmware_date",
]);

export function DeviceDetailView({
  device,
  onCommand,
  onDelete,
  onRename,
}: {
  device: DeviceWithLatest;
  onCommand: SendCommand;
  onDelete?: (deviceId: string) => Promise<void>;
  onRename?: (deviceId: string, name: string) => Promise<void>;
}) {
  const online = device.is_online;
  const payload = device.latest?.payload ?? {};
  const userCommands = getUserCommands(device);
  const controlledKeys = new Set(
    userCommands
      .filter((c) => c.type === "toggle" || c.type === "range")
      .map((c) => c.action),
  );
  const metricGroups = getDetailMetricGroups(device.metadata, payload)
    .map(({ group, metrics }) => ({
      group,
      metrics: metrics.filter(
        (m) =>
          !controlledKeys.has(m.def.key) && !SERVICE_INFO_KEYS.has(m.def.key),
      ),
    }))
    .filter((g) => g.metrics.length > 0);

  return (
    <>
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Все устройства
      </Link>

      <DeviceHeader device={device} onRename={onRename} />

      {!online && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm">
          <WifiOff
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <p className="text-muted-foreground">
            Устройство сейчас не на связи, поэтому управление недоступно.
            Проверьте питание и Wi-Fi — как только оно подключится, всё
            заработает автоматически.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {userCommands.length > 0 && (
          <Section title="Управление">
            <DeviceControls device={device} onCommand={onCommand} />
          </Section>
        )}

        {hasCameraMetrics(payload) && (
          <CameraSection
            device={device}
            online={online}
            payload={payload}
            onCommand={onCommand}
          />
        )}

        {metricGroups.length > 0 && (
          <Section title="Показания">
            <div className="space-y-5">
              {metricGroups.map(({ group, metrics }) => (
                <div key={group}>
                  {metricGroups.length > 1 && (
                    <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                      {group}
                    </h3>
                  )}
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {metrics.map((metric) => {
                      const Icon = metric.icon;
                      return (
                        <div
                          key={metric.def.key}
                          className="min-w-0 rounded-xl bg-muted/40 px-3 py-2.5"
                        >
                          <dt className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <Icon className="size-3 shrink-0" aria-hidden />
                            {metric.label}
                          </dt>
                          <dd
                            className="mt-0.5 truncate text-base font-semibold tabular-nums"
                            title={metric.formatted}
                          >
                            {metric.formatted}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              ))}
            </div>
          </Section>
        )}

        <MaintenanceSection
          device={device}
          online={online}
          payload={payload}
          onCommand={onCommand}
          onDelete={onDelete}
        />
      </div>
    </>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="bg-card/75 p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

/* ── Заголовок: название (с переименованием) и статус ── */

function DeviceHeader({
  device,
  onRename,
}: {
  device: DeviceWithLatest;
  onRename?: (deviceId: string, name: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(device.name);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) setDraft(device.name);
  }, [device.name, isEditing]);

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === device.name || !onRename) {
      if (!trimmed) toast.error("Название не может быть пустым");
      setDraft(device.name);
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await onRename(device.device_id, trimmed);
      toast.success("Название сохранено");
      setIsEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка переименования");
      setDraft(device.name);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mb-6">
      {isEditing ? (
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") {
              setDraft(device.name);
              setIsEditing(false);
            }
          }}
          onBlur={() => void save()}
          disabled={isSaving}
          className="h-10 max-w-md rounded-lg px-2 text-2xl font-semibold"
          maxLength={100}
          aria-label="Название устройства"
        />
      ) : (
        <div className="flex min-w-0 items-center gap-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
            {device.name}
          </h1>
          {onRename && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => setIsEditing(true)}
              aria-label="Переименовать"
              title="Переименовать"
            >
              <Pencil className="size-3.5" />
            </Button>
          )}
        </div>
      )}
      <DeviceStatusBar
        className="mt-1.5"
        online={device.is_online}
        lastSeen={device.last_seen}
        payload={device.latest?.payload ?? {}}
      />
    </div>
  );
}

/* ── Камера ── */

function CameraSection({
  device,
  online,
  payload,
  onCommand,
}: {
  device: DeviceWithLatest;
  online: boolean;
  payload: Record<string, unknown>;
  onCommand: SendCommand;
}) {
  const [imgTimestamp, setImgTimestamp] = useState(Date.now());
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const retryRef = useRef(0);
  const hasPhoto = Boolean(payload.last_photo_url);

  useEffect(() => {
    if (payload.capture_count) {
      setImgTimestamp(Date.now());
      setImgError(false);
      retryRef.current = 0;
    }
  }, [payload.capture_count]);

  function refreshPhoto() {
    setImgLoading(true);
    setImgError(false);
    retryRef.current = 0;
    setImgTimestamp(Date.now());
  }

  async function capture() {
    setIsCapturing(true);
    try {
      await onCommand(device.device_id, { action: "capture" });
      toast.success("Снимок запрошен — он появится через пару секунд");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сделать снимок");
    } finally {
      setIsCapturing(false);
    }
  }

  return (
    <Section
      title="Камера"
      action={
        hasPhoto ? (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={refreshPhoto}
            aria-label="Перезагрузить картинку"
            title="Перезагрузить картинку"
          >
            <RefreshCw
              className={cn("size-3.5", imgLoading && "animate-spin")}
            />
          </Button>
        ) : undefined
      }
    >
      <div className="overflow-hidden rounded-xl bg-muted/40">
        {hasPhoto && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/devices/${encodeURIComponent(device.device_id)}/camera?t=${imgTimestamp}`}
            alt={`Снимок камеры «${device.name}»`}
            className={cn(
              "aspect-video w-full object-contain transition-opacity duration-300",
              imgLoading ? "opacity-50" : "opacity-100",
            )}
            onLoad={() => {
              setImgLoading(false);
              setImgError(false);
              retryRef.current = 0;
            }}
            onError={() => {
              setImgLoading(false);
              setImgError(true);
              // Повторяем до 2 раз с растущей паузой
              if (retryRef.current < 2) {
                retryRef.current++;
                setTimeout(refreshPhoto, 2000 * 2 ** (retryRef.current - 1));
              }
            }}
          />
        ) : (
          <div className="flex aspect-video flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <CameraOff className="size-8 opacity-40" aria-hidden />
            {online ? "Снимка пока нет" : "Камера не на связи"}
          </div>
        )}
      </div>
      <Button
        className="mt-3 h-10 w-full"
        disabled={!online || isCapturing}
        onClick={() => void capture()}
      >
        {isCapturing ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Camera className="size-4" />
        )}
        Сделать снимок
      </Button>
    </Section>
  );
}

/* ── Обслуживание: всё техническое, свёрнуто по умолчанию ── */

function MaintenanceSection({
  device,
  online,
  payload,
  onCommand,
  onDelete,
}: {
  device: DeviceWithLatest;
  online: boolean;
  payload: Record<string, unknown>;
  onCommand: SendCommand;
  onDelete?: (deviceId: string) => Promise<void>;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [custom, setCustom] = useState('{ "action": "led", "value": true }');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ip = getDeviceIp(payload);
  const firmware = getFirmwareInfo(payload);
  const { isOtaActive } = getOtaStatus(payload);
  const dangerousCommands = (device.metadata?.commands ?? []).filter(
    isDangerousCommand,
  );

  async function run(key: string, body: Record<string, unknown>, done: string) {
    setBusyAction(key);
    try {
      await onCommand(device.device_id, body);
      toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось отправить команду");
    } finally {
      setBusyAction(null);
    }
  }

  function runDangerous(cmd: CommandDef) {
    if (!window.confirm(`${cmd.title}: «${device.name}»?`)) return;
    void run(cmd.action, { action: cmd.action }, `${cmd.title}: команда отправлена`);
  }

  function sendCustom() {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(custom);
    } catch {
      toast.error("Это не похоже на JSON — проверьте кавычки и скобки");
      return;
    }
    void run("custom", parsed, "Команда отправлена");
  }

  async function handleFirmware(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (
      !window.confirm(
        `Установить прошивку «${file.name}» на «${device.name}»? Устройство перезагрузится.`,
      )
    )
      return;

    setIsUploading(true);
    try {
      await uploadDeviceFirmware(device.device_id, file);
      toast.success("Прошивка отправлена — прогресс виден под названием устройства");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка обновления прошивки");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    if (
      !window.confirm(
        `Удалить «${device.name}» из списка вместе с историей показаний?\n\nЕсли устройство снова подключится к сети, оно появится заново.`,
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

  return (
    <Card className="bg-card/75 p-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <Wrench className="size-4 text-muted-foreground" aria-hidden />
            <span className="text-base font-semibold tracking-tight">
              Обслуживание
            </span>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              · прошивка, перезагрузка, удаление
            </span>
          </span>
          <ChevronDown
            className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>

        <div className="space-y-6 border-t border-border/60 px-4 py-4 sm:px-5">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">ID устройства</dt>
            <dd className="break-all font-mono text-xs sm:text-sm">
              {device.device_id}
            </dd>
            <dt className="text-muted-foreground">IP-адрес</dt>
            <dd className="font-mono text-xs sm:text-sm">{ip ?? "—"}</dd>
            <dt className="text-muted-foreground">Прошивка</dt>
            <dd>
              {firmware.version ? `v${firmware.version}` : "—"}
              {firmware.date && (
                <span className="text-muted-foreground"> от {firmware.date}</span>
              )}
            </dd>
          </dl>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              className="h-10 justify-start"
              disabled={!online || isUploading || isOtaActive}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Обновить прошивку (.bin)
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".bin"
              className="hidden"
              onChange={handleFirmware}
            />
            {dangerousCommands.map((cmd) => {
              const Icon = getCommandIcon(cmd.icon);
              return (
                <Button
                  key={cmd.action}
                  variant="outline"
                  className="h-10 justify-start"
                  disabled={!online || busyAction !== null}
                  onClick={() => runDangerous(cmd)}
                >
                  {busyAction === cmd.action ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Icon className="size-4" />
                  )}
                  {cmd.title}
                </Button>
              );
            })}
            <Button
              variant="outline"
              className="h-10 justify-start"
              disabled={!online}
              onClick={() => setIsPinModalOpen(true)}
            >
              <Cpu className="size-4" />
              Пины GPIO
            </Button>
            <Button
              variant="outline"
              className="h-10 justify-start"
              disabled={!online}
              onClick={() => setIsFileModalOpen(true)}
            >
              <FolderOpen className="size-4" />
              Файлы на устройстве
            </Button>
          </div>

          <details className="group/dev rounded-xl border border-border/60">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
              Для разработчиков
              <ChevronDown
                className="size-4 text-muted-foreground transition-transform group-open/dev:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="space-y-4 border-t border-border/60 p-3">
              <div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Произвольная команда (JSON в топик{" "}
                  <code className="font-mono">devices/{device.device_id}/command</code>)
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    className="h-10 rounded-lg bg-background/60 font-mono text-xs"
                    spellCheck={false}
                    placeholder='{ "action": "..." }'
                    aria-label="JSON команды"
                  />
                  <Button
                    variant="outline"
                    disabled={!online || busyAction !== null}
                    onClick={sendCustom}
                    className="h-10 shrink-0 sm:px-4"
                  >
                    <Send className="size-4" />
                    Отправить
                  </Button>
                </div>
              </div>
              <CommandsReference />
            </div>
          </details>

          {onDelete && (
            <div className="flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Удалить устройство из списка вместе с историей показаний.
              </p>
              <Button
                variant="destructive"
                className="h-10 shrink-0"
                disabled={isDeleting}
                onClick={() => void handleDelete()}
              >
                {isDeleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {isDeleting ? "Удаляем…" : "Удалить устройство"}
              </Button>
            </div>
          )}
        </div>
      </details>

      <PinManagerModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSend={async (body) => run("pin", body, "Команда отправлена")}
        isSending={busyAction === "pin"}
        latestTelemetry={device.latest}
      />
      <FileManagerModal
        isOpen={isFileModalOpen}
        onClose={() => setIsFileModalOpen(false)}
        onSend={async (body) => run("file", body, "Команда отправлена")}
        isSending={busyAction === "file"}
        latestTelemetry={device.latest}
      />
    </Card>
  );
}
