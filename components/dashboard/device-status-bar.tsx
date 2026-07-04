"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/format";
import { getOtaStatus } from "@/lib/ota";
import { cn } from "@/lib/utils";

export function DeviceStatusBar({
  online,
  lastSeen,
  payload,
  compact = false,
}: {
  online: boolean;
  lastSeen: string | null;
  payload: Record<string, unknown>;
  compact?: boolean;
}) {
  const { otaStatus, otaProgress, isOtaActive, otaLabel } =
    getOtaStatus(payload);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-3 py-2",
        !compact && "border-b border-border/60",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Badge
          variant={online ? "online" : "outline"}
          className={cn(
            "h-6 px-2 text-[11px]",
            !online && "border-border text-muted-foreground",
          )}
        >
          {online ? (
            <>
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full motion-safe:animate-ping rounded-full bg-current opacity-40 motion-reduce:animate-none" />
                <span className="relative inline-flex size-1.5 rounded-full bg-current" />
              </span>
              Онлайн
            </>
          ) : (
            <>
              <WifiOff className="size-3" aria-hidden />
              Оффлайн
            </>
          )}
        </Badge>
        {otaLabel && (
          <Badge
            variant="outline"
            className={cn(
              "h-6 px-2 text-[11px]",
              otaStatus === "failed"
                ? "border-destructive/25 bg-destructive/10 text-destructive"
                : "border-primary/25 bg-primary/10 text-primary",
            )}
          >
            <RefreshCw
              className={cn(
                "size-3",
                isOtaActive && "motion-safe:animate-spin motion-reduce:animate-none",
              )}
              aria-hidden
            />
            {otaLabel}
            {isOtaActive ? ` ${Math.round(otaProgress)}%` : ""}
          </Badge>
        )}
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {timeAgo(lastSeen)}
      </span>
      {otaStatus && (
        <div className="w-full pt-1.5" role="progressbar" aria-valuenow={otaProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Прогресс OTA">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/80">
            <div
              className={cn(
                "h-full motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out motion-reduce:transition-none",
                otaStatus === "failed" ? "bg-destructive" : "bg-primary",
              )}
              style={{
                width: `${Math.max(0, Math.min(100, otaProgress))}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
