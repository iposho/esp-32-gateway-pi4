/**
 * Синтез звуковых сигналов ESP32 в браузере через Web Audio API.
 * Точно повторяет параметры нот и длительностей из прошивки esp32_flat_bme280.ino.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

export type SoundSignalPattern = {
  notes: { freq: number; duration: number; gap: number }[];
};

export const SOUND_PATTERNS: Record<number, SoundSignalPattern> = {
  // 0: Перезвон (C6 -> E6 -> G6 -> C7)
  0: {
    notes: [
      { freq: 1047, duration: 0.15, gap: 0.035 },
      { freq: 1319, duration: 0.15, gap: 0.035 },
      { freq: 1568, duration: 0.18, gap: 0.04 },
      { freq: 2093, duration: 0.28, gap: 0 },
    ],
  },
  // 1: Двойной бип (A6 1760 Гц)
  1: {
    notes: [
      { freq: 1760, duration: 0.1, gap: 0.08 },
      { freq: 1760, duration: 0.14, gap: 0 },
    ],
  },
  // 2: Восходящий (G5->C6->E6->G6->C7)
  2: {
    notes: [
      { freq: 784, duration: 0.08, gap: 0.025 },
      { freq: 1047, duration: 0.08, gap: 0.025 },
      { freq: 1319, duration: 0.08, gap: 0.025 },
      { freq: 1568, duration: 0.08, gap: 0.025 },
      { freq: 2093, duration: 0.08, gap: 0 },
    ],
  },
  // 3: Пульс (3 акцента E6 1319 Гц)
  3: {
    notes: [
      { freq: 1319, duration: 0.12, gap: 0.09 },
      { freq: 1319, duration: 0.12, gap: 0.09 },
      { freq: 1319, duration: 0.12, gap: 0 },
    ],
  },
};

/**
 * Проиграть мелодию сигнала в динамиках браузера.
 * @param signalId ID мелодии (0..3)
 * @param volumePct Громкость в процентах (10..100)
 */
export function playSignalInBrowser(signalId: number, volumePct = 80): void {
  try {
    const ctx = getAudioContext();
    const pattern = SOUND_PATTERNS[signalId] ?? SOUND_PATTERNS[0];
    if (!pattern) return;

    let time = ctx.currentTime + 0.02;
    const gainVal = Math.min(Math.max(volumePct / 100, 0.05), 1.0) * 0.15; // масштабируем для комфортной громкости

    for (const note of pattern.notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Динамик ESP32 играет прямоугольный ШИМ (square wave)
      osc.type = "square";
      osc.frequency.setValueAtTime(note.freq, time);

      // Легкое сглаживание атаки/затухания, чтобы не щелкало
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.exponentialRampToValueAtTime(gainVal, time + 0.01);
      gain.gain.setValueAtTime(gainVal, time + note.duration - 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, time + note.duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(time);
      osc.stop(time + note.duration);

      time += note.duration + note.gap;
    }
  } catch (err) {
    console.warn("Could not play sound preview:", err);
  }
}
