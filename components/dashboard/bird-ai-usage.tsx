"use client";

import { useState } from "react";
import useSWR from "swr";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const { data, error, isLoading, mutate } = useSWR(
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
            <BudgetTile usage={data} onSaved={() => void mutate()} />
            <Tile
              label="Сегодня"
              value={usd(data.today.spentUsd)}
              hint={`${data.today.calls} из ${data.dailyLimit} вызовов`}
            />
            <Tile label="Снимок в среднем" value={usd(data.avgPhotoUsd)} />
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
              label="Кредиты команды"
              value={usd(data.balanceUsd)}
              hint={`потрачено всего ${usd(data.totalUsedUsd)}`}
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Остаток кормушки: вписывается вручную (сколько кредитов сейчас на неё
 * выделено), дальше из него вычитается расход модели. Пока не вписан —
 * показываем кредиты всей команды Vercel.
 */
function BudgetTile({
  usage,
  onSaved,
}: {
  usage: BirdAiUsage;
  onSaved: () => void;
}) {
  const { budget } = usage;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit() {
    const current = budget?.remainingUsd ?? usage.balanceUsd;
    setDraft(current !== null ? current.toFixed(2) : "");
    setEditing(true);
  }

  async function save(amountUsd: number | null) {
    setSaving(true);
    try {
      const res = await fetch("/api/birdfeeder/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setEditing(false);
      onSaved();
      toast.success(
        amountUsd === null ? "Остаток сброшен" : "Остаток сохранён",
      );
    } catch (e) {
      toast.error(`Не удалось сохранить: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(draft.replace(",", ".").replace("$", "").trim());
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Введите сумму в долларах, например 4 или 3.75");
      return;
    }
    void save(amount);
  }

  if (editing) {
    return (
      // <dl> допускает только <div> группы: форма — внутри
      <div className="col-span-2 min-w-0 rounded-xl bg-muted/40 px-3 py-2.5 sm:col-span-1">
        <form onSubmit={submit}>
          <label
            htmlFor="bird-ai-budget"
            className="block truncate text-xs text-muted-foreground"
          >
            Сколько осталось, $
          </label>
          <div className="mt-1 flex items-center gap-1">
            <Input
              id="bird-ai-budget"
              inputMode="decimal"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={saving}
              className="h-8 min-w-0 tabular-nums"
            />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              disabled={saving}
              aria-label="Сохранить"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              disabled={saving}
              onClick={() => setEditing(false)}
              aria-label="Отмена"
            >
              <X className="size-4" />
            </Button>
          </div>
          {budget && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(null)}
              className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Показывать кредиты команды
            </button>
          )}
        </form>
      </div>
    );
  }

  const hints = [
    budget
      ? `из ${usd(budget.amountUsd)} с ${formatDate(budget.setAt)}`
      : "кредиты команды — впишите свой",
    usage.daysLeft !== null ? `хватит на ~${usage.daysLeft} дн.` : null,
  ].filter(Boolean);

  return (
    <div className="group relative min-w-0 rounded-xl bg-muted/40 px-3 py-2.5">
      <dt className="truncate pr-7 text-xs text-muted-foreground">Остаток</dt>
      <dd className="mt-0.5 truncate text-base font-semibold tabular-nums">
        {usd(budget?.remainingUsd ?? usage.balanceUsd)}
      </dd>
      {hints.map((h) => (
        <dd key={h} className="truncate text-xs text-muted-foreground">
          {h}
        </dd>
      ))}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={startEdit}
        className="absolute right-1.5 top-1.5 size-7 text-muted-foreground"
        aria-label="Изменить остаток"
      >
        <Pencil className="size-3.5" />
      </Button>
    </div>
  );
}
