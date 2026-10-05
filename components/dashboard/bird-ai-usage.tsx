"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Check, ChevronRight, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BirdAiUsage } from "@/lib/bird-ai-usage";
import type { BirdScheduleState } from "@/app/api/birdfeeder/schedule/route";
import {
  type BirdSchedule,
  SCHEDULE_PRESETS,
  findPreset,
  parseSchedule,
} from "@/lib/bird-schedule-shared";
import { cn } from "@/lib/utils";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as BirdAiUsage;
};

const scheduleFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as BirdScheduleState;
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
    "/api/birdfeeder/usage",
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

          <BirdAiScheduleSection />

          <Link
            href="/dashboard/birdfeeder/labels"
            className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2.5 text-sm transition-colors hover:bg-muted/60"
          >
            <span>
              <span className="font-medium">Разметка снимков</span>
              <span className="block text-xs text-muted-foreground">
                Ответить «птица или нет» по архиву и проверить модель
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>

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

/**
 * Часы работы распознавания птиц: вне окна снимки не забираются с камеры
 * и не уходят в модель. Пресеты по солнцу или фикс. часам, либо своё время.
 */
function BirdAiScheduleSection() {
  const { data, error, mutate } = useSWR(
    "/api/birdfeeder/schedule",
    scheduleFetcher,
    { refreshInterval: 60_000 },
  );

  const [saving, setSaving] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState("06:00");
  const [customEnd, setCustomEnd] = useState("20:00");

  if (!data && !error) {
    return (
      <div className="border-t border-border/50 pt-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span>Загрузка расписания…</span>
        </div>
      </div>
    );
  }

  if (error || !data) return null;

  const currentPresetId = findPreset(data.schedule);
  const isCustomFixed = currentPresetId === null && data.schedule.mode === "fixed";

  async function save(schedule: BirdSchedule | null) {
    setSaving(true);
    try {
      const res = await fetch("/api/birdfeeder/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      await mutate(body, false);
      setCustomOpen(false);
      toast.success(
        schedule === null
          ? "Расписание сброшено к настройкам по умолчанию"
          : "Часы работы сохранены",
      );
    } catch (e) {
      toast.error(`Не удалось сохранить: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseSchedule({
      mode: "fixed",
      start: customStart,
      end: customEnd,
    });
    if (!parsed) {
      toast.error(
        "Укажите разное корректное время начала и конца, например 07:00 и 20:00",
      );
      return;
    }
    void save(parsed);
  }

  function startCustomEdit() {
    if (data?.schedule.mode === "fixed") {
      setCustomStart(data.schedule.start);
      setCustomEnd(data.schedule.end);
    }
    setCustomOpen(true);
  }

  return (
    <div className="border-t border-border/50 pt-3.5">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            Часы работы
          </h3>
          {data.awakeNow ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Сейчас активно
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-muted-foreground/60" />
              Вне окна
            </span>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          {data.today.start && data.today.end ? (
            <span>
              Сегодня:{" "}
              <strong className="font-semibold text-foreground">
                {data.today.start}–{data.today.end}
              </strong>
              {" · "}
              {data.location.city}
            </span>
          ) : (
            <strong className="font-semibold text-foreground">
              Круглосуточно
            </strong>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SCHEDULE_PRESETS.map((p) => {
          const isActive = currentPresetId === p.id && !customOpen;
          return (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={isActive ? "secondary" : "outline"}
              className={cn(
                "h-7 text-xs",
                isActive && "border-primary/40 bg-accent font-medium shadow-xs",
              )}
              disabled={saving}
              onClick={() => {
                setCustomOpen(false);
                void save(p.schedule);
              }}
            >
              {p.title}
            </Button>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant={isCustomFixed || customOpen ? "secondary" : "outline"}
          className={cn(
            "h-7 text-xs",
            (isCustomFixed || customOpen) &&
              "border-primary/40 bg-accent font-medium shadow-xs",
          )}
          disabled={saving}
          onClick={startCustomEdit}
        >
          {isCustomFixed && !customOpen && data.schedule.mode === "fixed"
            ? `Своё: ${data.schedule.start}–${data.schedule.end}`
            : "Своё время"}
        </Button>
      </div>

      {customOpen && (
        <form
          onSubmit={handleCustomSubmit}
          className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2 text-xs"
        >
          <span className="text-muted-foreground">С</span>
          <Input
            type="time"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            disabled={saving}
            className="h-7 w-24 text-xs tabular-nums"
            required
          />
          <span className="text-muted-foreground">до</span>
          <Input
            type="time"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            disabled={saving}
            className="h-7 w-24 text-xs tabular-nums"
            required
          />
          <Button
            type="submit"
            size="sm"
            className="h-7 text-xs"
            disabled={saving}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Сохранить"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={saving}
            onClick={() => setCustomOpen(false)}
          >
            Отмена
          </Button>
        </form>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          Рассвет {data.today.sun.dawn}, восход {data.today.sun.sunrise}, закат{" "}
          {data.today.sun.sunset}, сумерки {data.today.sun.dusk}
        </span>
        {data.stored && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(null)}
            className="underline-offset-2 hover:underline"
          >
            По умолчанию
          </button>
        )}
      </div>
    </div>
  );
}

