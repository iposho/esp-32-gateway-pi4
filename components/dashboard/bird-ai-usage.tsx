"use client";

import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { BirdAiUsage } from "@/lib/bird-ai-usage";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as BirdAiUsage;
};

function usd(v: number | null): string {
  if (v === null) return "—";
  if (v === 0) return "$0";
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(5)}`;
}

/** Расход модели распознавания птиц — на странице камеры кормушки */
export function BirdAiUsageSection() {
  const { data, error, isLoading } = useSWR(
    "/api/camera/birdfeeder/usage",
    fetcher,
    { refreshInterval: 60_000 },
  );

  return (
    <Card className="bg-card/75 p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">
          Распознавание птиц
        </h2>
        {data?.enabled && (
          <span className="truncate text-xs text-muted-foreground">
            {data.model}
          </span>
        )}
      </div>

      {isLoading && (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      )}
      {error && (
        <p className="text-sm text-muted-foreground">
          Не удалось загрузить расход: {(error as Error).message}
        </p>
      )}
      {data && !data.enabled && (
        <p className="text-sm text-muted-foreground">
          Выключено: нет AI_GATEWAY_API_KEY. Визиты считает детектор движения
          камеры.
        </p>
      )}

      {data?.enabled && (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Tile
              label="Остаток кредитов"
              value={usd(data.balanceUsd)}
              hint={
                data.daysLeft !== null
                  ? `хватит на ~${data.daysLeft} дн.`
                  : "на всю команду Vercel"
              }
            />
            <Tile
              label="Сегодня"
              value={usd(data.today.spentUsd)}
              hint={`${data.today.calls} из ${data.dailyLimit} вызовов`}
            />
            <Tile
              label="Снимок в среднем"
              value={usd(data.avgPhotoUsd)}
            />
            <Tile label="За 7 дней" value={usd(data.last7Usd)} />
            <Tile
              label="За 30 дней"
              value={usd(data.last30Usd)}
              hint={
                data.requests30 !== null
                  ? `${data.requests30} вызовов`
                  : undefined
              }
            />
            <Tile
              label="Потрачено командой"
              value={usd(data.totalUsedUsd)}
              hint="за всё время"
            />
          </dl>

          {data.days.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                По дням (UTC, отчёт Gateway)
              </h3>
              <table className="w-full text-sm tabular-nums">
                <tbody>
                  {data.days.slice(0, 7).map((d) => (
                    <tr key={d.day} className="border-t border-border/50">
                      <td className="py-1.5 text-muted-foreground">{d.day}</td>
                      <td className="py-1.5 text-right text-muted-foreground">
                        {d.requests} выз.
                      </td>
                      <td className="py-1.5 pl-4 text-right font-medium">
                        {usd(d.costUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.errors.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {data.errors.join(" · ")}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/40 px-3 py-2.5">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-base font-semibold tabular-nums">
        {value}
      </dd>
      {hint && (
        <dd className="truncate text-xs text-muted-foreground">{hint}</dd>
      )}
    </div>
  );
}
