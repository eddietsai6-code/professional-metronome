export const APP_VERSION = "0.1.0";

export const TEMPO_MIN = 30;
export const TEMPO_MAX = 280;
export const BEATS_PER_BAR_MIN = 1;
export const BEATS_PER_BAR_MAX = 16;
export const BEAT_UNITS = [2, 4, 8, 16, 32];
export const ACCENT_LEVELS = ["accent", "secondary", "normal", "rest"];
export const BEAT_RHYTHMS = [
  "inherit",
  "quarter",
  "eighth",
  "eighth-rest-note",
  "triplet",
  "triplet-rest-note-note",
  "triplet-note-rest-note",
  "triplet-note-note-rest",
  "sixteenth",
  "sixteenth-rest-note-rest-note",
  "sixteenth-pair-eighth",
  "eighth-sixteenth-pair",
  "dotted-eighth-sixteenth",
  "sixteenth-dotted-eighth",
  "sixteenth-eighth-sixteenth",
  "rest",
];
export const PATTERN_SEGMENTS_MAX = 8;

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

export function normalizeBeatRhythm(rhythm) {
  return BEAT_RHYTHMS.includes(rhythm) ? rhythm : "inherit";
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
      rhythm: normalizeBeatRhythm(existing?.rhythm),
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
  const tempo = clampTempo(normalizedOverrides.tempo ?? 120);
  const tempoMode = normalizeTempoMode(normalizedOverrides.tempoMode);
  const meter = normalizeMeter(normalizedOverrides.meter);
  const subdivision = normalizeSubdivision(normalizedOverrides.subdivision);
  const baseState = {
    tempo,
    tempoMode,
    meter,
    subdivision,
  };

  return {
    ...baseState,
    countInBars: normalizeCountInBars(normalizedOverrides.countInBars),
    volume: clampNumber(normalizedOverrides.volume ?? 0.8, 0, 1),
    muted: Boolean(normalizedOverrides.muted),
    soundStyle: normalizedOverrides.soundStyle ?? "digital",
    visualMode: normalizedOverrides.visualMode ?? "all",
    patternChain: normalizePatternChain(
      normalizedOverrides.patternChain,
      baseState
    ),
    polyrhythm: normalizePolyrhythm(normalizedOverrides.polyrhythm),
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
  quintuplet: [0, 0.2, 0.4, 0.6, 0.8],
  sextuplet: [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6],
  septuplet: [0, 1 / 7, 2 / 7, 3 / 7, 4 / 7, 5 / 7, 6 / 7],
  thirtysecond: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875],
  dotted: [0, 0.75],
  shuffle: [0, 2 / 3],
  "swung-sixteenth": [0, 1 / 3, 0.5, 5 / 6],
};

export const SUBDIVISION_OPTIONS = [
  { value: "none", label: "Quarter" },
  { value: "eighth", label: "Eighth" },
  { value: "triplet", label: "Triplet" },
  { value: "sixteenth", label: "Sixteenth" },
  { value: "quintuplet", label: "Quintuplet" },
  { value: "sextuplet", label: "Sextuplet" },
  { value: "septuplet", label: "Septuplet" },
  { value: "thirtysecond", label: "Thirty-second" },
  { value: "dotted", label: "Dotted" },
  { value: "shuffle", label: "Shuffle" },
  { value: "swung-sixteenth", label: "Swung sixteenth" },
];

export function normalizeSubdivision(value) {
  return Object.hasOwn(SUBDIVISIONS, value) ? value : "none";
}

export function getSubdivisionOffsets(value) {
  return [...SUBDIVISIONS[normalizeSubdivision(value)]];
}

const BEAT_RHYTHM_PATTERNS = {
  quarter: {
    offsets: [0],
    audible: [true],
  },
  eighth: {
    offsets: [0, 0.5],
    audible: [true, true],
  },
  "eighth-rest-note": {
    offsets: [0, 0.5],
    audible: [false, true],
  },
  triplet: {
    offsets: [0, 1 / 3, 2 / 3],
    audible: [true, true, true],
  },
  "triplet-rest-note-note": {
    offsets: [0, 1 / 3, 2 / 3],
    audible: [false, true, true],
  },
  "triplet-note-rest-note": {
    offsets: [0, 1 / 3, 2 / 3],
    audible: [true, false, true],
  },
  "triplet-note-note-rest": {
    offsets: [0, 1 / 3, 2 / 3],
    audible: [true, true, false],
  },
  sixteenth: {
    offsets: [0, 0.25, 0.5, 0.75],
    audible: [true, true, true, true],
  },
  "sixteenth-rest-note-rest-note": {
    offsets: [0, 0.25, 0.5, 0.75],
    audible: [false, true, false, true],
  },
  "sixteenth-pair-eighth": {
    offsets: [0, 0.25, 0.5],
    audible: [true, true, true],
  },
  "eighth-sixteenth-pair": {
    offsets: [0, 0.5, 0.75],
    audible: [true, true, true],
  },
  "dotted-eighth-sixteenth": {
    offsets: [0, 0.75],
    audible: [true, true],
  },
  "sixteenth-dotted-eighth": {
    offsets: [0, 0.25],
    audible: [true, true],
  },
  "sixteenth-eighth-sixteenth": {
    offsets: [0, 0.25, 0.75],
    audible: [true, true, true],
  },
  rest: {
    offsets: [0],
    audible: [false],
  },
};

