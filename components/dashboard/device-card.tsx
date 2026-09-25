"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Camera, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeviceStatusBar } from "./device-status-bar";
import {
  DeviceControls,
  getUserCommands,
  type SendCommand,
} from "./device-controls";
import { getDashboardMetrics, hasCameraMetrics } from "@/lib/metrics";
import type { Device, Telemetry } from "@/lib/types";
import { cn } from "@/lib/utils";

type DeviceWithLatest = Device & { latest: Telemetry | null };

/**
 * Карточка устройства на главной: название, статус словами, главные
 * показания и переключатели. Вся карточка — ссылка на страницу устройства;
 * технические детали (ID, IP, прошивка, OTA, удаление) живут там.
 */
export function DeviceCard({
  device,
  onCommand,
  reorder,
}: {
  device: DeviceWithLatest;
  onCommand: SendCommand;
  /** Режим «Изменить порядок»: вместо перехода — стрелки вверх/вниз */
  reorder?: {
    canMoveUp: boolean;
    canMoveDown: boolean;
    disabled: boolean;
    onMove: (direction: -1 | 1) => void;
  };
}) {
  const online = device.is_online;
  const payload = device.latest?.payload ?? {};
  const detailHref = `/dashboard/devices/${encodeURIComponent(device.device_id)}`;

  // Состояние переключателей видно по самим переключателям — не дублируем в показаниях
  const toggleActions = new Set(
    getUserCommands(device)
      .filter((c) => c.type === "toggle")
      .slice(0, 3)
      .map((c) => c.action),
  );
  const metrics = getDashboardMetrics(device.metadata, payload).filter(
    (m) =>
      !toggleActions.has(m.def.key) && m.value !== undefined && m.value !== null,
  );
  const hasPhoto = hasCameraMetrics(payload) && Boolean(payload.last_photo_url);

  return (
    <Card
      className={cn(
        "group/card relative flex h-full flex-col gap-4 overflow-hidden border-border/70 bg-card/70 p-4 backdrop-blur-xl sm:p-5",
        "motion-safe:transition-[box-shadow,border-color,transform] motion-safe:duration-200",
        !reorder &&
          "hover:border-primary/30 hover:shadow-lg motion-safe:hover:-translate-y-0.5",
        !online && "bg-card/45",
      )}
    >
      {!reorder && (
        <Link
          href={detailHref}
          className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
          aria-label={`Открыть «${device.name}»`}
        />
      )}

      <div className="pointer-events-none relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight">
            {device.name}
          </h3>
          <DeviceStatusBar
            className="mt-1"
            online={online}
            lastSeen={device.last_seen}
            payload={payload}
          />
        </div>
        {reorder ? (
          <div className="pointer-events-auto relative z-10 flex shrink-0 gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!reorder.canMoveUp || reorder.disabled}
              onClick={() => reorder.onMove(-1)}
              aria-label={`Поднять «${device.name}» выше`}
            >
              <ArrowUp className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!reorder.canMoveDown || reorder.disabled}
              onClick={() => reorder.onMove(1)}
              aria-label={`Опустить «${device.name}» ниже`}
            >
              <ArrowDown className="size-3.5" />
            </Button>
          </div>
        ) : (
          <ChevronRight
            className="mt-0.5 size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover/card:translate-x-0.5 group-hover/card:text-foreground"
            aria-hidden
          />
        )}
      </div>

      {metrics.length > 0 && (
        <dl
          className={cn(
            "pointer-events-none relative grid grid-cols-2 gap-x-4 gap-y-3",
            !online && "opacity-60",
          )}
        >
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.def.key} className="min-w-0">
                <dt className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Icon className="size-3 shrink-0" aria-hidden />
                  {metric.label}
                </dt>
                <dd
                  className="mt-0.5 truncate text-lg font-semibold tabular-nums tracking-tight"
                  title={metric.formatted}
                >
                  {metric.formatted}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {hasPhoto && (
        <div className="pointer-events-none relative overflow-hidden rounded-xl border border-border/60 bg-muted/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/devices/${encodeURIComponent(device.device_id)}/camera?t=${device.latest?.created_at ?? ""}`}
            alt={`Последний снимок «${device.name}»`}
            width={640}
            height={360}
            className="aspect-video w-full object-cover"
            loading="lazy"
          />
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-background/80 px-1.5 py-0.5 text-[11px] text-muted-foreground backdrop-blur-sm">
            <Camera className="size-3" aria-hidden />
            Последний снимок
          </span>
        </div>
      )}

      {!reorder && (
        <div className="mt-auto">
          <DeviceControls device={device} onCommand={onCommand} variant="card" />
        </div>
      )}
    </Card>
  );
}
