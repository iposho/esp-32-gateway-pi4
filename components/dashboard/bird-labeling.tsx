"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { ArrowLeft, Bird, Check, FlaskConical, Loader2, RefreshCw, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { LabelFilter, LabelItem, LabelsResponse } from "@/app/api/birdfeeder/labels/route";
import type { BirdAiUsage } from "@/lib/bird-ai-usage";
import { REGION_SPECIES } from "@/lib/bird-species";
import { cn } from "@/lib/utils";

/*
 * Разметка снимков из архива для проверки модели: человек отвечает «птица / нет»
 * и вид, /api/birdfeeder/eval сравнивает с этим ответы модели. Цель — 30–50
 * размеченных снимков, в первую очередь спорных и ошибочных.
 */

const FILTERS: Array<{ value: LabelFilter; label: string; hint: string }> = [
  { value: "unlabeled", label: "Не размечены", hint: "все снимки без вашего ответа" },
  { value: "uncertain", label: "Спорные", hint: "модель уверена в птице на 30–70%" },
  { value: "model-bird", label: "Модель: птица", hint: "ищите ложные «да»: ветки, тени, руки" },
  { value: "model-nobird", label: "Модель: нет", hint: "ищите пропущенных птиц" },
  { value: "labeled", label: "Размечены", hint: "проверить и поправить свои ответы" },
];

/** Сколько размеченных снимков нужно, чтобы цифры eval что-то значили */
const LABEL_GOAL = 40;
/** Вид неясен — птица есть, но какая, не видно */
const SPECIES_UNKNOWN = "";
const SPECIES_OTHER = "__other";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
  return body as T;
}

function percent(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function photoUrl(id: number): string {
  return `/api/birdfeeder/photo?detection=${id}`;
}

export function BirdLabeling() {
  const [filter, setFilter] = useState<LabelFilter>("unlabeled");

  const { data, error, isLoading, size, setSize, mutate } = useSWRInfinite<LabelsResponse>(
    (index, prev) => {
      if (prev && prev.nextBefore === null) return null;
      const params = new URLSearchParams({ filter });
      if (index > 0 && prev?.nextBefore) params.set("before", String(prev.nextBefore));
      return `/api/birdfeeder/labels?${params}`;
    },
    (url: string) => json<LabelsResponse>(url),
    { revalidateFirstPage: false },
  );

  const items = data?.flatMap((p) => p.items) ?? [];
  const counts = data?.[data.length - 1]?.counts ?? data?.[0]?.counts;
  const hasMore = data ? data[data.length - 1]?.nextBefore !== null : false;
  const loadingMore = size > 0 && data !== undefined && typeof data[size - 1] === "undefined";

  /** Записать ответ и сразу показать его в карточке, не перезагружая ленту */
  async function saveLabel(item: LabelItem, labelBird: boolean | null, speciesLatin: string | null) {
    const patch = (labelBirdValue: boolean | null, latin: string | null) =>
      mutate(
        (pages) =>
          pages?.map((p) => ({
            ...p,
            items: p.items.map((i) =>
              i.id === item.id ? { ...i, labelBird: labelBirdValue, labelSpeciesLatin: latin } : i,
            ),
          })),
        { revalidate: false },
      );
    const prev = { labelBird: item.labelBird, latin: item.labelSpeciesLatin };
    void patch(labelBird, labelBird ? speciesLatin : null);
    try {
      const res = await json<{ labelSpeciesLatin: string | null }>("/api/birdfeeder/labels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, labelBird, speciesLatin }),
      });
      void patch(labelBird, res.labelSpeciesLatin);
    } catch (e) {
      void patch(prev.labelBird, prev.latin);
      toast.error(`Не сохранилось: ${(e as Error).message}`);
    }
  }

  return (
    <DashboardShell
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void mutate()}
          aria-label="Обновить"
          className="h-9 px-2.5 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
          <span className="hidden sm:inline">Обновить</span>
        </Button>
      }
    >
      <main className="mx-auto max-w-7xl px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
        <Link
          href="/dashboard"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Устройства
        </Link>

        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Кормушка
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Разметка снимков
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Отметьте, есть ли на снимке птица и какая. По этим ответам проверка модели считает,
            как часто она ошибается, и помогает выбрать порог уверенности. Важнее всего спорные
            снимки и ошибки модели, а не очевидные.
          </p>
        </div>

        {counts && (
          <dl className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="В архиве" value={String(counts.archived)} />
            <Tile
              label="Размечено"
              value={String(counts.labeled)}
              hint={
                counts.labeled >= LABEL_GOAL
                  ? "достаточно для проверки"
                  : `для проверки нужно ~${LABEL_GOAL}`
              }
            />
            <Tile label="С птицей" value={String(counts.labeledBird)} />
            <Tile label="Без птицы" value={String(counts.labeledNoBird)} />
          </dl>
        )}

        <EvalPanel labeled={counts?.labeled ?? 0} />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                  filter === f.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {FILTERS.find((f) => f.value === filter)?.hint}
          </span>
        </div>

        {error && (
          <Card className="mb-6 border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Не удалось загрузить снимки: {(error as Error).message}
          </Card>
        )}
        {isLoading && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
        {!isLoading && !error && items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Здесь пусто. Архив пополняется снимками, которые уходят в модель днём.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <LabelCard key={item.id} item={item} onLabel={saveLabel} />
          ))}
        </div>

        {hasMore && (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" onClick={() => void setSize(size + 1)} disabled={loadingMore}>
              {loadingMore && <Loader2 className="size-3.5 animate-spin" />}
              Показать ещё
            </Button>
          </div>
        )}
      </main>
    </DashboardShell>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/40 px-3 py-2.5">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-base font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="truncate text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

