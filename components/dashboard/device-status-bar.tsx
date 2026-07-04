"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/format";

const OTA_LABELS: Record<string, string> = {
  downloading: "OTA: загрузка",
  writing: "OTA: запись",
  success: "OTA: готово",
  failed: "OTA: ошибка",
};

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
  const otaStatus = payload.ota as string | undefined;
  const otaProgress =
    typeof payload.progress === "number" ? payload.progress : 0;
  const isOtaActive =
    otaStatus && otaStatus !== "failed" && otaStatus !== "success";
  const otaLabel = otaStatus
    ? (OTA_LABELS[otaStatus] ?? `OTA: ${otaStatus}`)
    : null;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 ${
        compact ? "py-0" : "border-b border-border/60 px-3 py-2"
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Badge
          variant={online ? "online" : "outline"}
          className={`h-6 px-2 text-[11px] ${online ? "" : "border-border text-muted-foreground"}`}
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
        {otaLabel && (
          <Badge
            variant="outline"
            className={`h-6 px-2 text-[11px] ${
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
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {timeAgo(lastSeen)}
      </span>
    </div>
  );
}