function getBeatRhythmPattern(rhythm, fallbackSubdivision) {
  const normalizedRhythm = normalizeBeatRhythm(rhythm);
  if (normalizedRhythm === "inherit") {
    const offsets = getSubdivisionOffsets(fallbackSubdivision);
    return {
      rhythm: normalizedRhythm,
      offsets,
      audible: offsets.map(() => true),
    };
  }
  const pattern = BEAT_RHYTHM_PATTERNS[normalizedRhythm] ?? BEAT_RHYTHM_PATTERNS.quarter;
  return {
    rhythm: normalizedRhythm,
    offsets: [...pattern.offsets],
    audible: [...pattern.audible],
  };
}

export function clampInteger(value, min, max) {
  return Math.round(clampNumber(value, min, max));
}

export function normalizeCountInBars(value) {
  return clampInteger(value ?? 0, 0, 8);
}

export function createPatternSegment(segment = {}, fallbackState = {}, index = 0) {
  const safeSegment = segment ?? {};
  const safeFallback = fallbackState ?? {};
  const name = String(safeSegment.name ?? `Pattern ${index + 1}`).trim();

  return {
    id: String(safeSegment.id || `segment-${index + 1}`),
    name: name || `Pattern ${index + 1}`,
    bars: clampInteger(safeSegment.bars ?? 1, 1, 32),
    tempo: clampTempo(safeSegment.tempo ?? safeFallback.tempo ?? 120),
    tempoMode: normalizeTempoMode(
      safeSegment.tempoMode ?? safeFallback.tempoMode
    ),
    meter: normalizeMeter(safeSegment.meter ?? safeFallback.meter),
    subdivision: normalizeSubdivision(
      safeSegment.subdivision ?? safeFallback.subdivision
    ),
  };
}

export function normalizePatternChain(chain = {}, fallbackState = {}) {
  const safeChain = chain ?? {};
  const sourceSegments = Array.isArray(safeChain.segments)
    ? safeChain.segments.slice(0, PATTERN_SEGMENTS_MAX)
    : [];
  const segments =
    sourceSegments.length > 0
      ? sourceSegments.map((segment, index) =>
          createPatternSegment(segment, fallbackState, index)
        )
      : [createPatternSegment({ name: "Pattern 1" }, fallbackState, 0)];

  return {
    enabled: Boolean(safeChain.enabled) && segments.length > 0,
    segments,
  };
}

export function normalizePolyrhythm(polyrhythm = {}) {
  const safePolyrhythm = polyrhythm ?? {};

  return {
    enabled: Boolean(safePolyrhythm.enabled),
    scope: safePolyrhythm.scope === "beat" ? "beat" : "bar",
    pulses: clampInteger(safePolyrhythm.pulses ?? 3, 1, 16),
  };
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
  safeState.patternChain = normalizePatternChain(
    state?.patternChain,
    safeState
  );
  safeState.polyrhythm = normalizePolyrhythm(state?.polyrhythm);
  safeState.trainer = normalizeTrainer(state?.trainer);

  const events = [];
  const totalMainBars = clampInteger(bars, 1, 256);
  const safeBarOffset = clampInteger(barOffset, 0, 1000000);
  const firstBar =
    safeState.countInBars > 0 ? -safeState.countInBars : safeState.countInBars;
  const lastBar = totalMainBars - 1;
  let currentBarStart = startTime;

  for (let barIndex = firstBar; barIndex <= lastBar; barIndex += 1) {
    const isCountIn = barIndex < 0;
    const globalBarIndex = isCountIn ? barIndex : barIndex + safeBarOffset;
    const barConfig = isCountIn
      ? getBaseBarConfig(safeState)
      : getMainBarConfig(safeState, globalBarIndex);
    const beatDuration = getBeatDurationSeconds({
      tempo: barConfig.tempo,
      tempoMode: barConfig.tempoMode,
      beatUnit: barConfig.meter.beatUnit,
    });
    const barDuration = beatDuration * barConfig.meter.beatsPerBar;
    const barStart = currentBarStart;
    const barEndTime = barStart + barDuration;
    const mutedByTrainer = isTrainerMutedBar(
      globalBarIndex,
      safeState.trainer,
      random
    );

    for (const beat of barConfig.meter.beats) {
      const beatPattern = getBeatRhythmPattern(beat.rhythm, barConfig.subdivision);
      const beatRhythm = beatPattern.rhythm;
      const offsets = beatPattern.offsets;
      for (
        let subdivisionIndex = 0;
        subdivisionIndex < offsets.length;
        subdivisionIndex += 1
      ) {
        const offset = offsets[subdivisionIndex];
        const isMain = subdivisionIndex === 0;
        const silentByPattern = beatPattern.audible[subdivisionIndex] === false;
        const rested = beat.level === "rest" || silentByPattern;
        const audible = !rested && !mutedByTrainer;
        events.push({
          time: barStart + beat.index * beatDuration + offset * beatDuration,
          barIndex: globalBarIndex,
          beatIndex: beat.index,
          subdivisionIndex,
          kind: isMain ? "main" : "subdivision",
          level: isMain && silentByPattern ? "rest" : isMain ? beat.level : "subdivision",
          audible,
          beatRhythm,
          isCountIn,
          mutedByTrainer,
          visual: !(mutedByTrainer && safeState.trainer.hideMutedVisuals),
          segmentIndex: barConfig.segmentIndex,
          segmentName: barConfig.segmentName,
          beatsPerBar: barConfig.meter.beatsPerBar,
          beatUnit: barConfig.meter.beatUnit,
          barEndTime,
        });
      }
    }

    if (!isCountIn && safeState.polyrhythm.enabled) {
      events.push(
        ...createPolyrhythmEvents({
          barConfig,
          barStart,
          barEndTime,
          beatDuration,
          barDuration,
          barIndex: globalBarIndex,
          mutedByTrainer,
          polyrhythm: safeState.polyrhythm,
          trainer: safeState.trainer,
        })
      );
    }

    currentBarStart = barEndTime;
  }

  return events.sort((left, right) => {
    const timeOrder = left.time - right.time;
    if (timeOrder !== 0) {
      return timeOrder;
    }
    return eventKindOrder(left.kind) - eventKindOrder(right.kind);
  });
}