function ModelAnswer({ item }: { item: LabelItem }) {
  if (item.error) {
    return <span className="text-destructive">Ошибка модели</span>;
  }
  if (item.isBird === null) return <span>Модель не ответила</span>;
  const sure = item.birdConfidence === null ? "" : ` · ${percent(item.birdConfidence)}`;
  if (!item.isBird) {
    return (
      <span>
        Модель: нет птицы{sure}
        {item.species && <span className="text-muted-foreground/70"> (думала: {item.species})</span>}
      </span>
    );
  }
  return (
    <span>
      Модель: птица{item.count > 1 ? ` ×${item.count}` : ""}
      {sure}
      {item.species && (
        <>
          {" · "}
          <span className="text-foreground">{item.species}</span>
          {item.confidence ? ` ${percent(item.confidence)}` : ""}
        </>
      )}
    </span>
  );
}

function LabelCard({
  item,
  onLabel,
}: {
  item: LabelItem;
  onLabel: (item: LabelItem, labelBird: boolean | null, speciesLatin: string | null) => Promise<void>;
}) {
  const [other, setOther] = useState(false);
  const [otherLatin, setOtherLatin] = useState("");
  const knownLatin = REGION_SPECIES.some((s) => s.latin === item.labelSpeciesLatin);
  const selectValue =
    item.labelSpeciesLatin === null
      ? SPECIES_UNKNOWN
      : knownLatin
        ? item.labelSpeciesLatin
        : SPECIES_OTHER;

  /** «Птица»: сразу подставляем вид, который назвала модель, — чаще всего он верен */
  function markBird() {
    const guess = item.latin && REGION_SPECIES.some((s) => s.latin === item.latin) ? item.latin : null;
    void onLabel(item, true, item.labelBird === true ? item.labelSpeciesLatin : guess);
  }

  const agrees = item.labelBird !== null && item.isBird !== null && item.labelBird === item.isBird;
  const disagrees = item.labelBird !== null && item.isBird !== null && item.labelBird !== item.isBird;

  return (
    <Card
      className={cn(
        "overflow-hidden bg-card/75 p-0",
        disagrees && "ring-1 ring-amber-500/60",
        agrees && "ring-1 ring-emerald-500/40",
      )}
    >
      <a href={photoUrl(item.id)} target="_blank" rel="noreferrer" className="block bg-muted/40">
        {/* eslint-disable-next-line @next/next/no-img-element -- JPEG из архива, оптимизатор не нужен */}
        <img
          src={photoUrl(item.id)}
          alt={`Снимок ${item.id}`}
          loading="lazy"
          className="aspect-[4/3] w-full object-cover"
        />
      </a>
      <div className="space-y-2.5 p-3">
        <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <span>{formatDate(item.shotAt)}</span>
          <span className="truncate">#{item.id} · {item.promptVersion ?? "до v3"}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          <ModelAnswer item={item} />
        </p>
        {disagrees && (
          <p className="text-xs text-amber-600 dark:text-amber-400">Модель ошиблась</p>
        )}

        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant={item.labelBird === true ? "default" : "outline"}
            className="flex-1"
            onClick={markBird}
          >
            <Bird className="size-3.5" aria-hidden />
            Птица
          </Button>
          <Button
            size="sm"
            variant={item.labelBird === false ? "default" : "outline"}
            className="flex-1"
            onClick={() => void onLabel(item, false, null)}
          >
            <X className="size-3.5" aria-hidden />
            Нет птицы
          </Button>
          {item.labelBird !== null && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Снять разметку"
              title="Снять разметку"
              onClick={() => void onLabel(item, null, null)}
            >
              <Undo2 className="size-3.5" />
            </Button>
          )}
        </div>

        {item.labelBird === true && (
          <div className="space-y-1.5">
            <select
              value={other ? SPECIES_OTHER : selectValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === SPECIES_OTHER) {
                  setOther(true);
                  return;
                }
                setOther(false);
                void onLabel(item, true, v === SPECIES_UNKNOWN ? null : v);
              }}
              className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm"
              aria-label="Вид птицы"
            >
              <option value={SPECIES_UNKNOWN}>Вид неясен</option>
              {REGION_SPECIES.map((s) => (
                <option key={s.latin} value={s.latin}>
                  {s.ru} ({s.latin})
                </option>
              ))}
              <option value={SPECIES_OTHER}>
                {selectValue === SPECIES_OTHER ? `Другой: ${item.labelSpeciesLatin}` : "Другой…"}
              </option>
            </select>
            {other && (
              <form
                className="flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!otherLatin.trim()) return;
                  setOther(false);
                  void onLabel(item, true, otherLatin.trim());
                }}
              >
                <Input
                  autoFocus
                  value={otherLatin}
                  onChange={(e) => setOtherLatin(e.target.value)}
                  placeholder="Латинское название, напр. Upupa epops"
                  className="h-8 text-sm"
                />
                <Button size="icon-sm" type="submit" aria-label="Сохранить вид">
                  <Check className="size-3.5" />
                </Button>
              </form>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

type EvalMetrics = {
  n: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number | null;
  recall: number | null;
  speciesAccuracy: number | null;
};

type EvalResponse = {
  model: string;
  reference: boolean;
  minBirdConfidence: number;
  current: EvalMetrics & {
    byThreshold: Array<EvalMetrics & { threshold: number }>;
    errors: number;
    costUsd: number;
    avgCostUsd: number | null;
    avgMs: number | null;
  };
  stored: Record<string, EvalMetrics>;
  results: Array<{ id: number; label: boolean; bird?: boolean; birdConfidence?: number | null; error?: string }>;
};

const EVAL_LIMITS = [20, 50];

/**
 * Прогон /api/birdfeeder/eval: платный, поэтому только по кнопке и с подтверждением цены.
 * Показывает точность и полноту по порогам и снимки, где модель ошиблась.
 */
function EvalPanel({ labeled }: { labeled: number }) {
  const [limit, setLimit] = useState(20);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EvalResponse | null>(null);
  const { data: usage } = useSWR("/api/birdfeeder/usage", (url: string) => json<BirdAiUsage>(url));

  const calls = Math.min(limit, labeled);
  const estimate =
    usage?.avgPhotoUsd !== null && usage?.avgPhotoUsd !== undefined
      ? `≈ $${(usage.avgPhotoUsd * calls).toFixed(4)}`
      : "цена неизвестна";

  async function run() {
    const ok = window.confirm(
      `Прогнать ${calls} размеченных снимков через модель?\n` +
        `Это ${calls} платных вызовов (${estimate}), они входят в дневной лимит.`,
    );
    if (!ok) return;
    setRunning(true);
    try {
      setResult(await json<EvalResponse>(`/api/birdfeeder/eval?limit=${limit}`, { method: "POST" }));
    } catch (e) {
      toast.error(`Проверка не удалась: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  const threshold = result?.minBirdConfidence ?? 0;
  const mistakes =
    result?.results.filter(
      (r) =>
        !r.error &&
        r.bird !== undefined &&
        (r.bird && (r.birdConfidence ?? 1) >= threshold) !== r.label,
    ) ?? [];

  return (
    <Card className="mb-6 bg-card/75 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
            <FlaskConical className="size-4" aria-hidden />
            Проверка модели
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Последние размеченные снимки через текущий промпт и модель: {calls} вызовов, {estimate}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
            aria-label="Сколько снимков"
          >
            {EVAL_LIMITS.map((n) => (
              <option key={n} value={n}>
                {n} снимков
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => void run()} disabled={running || labeled === 0}>
            {running && <Loader2 className="size-3.5 animate-spin" />}
            Проверить
          </Button>
        </div>
      </div>

      {result && (
        <div className="mt-4 space-y-4 text-sm">
          <p className="text-xs text-muted-foreground">
            {result.model}
            {result.reference ? " · с кадром для сравнения, где он был" : ""} · {result.current.n} снимков ·
            ${result.current.costUsd.toFixed(4)}
            {result.current.avgMs !== null ? ` · ${result.current.avgMs} мс на снимок` : ""}
            {result.current.errors > 0 ? ` · ошибок: ${result.current.errors}` : ""}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] tabular-nums">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 text-left font-medium">Порог уверенности</th>
                  <th className="py-1 text-right font-medium" title="Доля настоящих птиц среди ответов «птица»">
                    Точность
                  </th>
                  <th className="py-1 text-right font-medium" title="Доля найденных птиц">
                    Полнота
                  </th>
                  <th className="py-1 text-right font-medium">Ложные «да»</th>
                  <th className="py-1 text-right font-medium">Пропуски</th>
                </tr>
              </thead>
              <tbody>
                <MetricsRow label="без порога" m={result.current} />
                {result.current.byThreshold.map((t) => (
                  <MetricsRow
                    key={t.threshold}
                    label={`≥ ${t.threshold}${t.threshold === threshold && threshold > 0 ? " (сейчас)" : ""}`}
                    m={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {result.current.speciesAccuracy !== null && (
            <p className="text-xs text-muted-foreground">
              Вид угадан в {percent(result.current.speciesAccuracy)} найденных птиц с размеченным видом.
            </p>
          )}

          {Object.keys(result.stored).length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-medium text-muted-foreground">
                Сохранённые ответы на тех же снимках, по версиям промпта
              </h4>
              <table className="w-full tabular-nums">
                <tbody>
                  {Object.entries(result.stored).map(([version, m]) => (
                    <MetricsRow key={version} label={`${version} (${m.n})`} m={m} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {mistakes.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                Ошибки модели при текущем пороге ({mistakes.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {mistakes.map((r) => (
                  <a
                    key={r.id}
                    href={photoUrl(r.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="w-28 text-xs text-muted-foreground"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- JPEG из архива */}
                    <img
                      src={photoUrl(r.id)}
                      alt={`Снимок ${r.id}`}
                      loading="lazy"
                      className="aspect-[4/3] w-full rounded-md object-cover"
                    />
                    {r.label ? "пропустила птицу" : "лишняя птица"} {percent(r.birdConfidence)}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function MetricsRow({ label, m }: { label: string; m: EvalMetrics }) {
  return (
    <tr className="border-t border-border/50">
      <td className="py-1.5 text-muted-foreground">{label}</td>
      <td className="py-1.5 text-right font-medium">{percent(m.precision)}</td>
      <td className="py-1.5 text-right font-medium">{percent(m.recall)}</td>
      <td className="py-1.5 text-right">{m.fp}</td>
      <td className="py-1.5 text-right">{m.fn}</td>
    </tr>
  );
}
