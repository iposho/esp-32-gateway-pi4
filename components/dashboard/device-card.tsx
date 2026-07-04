"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Camera,
  CameraOff,
  ChevronRight,
  Cpu,
  Globe,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeviceStatusBar } from "./device-status-bar";
import { MetricsGrid } from "./metrics-grid";
import {
  getDashboardMetrics,
  getDeviceIp,
  getFirmwareInfo,
  hasCameraMetrics,
} from "@/lib/metrics";
import { getOtaStatus, uploadDeviceFirmware } from "@/lib/ota";
import type { Device, Telemetry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type DeviceWithLatest = Device & { latest: Telemetry | null };

export function DeviceCard({
  device,
  onDelete,
  onRename,
  hasReorderControls = false,
}: {
  device: DeviceWithLatest;
  onDelete?: (deviceId: string) => Promise<void>;
  onRename?: (deviceId: string, name: string) => Promise<void>;
  hasReorderControls?: boolean;
}) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(device.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const otaInputId = useId();

  const online = device.is_online;
  const payload = device.latest?.payload ?? {};
  const dashboardMetrics = getDashboardMetrics(device.metadata, payload);
  const deviceIp = getDeviceIp(payload);
  const firmware = getFirmwareInfo(payload);
  const { isOtaActive } = getOtaStatus(payload);
  const isCamera = hasCameraMetrics(payload);
  const cameraReady = payload.camera_ready === true;
  const hasPhoto = Boolean(payload.last_photo_url);

  const headerPad = hasReorderControls ? "pl-12 sm:pl-14" : "";
  const detailHref = `/dashboard/devices/${encodeURIComponent(device.device_id)}`;
  const otaDisabled = !online || isUploading || isOtaActive;

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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка удаления");
      setIsDeleting(false);
    }
  }

  async function handleOtaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (
      !window.confirm(
        `Отправить прошивку «${file.name}» на ${device.name || device.device_id}?`,
      )
    ) {
      e.target.value = "";
      return;
    }

    setIsUploading(true);
    try {
      await uploadDeviceFirmware(device.device_id, file);
      toast.success("Прошивка отправлена на устройство");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Ошибка OTA обновления",
      );
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }

  return (
    <Card
      className={cn(
        "group/card relative flex flex-col overflow-hidden border-white/10 bg-card/55 shadow-[0_20px_40px_rgba(0,0,0,0.06)] backdrop-blur-xl",
        "motion-safe:transition-[transform,box-shadow,border-color] motion-safe:duration-300 motion-safe:ease-out",
        "motion-safe:hover:-translate-y-1 motion-safe:hover:border-white/20 motion-safe:hover:shadow-[0_28px_48px_rgba(0,0,0,0.1)]",
        isDeleting && "pointer-events-none scale-[0.98] opacity-50",
        online && "motion-safe:hover:shadow-emerald-500/10",
      )}
    >
      <div
        className={cn(
          "h-0.5 w-full motion-safe:transition-colors motion-safe:duration-500",
          online
            ? "bg-gradient-to-r from-emerald-500 via-primary to-emerald-400"
            : "bg-muted",
        )}
        aria-hidden
      />

      <div className={cn("relative px-4 pt-4 pb-2 sm:px-5 sm:pt-5", headerPad)}>
        {onDelete && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-3 top-3 z-10 text-muted-foreground/55 opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/30 sm:opacity-0 sm:group-hover/card:opacity-100 sm:group-focus-within/card:opacity-100"
            onClick={handleDelete}
            aria-label={`Удалить ${device.name || device.device_id}`}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        )}

        <div className="flex items-start gap-3 pr-8">
          <div
            className={cn(
              "relative flex size-10 shrink-0 items-center justify-center rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.08)]",
              online
                ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400"
                : "bg-muted/80 text-muted-foreground",
            )}
          >
            <Activity className="size-4" aria-hidden />
            <span
              className={cn(
                "absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-card",
                online ? "bg-emerald-500" : "bg-muted-foreground/40",
              )}
              aria-hidden
            />
          </div>

          <div className="min-w-0 flex-1">
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
                name="device-name"
                autoComplete="off"
                spellCheck={false}
                className="h-8 rounded-lg px-2 text-[15px] font-semibold focus-visible:ring-primary/40"
                maxLength={100}
                aria-label="Название устройства"
              />
            ) : (
              <div className="group/name flex min-w-0 items-center gap-0.5">
                <h3 className="truncate text-pretty text-[15px] font-semibold leading-tight tracking-tight">
                  {device.name}
                </h3>
                {onRename && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 shrink-0 text-muted-foreground/50 opacity-100 hover:text-foreground focus-visible:ring-primary/40 sm:opacity-0 sm:group-hover/name:opacity-100 sm:group-focus-within/name:opacity-100"
                    onClick={startEditName}
                    aria-label="Переименовать устройство"
                  >
                    <Pencil className="size-3" aria-hidden />
                  </Button>
                )}
              </div>
            )}

            <p
              className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/70"
              translate="no"
            >
              {device.device_id}
            </p>

            <dl className="mt-2 space-y-1 rounded-xl border border-white/10 bg-background/35 px-3 py-2 backdrop-blur-sm">
              <div className="flex min-w-0 items-center gap-2">
                <dt className="sr-only">IP-адрес</dt>
                <Globe
                  className="size-3 shrink-0 text-muted-foreground/60"
                  aria-hidden
                />
                <dd
                  className="min-w-0 truncate font-mono text-[11px] tabular-nums text-foreground/90"
                  translate="no"
                >
                  {deviceIp ?? "—"}
                </dd>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <dt className="sr-only">Версия и дата прошивки</dt>
                <Cpu
                  className="size-3 shrink-0 text-muted-foreground/60"
                  aria-hidden
                />
                <dd className="text-[11px] text-muted-foreground/80">
                  <span className="font-medium text-foreground/85">
                    v{firmware.version ?? "—"}
                  </span>
                  <span className="mx-1 text-muted-foreground/35" aria-hidden>
                    ·
                  </span>
                  <span>от {firmware.date ?? "—"}</span>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <div className="px-4 pb-3 sm:px-5">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-background/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
          <DeviceStatusBar
            online={online}
            lastSeen={device.last_seen}
            payload={payload}
          />
          <MetricsGrid metrics={dashboardMetrics} variant="compact" />
        </div>
      </div>

      {isCamera && (
        <div className="px-4 pb-3 sm:px-5">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-background/30 backdrop-blur-sm">
            <div className="relative aspect-[2/1] sm:aspect-video">
              <Badge
                variant="outline"
                className={cn(
                  "absolute left-2 top-2 z-10 h-6 border px-2 text-[10px] shadow-sm backdrop-blur-sm",
                  cameraReady || hasPhoto
                    ? "border-primary/30 bg-primary/20 text-primary"
                    : "border-border/80 bg-background/75 text-muted-foreground",
                )}
              >
                {cameraReady || hasPhoto ? (
                  <Camera className="size-2.5" aria-hidden />
                ) : (
                  <CameraOff className="size-2.5" aria-hidden />
                )}
                {cameraReady
                  ? "Камера"
                  : hasPhoto
                    ? "Снимок"
                    : "Камера офлайн"}
              </Badge>
              {hasPhoto ? (
                <div className="flex h-full items-center justify-center bg-black/5 dark:bg-black/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/devices/${device.device_id}/camera?t=${device.latest?.created_at ?? ""}`}
                    alt={`Последний снимок ${device.name}`}
                    width={640}
                    height={360}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 bg-muted/40 text-muted-foreground/60">
                  <CameraOff className="size-6 opacity-40" aria-hidden />
                  <span className="text-[11px]">Нет снимка</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-auto flex min-h-12 items-stretch border-t border-white/10 bg-background/25 backdrop-blur-sm">
        <input
          id={otaInputId}
          ref={fileInputRef}
          type="file"
          accept=".bin"
          className="sr-only"
          disabled={otaDisabled}
          onChange={handleOtaUpload}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={otaDisabled}
          onClick={() => fileInputRef.current?.click()}
          className="h-auto min-h-12 flex-1 rounded-none border-r border-white/10 px-3 text-xs font-medium focus-visible:ring-inset focus-visible:ring-primary/40 disabled:opacity-40"
          aria-label={
            isUploading
              ? `Загрузка прошивки для ${device.name}`
              : `OTA для ${device.name}`
          }
        >
          <Upload
            className={cn(
              "size-3.5 shrink-0",
              isUploading && "motion-safe:animate-bounce",
            )}
            aria-hidden
          />
          {isUploading ? "Загрузка…" : isOtaActive ? "OTA…" : "OTA"}
        </Button>
        <Link
          href={detailHref}
          className="flex min-h-12 flex-[1.2] items-center justify-between gap-2 px-4 py-3 text-xs transition-colors hover:bg-background/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
        >
          <span className="text-muted-foreground">Подробнее</span>
          <span className="flex items-center gap-1 font-medium text-primary">
            <span className="hidden sm:inline">Управление</span>
            <span className="sm:hidden">Открыть</span>
            <ChevronRight className="size-3.5 shrink-0" aria-hidden />
          </span>
        </Link>
      </div>
    </Card>
  );
}
