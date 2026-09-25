"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  getCommandIcon,
  getRangeBounds,
  getRangeState,
  getToggleState,
  isDangerousCommand,
} from "@/lib/commands";
import type { CommandDef, Device, Telemetry } from "@/lib/types";
import { cn } from "@/lib/utils";

type DeviceWithLatest = Device & { latest: Telemetry | null };

export type SendCommand = (
  deviceId: string,
  payload: Record<string, unknown>,
) => Promise<void>;

/**
 * Сколько ждём подтверждения от устройства (новой телеметрии).
 *
 * Должно быть больше периода плановой телеметрии устройства (10 с), иначе
 * таймаут истекает раньше, чем приходит следующая посылка, и UI ругается на
 * команду, которая на самом деле выполнена.
 */
const CONFIRM_TIMEOUT_MS = 15000;
/** Сколько показываем «Готово» после подтверждения */
const DONE_FLASH_MS = 2500;
/** Задержка отправки значения ползунка после последнего движения */
const RANGE_DEBOUNCE_MS = 400;

type Pending = { desired?: boolean | number; sentAt: number };

/**
 * Отправка команд + отслеживание их выполнения.
 * Команда считается выполненной, когда в телеметрии появилось нужное
 * значение (toggle/range) или просто пришла новая телеметрия (trigger).
 */
