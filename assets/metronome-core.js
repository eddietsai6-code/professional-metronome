export const APP_VERSION = "0.1.0";

export const TEMPO_MIN = 30;
export const TEMPO_MAX = 280;
export const BEATS_PER_BAR_MIN = 1;
export const BEATS_PER_BAR_MAX = 16;
export const BEAT_UNITS = [2, 4, 8, 16, 32];
export const ACCENT_LEVELS = ["accent", "secondary", "normal", "rest"];

const DEFAULT_METER = {
  beatsPerBar: 4,
  beatUnit: 4,
};

let presetIdSequence = 0;

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(max, Math.max(min, number));
}

export function clampTempo(value) {
  return Math.round(clampNumber(value, TEMPO_MIN, TEMPO_MAX));
}

export function normalizeBeatUnit(value) {
  const unit = Number(value);
  if (BEAT_UNITS.includes(unit)) {
    return unit;
  }
  if (unit < BEAT_UNITS[0]) {
    return BEAT_UNITS[0];
  }
  if (unit > BEAT_UNITS[BEAT_UNITS.length - 1]) {
    return BEAT_UNITS[BEAT_UNITS.length - 1];
  }
  return DEFAULT_METER.beatUnit;
}

export function normalizeAccentLevel(level, fallback = "normal") {
  return ACCENT_LEVELS.includes(level) ? level : fallback;
}

export function resizeBeats(beats = [], beatsPerBar = DEFAULT_METER.beatsPerBar) {
  const beatList = Array.isArray(beats) ? beats : [];
  const count = Math.round(
    clampNumber(beatsPerBar, BEATS_PER_BAR_MIN, BEATS_PER_BAR_MAX)
  );

  return Array.from({ length: count }, (_, index) => {
    const existing = beatList[index];
    const fallback = index === 0 ? "accent" : "normal";
    return {
      index,
      level: normalizeAccentLevel(existing?.level, fallback),
    };
  });
}

export function normalizeMeter(meter = {}) {
  const normalizedMeter = meter ?? {};
  const beatsPerBar = Math.round(
    clampNumber(
      normalizedMeter.beatsPerBar ?? DEFAULT_METER.beatsPerBar,
      BEATS_PER_BAR_MIN,
      BEATS_PER_BAR_MAX
    )
  );

  return {
    beatsPerBar,
    beatUnit: normalizeBeatUnit(
      normalizedMeter.beatUnit ?? DEFAULT_METER.beatUnit
    ),
    beats: resizeBeats(normalizedMeter.beats, beatsPerBar),
  };
}

export function normalizeTempoMode(mode) {
  return mode === "QPM" ? "QPM" : "BPM";
}

export function createDefaultState(overrides = {}) {
  const normalizedOverrides = overrides ?? {};
  return {
    tempo: clampTempo(normalizedOverrides.tempo ?? 120),
    tempoMode: normalizeTempoMode(normalizedOverrides.tempoMode),
    meter: normalizeMeter(normalizedOverrides.meter),
    subdivision: normalizeSubdivision(normalizedOverrides.subdivision),
    countInBars: normalizeCountInBars(normalizedOverrides.countInBars),
    volume: clampNumber(normalizedOverrides.volume ?? 0.8, 0, 1),
    muted: Boolean(normalizedOverrides.muted),
    soundStyle: normalizedOverrides.soundStyle ?? "digital",
    visualMode: normalizedOverrides.visualMode ?? "all",
    trainer: normalizeTrainer(normalizedOverrides.trainer),
    timer: {
      enabled: Boolean(normalizedOverrides.timer?.enabled),
      minutes: clampInteger(normalizedOverrides.timer?.minutes ?? 10, 1, 240),
      autoStartMetronome: Boolean(
        normalizedOverrides.timer?.autoStartMetronome
      ),
      autoStopMetronome: Boolean(normalizedOverrides.timer?.autoStopMetronome),
      loop: Boolean(normalizedOverrides.timer?.loop),
    },
  };
}

export function getBeatDurationSeconds({ tempo, tempoMode, beatUnit }) {
  const safeTempo = clampTempo(tempo);
  if (normalizeTempoMode(tempoMode) === "QPM") {
    return (60 / safeTempo) * (4 / normalizeBeatUnit(beatUnit));
  }
  return 60 / safeTempo;
}

export const SUBDIVISIONS = {
  none: [0],
  eighth: [0, 0.5],
  triplet: [0, 1 / 3, 2 / 3],
  sixteenth: [0, 0.25, 0.5, 0.75],
  dotted: [0, 0.75],
};

export function normalizeSubdivision(value) {
  return Object.hasOwn(SUBDIVISIONS, value) ? value : "none";
}

export function getSubdivisionOffsets(value) {
  return [...SUBDIVISIONS[normalizeSubdivision(value)]];
}

export function clampInteger(value, min, max) {
  return Math.round(clampNumber(value, min, max));
}

export function normalizeCountInBars(value) {
  return clampInteger(value ?? 0, 0, 8);
}

export function normalizeTrainer(trainer = {}) {
  const normalizedTrainer = trainer ?? {};
  return {
    enabled: Boolean(normalizedTrainer.enabled),
    mode: normalizedTrainer.mode === "random" ? "random" : "fixed",
    playBars: clampInteger(normalizedTrainer.playBars ?? 3, 1, 32),
    muteBars: clampInteger(normalizedTrainer.muteBars ?? 1, 1, 32),
    randomMutePercent: clampInteger(
      normalizedTrainer.randomMutePercent ?? 15,
      0,
      100
    ),
    hideMutedVisuals: Boolean(normalizedTrainer.hideMutedVisuals),
  };
}