function eventKindOrder(kind) {
  if (kind === "main") {
    return 0;
  }
  if (kind === "polyrhythm") {
    return 1;
  }
  return 2;
}

function getBaseBarConfig(state) {
  return {
    tempo: state.tempo,
    tempoMode: state.tempoMode,
    meter: state.meter,
    subdivision: state.subdivision,
    segmentIndex: -1,
    segmentName: "Base",
  };
}

function getMainBarConfig(state, globalBarIndex) {
  if (!state.patternChain.enabled) {
    return getBaseBarConfig(state);
  }

  const segments = state.patternChain.segments;
  const cycleBars = segments.reduce((total, segment) => total + segment.bars, 0);
  let cyclePosition = globalBarIndex % cycleBars;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (cyclePosition < segment.bars) {
      return {
        ...segment,
        segmentIndex: index,
        segmentName: segment.name,
      };
    }
    cyclePosition -= segment.bars;
  }

  return {
    ...segments[0],
    segmentIndex: 0,
    segmentName: segments[0].name,
  };
}

function createPolyrhythmEvents({
  barConfig,
  barStart,
  barEndTime,
  beatDuration,
  barDuration,
  barIndex,
  mutedByTrainer,
  polyrhythm,
  trainer,
}) {
  const events = [];
  const audible = !mutedByTrainer;
  const visual = !(mutedByTrainer && trainer.hideMutedVisuals);

  if (polyrhythm.scope === "beat") {
    for (const beat of barConfig.meter.beats) {
      if (beat.level === "rest") {
        continue;
      }
      for (let pulseIndex = 0; pulseIndex < polyrhythm.pulses; pulseIndex += 1) {
        events.push({
          time:
            barStart +
            beat.index * beatDuration +
            (pulseIndex / polyrhythm.pulses) * beatDuration,
          barIndex,
          beatIndex: beat.index,
          subdivisionIndex: pulseIndex,
          kind: "polyrhythm",
          level: "polyrhythm",
          audible,
          isCountIn: false,
          mutedByTrainer,
          visual,
          segmentIndex: barConfig.segmentIndex,
          segmentName: barConfig.segmentName,
          beatsPerBar: barConfig.meter.beatsPerBar,
          beatUnit: barConfig.meter.beatUnit,
          barEndTime,
        });
      }
    }
    return events;
  }

  for (let pulseIndex = 0; pulseIndex < polyrhythm.pulses; pulseIndex += 1) {
    const time = barStart + (pulseIndex / polyrhythm.pulses) * barDuration;
    events.push({
      time,
      barIndex,
      beatIndex: Math.min(
        barConfig.meter.beatsPerBar - 1,
        Math.floor((time - barStart) / beatDuration)
      ),
      subdivisionIndex: pulseIndex,
      kind: "polyrhythm",
      level: "polyrhythm",
      audible,
      isCountIn: false,
      mutedByTrainer,
      visual,
      segmentIndex: barConfig.segmentIndex,
      segmentName: barConfig.segmentName,
      beatsPerBar: barConfig.meter.beatsPerBar,
      beatUnit: barConfig.meter.beatUnit,
      barEndTime,
    });
  }

  return events;
}

export function getScheduleEndTime(events = [], fallbackStartTime = 0) {
  const safeEvents = Array.isArray(events) ? events : [];
  return safeEvents.reduce((endTime, event) => {
    const eventEnd = Number.isFinite(event?.barEndTime)
      ? event.barEndTime
      : event?.time;
    return Number.isFinite(eventEnd) ? Math.max(endTime, eventEnd) : endTime;
  }, fallbackStartTime);
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