export function useDeviceCommands(
  device: DeviceWithLatest,
  onCommand: SendCommand,
) {
  const payload = device.latest?.payload;
  const latestAt = device.latest?.created_at
    ? new Date(device.latest.created_at).getTime()
    : 0;
  const [pending, setPending] = useState<Record<string, Pending>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const titles = useRef<Record<string, string>>({});

  const flashDone = useCallback((action: string) => {
    setDone((prev) => ({ ...prev, [action]: true }));
    setTimeout(
      () => setDone((prev) => ({ ...prev, [action]: false })),
      DONE_FLASH_MS,
    );
  }, []);

  /**
   * Команда выполнена, если в телеметрии появилось нужное значение
   * (toggle/range) или, для команд без значения (trigger), пришла свежая
   * телеметрия после отправки.
   */
  const isConfirmed = useCallback(
    (action: string, p: Pending) => {
      if (typeof p.desired === "boolean") {
        return getToggleState(payload, action) === p.desired;
      }
      if (typeof p.desired === "number") {
        return getRangeState(payload, action) === p.desired;
      }
      return latestAt > p.sentAt;
    },
    [payload, latestAt],
  );

  // Подтверждение по телеметрии.
  // `pending` в зависимостях обязателен: ответ устройства может прийти
  // раньше, чем состояние попадёт в этот рендер, и без него команда не
  // перепроверяется до следующего опроса (а то и вовсе).
  useEffect(() => {
    setPending((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [action, p] of Object.entries(prev)) {
        if (isConfirmed(action, p)) {
          delete next[action];
          changed = true;
          flashDone(action);
        }
      }
      return changed ? next : prev;
    });
  }, [pending, isConfirmed, flashDone]);

  // Таймаут: устройство не ответило.
  // Перед тем как показывать предупреждение, ещё раз проверяем свежие
  // данные: телеметрия могла прийти, пока команда ждала своей очереди
  // в медленном опросе.
  useEffect(() => {
    const actions = Object.keys(pending);
    if (actions.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setPending((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [action, p] of Object.entries(prev)) {
          if (now - p.sentAt <= CONFIRM_TIMEOUT_MS) continue;
          delete next[action];
          changed = true;
          if (isConfirmed(action, p)) {
            flashDone(action);
          } else {
            toast.warning(
              `«${titles.current[action] ?? action}»: устройство не подтвердило команду`,
            );
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [pending, isConfirmed, flashDone]);

  const send = useCallback(
    async (cmd: CommandDef, value?: boolean | number) => {
      titles.current[cmd.action] = cmd.title;
      setPending((prev) => ({
        ...prev,
        [cmd.action]: { desired: value, sentAt: Date.now() },
      }));
      try {
        await onCommand(
          device.device_id,
          value === undefined
            ? { action: cmd.action }
            : { action: cmd.action, value },
        );
      } catch (e) {
        setPending((prev) => {
          const next = { ...prev };
          delete next[cmd.action];
          return next;
        });
        toast.error(
          e instanceof Error ? e.message : "Не удалось отправить команду",
        );
      }
    },
    [device.device_id, onCommand],
  );

  return { payload, pending, done, send };
}

/** Команды для обычного управления (без перезагрузки и т.п.) */
export function getUserCommands(device: Device): CommandDef[] {
  return (device.metadata?.commands ?? []).filter(
    (cmd) => !isDangerousCommand(cmd),
  );
}

/** Единица для range: из команды или из формата одноимённой метрики */
function rangeUnit(device: Device, cmd: CommandDef): string {
  if (cmd.unit) return cmd.unit;
  const metric = device.metadata?.metrics?.find((m) => m.key === cmd.action);
  if (metric?.format === "percent") return "%";
  return metric?.unit ?? "";
}

function StatusMark({ pending, done }: { pending: boolean; done: boolean }) {
  if (pending) {
    return (
      <Loader2
        className="size-3.5 shrink-0 text-muted-foreground motion-safe:animate-spin"
        aria-label="Отправляется"
      />
    );
  }
  if (done) {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="size-3.5" aria-hidden />
        Готово
      </span>
    );
  }
  return null;
}

/**
 * Блок управления устройством.
 *  variant="card" — только переключатели (до 3 шт.) для карточки на главной;
 *  variant="full" — все команды: переключатели, ползунки, кнопки.
 */
export function DeviceControls({
  device,
  onCommand,
  variant = "full",
}: {
  device: DeviceWithLatest;
  onCommand: SendCommand;
  variant?: "card" | "full";
}) {
  const { payload, pending, done, send } = useDeviceCommands(
    device,
    onCommand,
  );
  const online = device.is_online;
  const all = getUserCommands(device);
  const commands =
    variant === "card"
      ? all.filter((c) => c.type === "toggle").slice(0, 3)
      : all;

  if (commands.length === 0) return null;

  return (
    <div className="divide-y divide-border/60">
      {commands.map((cmd) => {
        const Icon = getCommandIcon(cmd.icon);
        const p = pending[cmd.action];
        const isPending = Boolean(p);
        const isDone = Boolean(done[cmd.action]);

        if (cmd.type === "toggle") {
          const current = getToggleState(payload, cmd.action) ?? false;
          const shown =
            typeof p?.desired === "boolean" ? p.desired : current;
          return (
            <ToggleRow
              key={cmd.action}
              icon={<Icon className="size-4" aria-hidden />}
              title={cmd.title}
              description={variant === "full" ? cmd.description : undefined}
              checked={shown}
              disabled={!online || isPending}
              compact={variant === "card"}
              status={<StatusMark pending={isPending} done={isDone} />}
              onChange={(next) => void send(cmd, next)}
            />
          );
        }

        if (cmd.type === "range") {
          return (
            <RangeRow
              key={cmd.action}
              cmd={cmd}
              icon={<Icon className="size-4" aria-hidden />}
              unit={rangeUnit(device, cmd)}
              value={
                typeof p?.desired === "number"
                  ? p.desired
                  : getRangeState(payload, cmd.action)
              }
              disabled={!online}
              status={<StatusMark pending={isPending} done={isDone} />}
              onCommit={(value) => void send(cmd, value)}
            />
          );
        }

        return (
          <div
            key={cmd.action}
            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <RowLabel
              icon={<Icon className="size-4" aria-hidden />}
              title={cmd.title}
              description={cmd.description}
            />
            <div className="flex items-center gap-2">
              <StatusMark pending={isPending} done={isDone} />
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3"
                disabled={!online || isPending}
                onClick={() => void send(cmd)}
              >
                Выполнить
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RowLabel({
  icon,
  title,
  description,
  compact,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground",
          compact ? "size-8" : "size-9",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">
          {title}
        </span>
        {description && (
          <span className="block truncate text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  disabled,
  compact,
  status,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  checked: boolean;
  disabled: boolean;
  compact?: boolean;
  status: React.ReactNode;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "relative z-10 flex items-center justify-between gap-3",
        compact ? "py-2 first:pt-0 last:pb-0" : "py-3 first:pt-0 last:pb-0",
      )}
    >
      <RowLabel
        icon={icon}
        title={title}
        description={description}
        compact={compact}
      />
      <div className="flex shrink-0 items-center gap-2">
        {status}
        {!compact && (
          <span className="hidden w-12 text-right text-xs text-muted-foreground sm:inline">
            {checked ? "Вкл" : "Выкл"}
          </span>
        )}
        <Switch
          checked={checked}
          disabled={disabled}
          onCheckedChange={onChange}
          aria-label={`${title}: ${checked ? "выключить" : "включить"}`}
        />
      </div>
    </div>
  );
}

function RangeRow({
  cmd,
  icon,
  unit,
  value,
  disabled,
  status,
  onCommit,
}: {
  cmd: CommandDef;
  icon: React.ReactNode;
  unit: string;
  value: number | undefined;
  disabled: boolean;
  status: React.ReactNode;
  onCommit: (value: number) => void;
}) {
  const { min, max, step } = getRangeBounds(cmd);
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = draft ?? value ?? min;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function change(next: number) {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onCommit(next);
      setDraft(null);
    }, RANGE_DEBOUNCE_MS);
  }

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <RowLabel icon={icon} title={cmd.title} description={cmd.description} />
        <div className="flex shrink-0 items-center gap-2">
          {status}
          <span className="min-w-12 text-right text-sm font-semibold tabular-nums">
            {value === undefined && draft === null ? "—" : shown}
            {unit && (value !== undefined || draft !== null) ? ` ${unit}` : ""}
          </span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={disabled}
        onChange={(e) => change(Number(e.target.value))}
        aria-label={cmd.title}
        className="mt-3 h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}
