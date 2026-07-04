"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Activity,
  Camera,
  CameraOff,
  ChevronRight,
  Pencil,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeviceStatusBar } from "./device-status-bar";
import { MetricsGrid } from "./metrics-grid";
import { getDashboardMetrics, hasCameraMetrics } from "@/lib/metrics";
import type { Device, Telemetry } from "@/lib/types";
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
  /** Отступ под кнопки reorder/drag слева */
  hasReorderControls?: boolean;
}) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(device.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const online = device.is_online;
  const payload = device.latest?.payload ?? {};
  const dashboardMetrics = getDashboardMetrics(device.metadata, payload);
  const isCamera = hasCameraMetrics(payload);
  const cameraReady = payload.camera_ready === true;
  const hasPhoto = Boolean(payload.last_photo_url);

  const headerPad = hasReorderControls ? "pl-12 sm:pl-14" : "";

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

  const detailHref = `/dashboard/devices/${encodeURIComponent(device.device_id)}`;

  return (
    <Card
      className={`group/card relative flex flex-col overflow-hidden bg-card/75 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 ${
        isDeleting ? "pointer-events-none scale-[0.98] opacity-50" : ""
      } ${online ? "hover:shadow-emerald-500/10" : ""}`}
    >
      <div
        className={`h-0.5 w-full transition-colors duration-500 ${
          online
            ? "bg-gradient-to-r from-emerald-500 via-primary to-emerald-400"
            : "bg-muted"
        }`}
      />

      <div className={`relative px-4 pt-4 pb-1 sm:px-5 sm:pt-5 ${headerPad}`}>
        {onDelete && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-3 top-3 z-10 text-muted-foreground/55 opacity-100 hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover/card:opacity-100"
            onClick={handleDelete}
            title="Удалить устройство"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}

        <div className="flex items-center gap-3 pr-8">
          <div
            className={`relative flex size-10 shrink-0 items-center justify-center rounded-xl ${
              online
                ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <Activity className="size-4" />
            <span
              className={`absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-card ${
                online ? "bg-emerald-500" : "bg-muted-foreground/40"
              }`}
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
                className="h-8 rounded-lg px-2 text-[15px] font-semibold"
                maxLength={100}
                aria-label="Название устройства"
              />
            ) : (
              <div className="group/name flex min-w-0 items-center gap-0.5">
                <h3 className="truncate text-[15px] font-semibold leading-tight tracking-tight">
                  {device.name}
                </h3>
                {onRename && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 shrink-0 text-muted-foreground/50 opacity-100 hover:text-foreground sm:opacity-0 sm:group-hover/name:opacity-100"
                    onClick={startEditName}
                    title="Переименовать"
                  >
                    <Pencil className="size-3" />
                  </Button>
                )}
              </div>
            )}
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/70">
              {device.device_id}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-3 sm:px-5">
        <div className="overflow-hidden rounded-xl border border-border/80 bg-muted/20">
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
          <div className="overflow-hidden rounded-xl border border-border/80 bg-muted/20">
            <div className="relative aspect-[2/1] sm:aspect-video">
              <Badge
                variant="outline"
                className={`absolute left-2 top-2 z-10 h-6 border px-2 text-[10px] shadow-sm backdrop-blur-sm ${
                  cameraReady || hasPhoto
                    ? "border-primary/30 bg-primary/20 text-primary"
                    : "border-border/80 bg-background/75 text-muted-foreground"
                }`}
              >
                {cameraReady || hasPhoto ? (
                  <Camera className="size-2.5" />
                ) : (
                  <CameraOff className="size-2.5" />
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
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 bg-muted/40 text-muted-foreground/60">
                  <CameraOff className="size-6 opacity-40" />
                  <span className="text-[11px]">Нет снимка</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Link
        href={detailHref}
        className="mt-auto flex min-h-11 items-center justify-between gap-2 border-t border-border/50 bg-background/30 px-4 py-3 transition-colors hover:bg-background/50 sm:px-5"
      >
        <span className="text-xs text-muted-foreground">Подробнее</span>
        <span className="flex items-center gap-1 text-xs font-medium text-primary">
          <span className="hidden sm:inline">Управление и метрики</span>
          <span className="sm:hidden">Открыть</span>
          <ChevronRight className="size-3.5 shrink-0" />
        </span>
      </Link>
    </Card>
  );
}
