"use client";

import type { ResolvedMetric } from "@/lib/metrics";
import { cn } from "@/lib/utils";

export function MetricsGrid({
  metrics,
  variant = "default",
  className,
}: {
  metrics: ResolvedMetric[];
  variant?: "default" | "compact" | "detail";
  className?: string;
}) {
  if (metrics.length === 0) return null;

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "grid grid-cols-2 gap-px border-t border-border/60 bg-border/60",
          className,
        )}
      >
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          const isLastOdd =
            index === metrics.length - 1 && metrics.length % 2 !== 0;

          return (
            <div
              key={metric.def.key}
              className={cn(
                "bg-muted/20 px-3 py-2",
                isLastOdd && "col-span-2",
              )}
            >
              <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                <Icon className="size-2.5 shrink-0" />
                {metric.label}
              </div>
              <p
                className={cn(
                  "mt-0.5 truncate font-mono text-xs tabular-nums",
                  metric.value !== undefined && metric.value !== null
                    ? "font-medium text-foreground"
                    : "text-muted-foreground/40",
                )}
                title={metric.formatted}
              >
                {metric.formatted}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  if (variant === "detail") {
    return (
      <div className={cn("divide-y divide-border/50", className)}>
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.def.key}
              className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
                  <Icon className="size-3.5" />
                </div>
                <span className="truncate text-sm text-muted-foreground">
                  {metric.label}
                </span>
              </div>
              <span className="shrink-0 pl-10 font-mono text-sm font-medium tabular-nums text-foreground sm:pl-0 sm:text-right">
                {metric.formatted}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
        className,
      )}
    >
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div
            key={metric.def.key}
            className="rounded-xl border border-border/80 bg-muted/20 px-3 py-2.5"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              <Icon className="size-3 shrink-0" />
              {metric.label}
            </div>
            <p
              className={cn(
                "mt-1 font-mono text-sm tabular-nums",
                metric.value !== undefined && metric.value !== null
                  ? "font-medium text-foreground"
                  : "text-muted-foreground/40",
              )}
            >
              {metric.formatted}
            </p>
          </div>
        );
      })}
    </div>
  );
}