export function isTrainerMutedBar(barIndex, trainer = {}, random = Math.random) {
  const safeTrainer = normalizeTrainer(trainer);
  if (!safeTrainer.enabled || barIndex < 0) {
    return false;
  }

  if (safeTrainer.mode === "random") {
    return random() < safeTrainer.randomMutePercent / 100;
  }

  const cycle = safeTrainer.playBars + safeTrainer.muteBars;
  return barIndex % cycle >= safeTrainer.playBars;
}

export function createSchedule({
  state,
  bars = 1,
  startTime = 0,
  random = Math.random,
  barOffset = 0,
} = {}) {
  const safeState = createDefaultState(state);
  safeState.meter = normalizeMeter(state?.meter ?? safeState.meter);
  safeState.subdivision = normalizeSubdivision(state?.subdivision);
  safeState.countInBars = normalizeCountInBars(state?.countInBars);
  safeState.trainer = normalizeTrainer(state?.trainer);

  const events = [];
  const beatDuration = getBeatDurationSeconds({
    tempo: safeState.tempo,
    tempoMode: safeState.tempoMode,
    beatUnit: safeState.meter.beatUnit,
  });
  const barDuration = beatDuration * safeState.meter.beatsPerBar;
  const offsets = getSubdivisionOffsets(safeState.subdivision);
  const totalMainBars = clampInteger(bars, 1, 256);
  const safeBarOffset = clampInteger(barOffset, 0, 1000000);
  const firstBar =
    safeState.countInBars > 0 ? -safeState.countInBars : safeState.countInBars;
  const lastBar = totalMainBars - 1;

  for (let barIndex = firstBar; barIndex <= lastBar; barIndex += 1) {
    const isCountIn = barIndex < 0;
    const globalBarIndex = isCountIn ? barIndex : barIndex + safeBarOffset;
    const mutedByTrainer = isTrainerMutedBar(
      globalBarIndex,
      safeState.trainer,
      random
    );
    const barStart = startTime + (barIndex - firstBar) * barDuration;

    for (const beat of safeState.meter.beats) {
      for (
        let subdivisionIndex = 0;
        subdivisionIndex < offsets.length;
        subdivisionIndex += 1
      ) {
        const offset = offsets[subdivisionIndex];
        const isMain = subdivisionIndex === 0;
        const rested = beat.level === "rest";
        const audible = !rested && !mutedByTrainer;
        events.push({
          time: barStart + beat.index * beatDuration + offset * beatDuration,
          barIndex: globalBarIndex,
          beatIndex: beat.index,
          subdivisionIndex,
          kind: isMain ? "main" : "subdivision",
          level: isMain ? beat.level : "subdivision",
          audible,
          isCountIn,
          mutedByTrainer,
          visual: !(mutedByTrainer && safeState.trainer.hideMutedVisuals),
        });
      }
    }
  }

  return events;
}

export function calculateTapTempo(
  timestampsMs,
  options = {}
) {
  const { maxGapMs = 2000, sampleLimit = 6 } = options ?? {};
  if (!Array.isArray(timestampsMs) || timestampsMs.length < 2) {
    return null;
  }

  const samples = timestampsMs
    .filter((time) => Number.isFinite(time))
    .slice(-sampleLimit);
  if (samples.length < 2) {
    return null;
  }

  const intervals = [];
  for (let index = 1; index < samples.length; index += 1) {
    const interval = samples[index] - samples[index - 1];
    if (interval <= 0 || interval > maxGapMs) {
      return null;
    }
    intervals.push(interval);
  }

  const average =
    intervals.reduce((total, interval) => total + interval, 0) /
    intervals.length;
  return clampTempo(60000 / average);
}

function createPresetId(name) {
  presetIdSequence = (presetIdSequence + 1) % Number.MAX_SAFE_INTEGER;
  const slug =
    String(name || "preset")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "preset";

  return `preset-${Date.now().toString(36)}-${presetIdSequence.toString(
    36
  )}-${slug}`;
}

export function createPreset(name, state) {
  const presetName = String(name || "Preset").trim() || "Preset";
  return {
    id: createPresetId(presetName),
    name: presetName,
    state: createDefaultState(state),
    createdAt: new Date().toISOString(),
  };
}

export function validatePreset(preset) {
  if (!preset || typeof preset !== "object") {
    return null;
  }

  const name = String(preset.name || "").trim();
  if (!name || !preset.state || typeof preset.state !== "object") {
    return null;
  }

  return {
    id: String(preset.id || createPresetId(name)),
    name,
    state: createDefaultState(preset.state),
    createdAt: String(preset.createdAt || new Date().toISOString()),
  };
}

export function getVisualBeatState(event, visualMode = "all") {
  if (!event?.visual) {
    return "hidden";
  }
  if (visualMode === "pendulum") {
    return "pendulum";
  }
  if (visualMode === "accent") {
    return event.level === "accent" ? "active" : "idle";
  }
  if (visualMode === "accent-secondary") {
    return event.level === "accent" || event.level === "secondary"
      ? "active"
      : "idle";
  }
  return "active";
}

export function getAudibleEventLevel(event, muted) {
  if (muted || !event?.audible) {
    return "silent";
  }
  return event.level;
}
