"use client";

import { RefreshCw } from "lucide-react";
import { timeAgo } from "@/lib/format";
import { getOtaStatus } from "@/lib/ota";
import { cn } from "@/lib/utils";

/**
 * Статус устройства человеческим языком:
 * «В сети · только что» / «Нет связи · 3 ч назад» + прогресс обновления прошивки.
 */
export function DeviceStatusBar({
  online,
  lastSeen,
  payload,
  className,
}: {
  online: boolean;
  lastSeen: string | null;
  payload: Record<string, unknown>;
  className?: string;
}) {
  const { otaStatus, otaProgress, isOtaActive } = getOtaStatus(payload);
  const otaText =
    otaStatus === "failed"
      ? "Обновление не удалось"
      : otaStatus === "success"
        ? "Прошивка обновлена"
        : isOtaActive
          ? `Обновляется прошивка · ${Math.round(otaProgress)}%`
          : null;

  return (
    <div className={cn("min-w-0", className)}>
      <p className="flex min-w-0 items-center gap-1.5 text-sm">
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-full",
            online ? "bg-emerald-500" : "bg-muted-foreground/40",
          )}
        />
        <span
          className={cn(
            "font-medium",
            online
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground",
          )}
        >
          {online ? "В сети" : "Нет связи"}
        </span>
        <span className="truncate text-muted-foreground">
          · {online ? `обновлено ${timeAgo(lastSeen)}` : timeAgo(lastSeen)}
        </span>
      </p>

      {otaText && (
        <div className="mt-2">
          <p
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium",
              otaStatus === "failed" ? "text-destructive" : "text-primary",
            )}
          >
            <RefreshCw
              aria-hidden
              className={cn(
                "size-3",
                isOtaActive && "motion-safe:animate-spin",
              )}
            />
            {otaText}
          </p>
          {isOtaActive && (
            <div
              className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border/80"
              role="progressbar"
              aria-valuenow={otaProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Прогресс обновления прошивки"
            >
              <div
                className="h-full bg-primary motion-safe:transition-[width] motion-safe:duration-500"
                style={{ width: `${Math.max(0, Math.min(100, otaProgress))}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
