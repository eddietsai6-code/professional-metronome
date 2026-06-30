import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCENT_LEVELS,
  BEAT_RHYTHMS,
  SUBDIVISION_OPTIONS,
  TEMPO_MAX,
  TEMPO_MIN,
  calculateTapTempo,
  clampTempo,
  createDefaultState,
  createPreset,
  createSchedule,
  getAudibleEventLevel,
  getBeatDurationSeconds,
  getScheduleEndTime,
  getSubdivisionOffsets,
  getVoiceCountToken,
  getVisualBeatState,
  isTrainerMutedBar,
  normalizeMeter,
  normalizePatternChain,
  normalizePolyrhythm,
  normalizeTrainer,
  resizeBeats,
  validatePreset,
} from "../assets/metronome-core.js";

test("createDefaultState returns a playable 4/4 BPM setup", () => {
  const state = createDefaultState();

  assert.equal(state.tempo, 120);
  assert.equal(state.tempoMode, "BPM");
  assert.equal(state.meter.beatsPerBar, 4);
  assert.equal(state.meter.beatUnit, 4);
  assert.deepEqual(
    state.meter.beats.map((beat) => beat.level),
    ["accent", "normal", "normal", "normal"]
  );
});

test("clampTempo keeps tempo inside the supported range", () => {
  assert.equal(clampTempo(10), TEMPO_MIN);
  assert.equal(clampTempo(300), TEMPO_MAX);
  assert.equal(clampTempo(137.6), 138);
});

test("getBeatDurationSeconds supports BPM and QPM modes", () => {
  assert.equal(
    getBeatDurationSeconds({ tempo: 120, tempoMode: "BPM", beatUnit: 8 }),
    0.5
  );
  assert.equal(
    getBeatDurationSeconds({ tempo: 120, tempoMode: "QPM", beatUnit: 8 }),
    0.25
  );
  assert.equal(
    getBeatDurationSeconds({ tempo: 120, tempoMode: "QPM", beatUnit: 2 }),
    1
  );
});

test("normalizeMeter clamps beat count and creates safe accent defaults", () => {
  const low = normalizeMeter({ beatsPerBar: 0, beatUnit: 64, beats: [] });
  const high = normalizeMeter({ beatsPerBar: 20, beatUnit: 3, beats: [] });

  assert.equal(low.beatsPerBar, 1);
  assert.equal(low.beatUnit, 32);
  assert.deepEqual(low.beats.map((beat) => beat.level), ["accent"]);

  assert.equal(high.beatsPerBar, 16);
  assert.equal(high.beatUnit, 4);
  assert.equal(high.beats.length, 16);
  assert.equal(high.beats[0].level, "accent");
  assert.equal(high.beats[1].level, "normal");
});

test("resizeBeats preserves known levels and defaults new beats safely", () => {
  const resized = resizeBeats(
    [
      { index: 0, level: "accent" },
      { index: 1, level: "secondary" },
      { index: 2, level: "rest" },
    ],
    5
  );

  assert.deepEqual(
    resized.map((beat) => beat.level),
    ["accent", "secondary", "rest", "normal", "normal"]
  );
  assert.deepEqual(ACCENT_LEVELS, ["accent", "secondary", "normal", "rest"]);
});

test("normalizeMeter accepts null meter input", () => {
  const meter = normalizeMeter(null);

  assert.equal(meter.beatsPerBar, 4);
  assert.equal(meter.beatUnit, 4);
  assert.deepEqual(
    meter.beats.map((beat) => beat.level),
    ["accent", "normal", "normal", "normal"]
  );
});

test("resizeBeats treats null and non-array beat inputs as empty", () => {
  const nullBeats = resizeBeats(null, 4);
  const objectBeats = resizeBeats({ 0: { level: "rest" } }, 2);

  assert.deepEqual(
    nullBeats.map((beat) => beat.level),
    ["accent", "normal", "normal", "normal"]
  );
  assert.deepEqual(
    objectBeats.map((beat) => beat.level),
    ["accent", "normal"]
  );
});

test("createDefaultState accepts null overrides and null meter input", () => {
  const nullOverrides = createDefaultState(null);
  const nullMeter = createDefaultState({ meter: null });

  assert.equal(nullOverrides.tempo, 120);
  assert.deepEqual(
    nullOverrides.meter.beats.map((beat) => beat.level),
    ["accent", "normal", "normal", "normal"]
  );
  assert.deepEqual(
    nullMeter.meter.beats.map((beat) => beat.level),
    ["accent", "normal", "normal", "normal"]
  );
});

test("normalizeTrainer accepts null trainer input", () => {
  assert.deepEqual(normalizeTrainer(null), {
    enabled: false,
    mode: "fixed",
    playBars: 3,
    muteBars: 1,
    randomMutePercent: 15,
    hideMutedVisuals: false,
  });
});

test("createDefaultState accepts null trainer input", () => {
  const state = createDefaultState({ trainer: null });

  assert.deepEqual(state.trainer, {
    enabled: false,
    mode: "fixed",
    playBars: 3,
    muteBars: 1,
    randomMutePercent: 15,
    hideMutedVisuals: false,
  });
});

test("getSubdivisionOffsets returns stable musical offsets", () => {
  assert.deepEqual(getSubdivisionOffsets("none"), [0]);
  assert.deepEqual(getSubdivisionOffsets("eighth"), [0, 0.5]);
  assert.deepEqual(getSubdivisionOffsets("triplet"), [0, 1 / 3, 2 / 3]);
  assert.deepEqual(getSubdivisionOffsets("sixteenth"), [0, 0.25, 0.5, 0.75]);
  assert.deepEqual(getSubdivisionOffsets("dotted"), [0, 0.75]);
});

test("expanded subdivisions include common professional rhythm choices", () => {
  assert.deepEqual(
    SUBDIVISION_OPTIONS.map((option) => option.value),
    [
      "none",
      "eighth",
      "triplet",
      "sixteenth",
      "quintuplet",
      "sextuplet",
      "septuplet",
      "thirtysecond",
      "dotted",
      "shuffle",
      "swung-sixteenth",
    ]
  );
  assert.deepEqual(getSubdivisionOffsets("quintuplet"), [0, 0.2, 0.4, 0.6, 0.8]);
  assert.deepEqual(getSubdivisionOffsets("sextuplet"), [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]);
  assert.deepEqual(getSubdivisionOffsets("septuplet"), [0, 1 / 7, 2 / 7, 3 / 7, 4 / 7, 5 / 7, 6 / 7]);
  assert.equal(getSubdivisionOffsets("thirtysecond").length, 8);
  assert.deepEqual(getSubdivisionOffsets("shuffle"), [0, 2 / 3]);
  assert.deepEqual(getSubdivisionOffsets("swung-sixteenth"), [0, 1 / 3, 0.5, 5 / 6]);
});

test("normalizePatternChain sanitizes independent segment settings", () => {
  const chain = normalizePatternChain(
    {
      enabled: true,
      segments: [
        {
          name: "  A section  ",
          bars: 2,
          tempo: 144,
          tempoMode: "QPM",
          meter: {
            beatsPerBar: 7,
            beatUnit: 8,
            beats: [{ level: "accent" }, { level: "secondary" }],
          },
          subdivision: "quintuplet",
        },
      ],
    },
    createDefaultState()
  );

  assert.equal(chain.enabled, true);
  assert.equal(chain.segments.length, 1);
  assert.equal(chain.segments[0].name, "A section");
  assert.equal(chain.segments[0].bars, 2);
  assert.equal(chain.segments[0].tempo, 144);
  assert.equal(chain.segments[0].tempoMode, "QPM");
  assert.equal(chain.segments[0].meter.beatsPerBar, 7);
  assert.equal(chain.segments[0].meter.beatUnit, 8);
  assert.equal(chain.segments[0].subdivision, "quintuplet");
  assert.deepEqual(
    chain.segments[0].meter.beats.map((beat) => beat.level).slice(0, 3),
    ["accent", "secondary", "normal"]
  );
});

test("normalizePolyrhythm keeps overlay pulses inside playable bounds", () => {
  assert.deepEqual(normalizePolyrhythm(null), {
    enabled: false,
    scope: "bar",
    pulses: 3,
  });
  assert.deepEqual(normalizePolyrhythm({ enabled: true, scope: "beat", pulses: 99 }), {
    enabled: true,
    scope: "beat",
    pulses: 16,
  });
});

test("createSchedule creates main beat events for one bar", () => {
  const state = createDefaultState();
  const events = createSchedule({ state, bars: 1, startTime: 10 });

  assert.equal(events.length, 4);
  assert.deepEqual(
    events.map((event) => ({
      time: event.time,
      barIndex: event.barIndex,
      beatIndex: event.beatIndex,
      level: event.level,
      kind: event.kind,
      audible: event.audible,
    })),
    [
      { time: 10, barIndex: 0, beatIndex: 0, level: "accent", kind: "main", audible: true },
      { time: 10.5, barIndex: 0, beatIndex: 1, level: "normal", kind: "main", audible: true },
      { time: 11, barIndex: 0, beatIndex: 2, level: "normal", kind: "main", audible: true },
      { time: 11.5, barIndex: 0, beatIndex: 3, level: "normal", kind: "main", audible: true },
    ]
  );
});

test("createSchedule accepts omitted options", () => {
  const events = createSchedule();

  assert.equal(events.length, 4);
  assert.equal(events[0].barIndex, 0);
  assert.equal(events[0].beatIndex, 0);
  assert.equal(events[0].audible, true);
});

test("createSchedule places subdivisions inside each beat", () => {
  const state = createDefaultState({ subdivision: "triplet" });
  const events = createSchedule({ state, bars: 1, startTime: 0 });

  assert.equal(events.length, 12);
  assert.deepEqual(
    events.slice(0, 3).map((event) => [event.kind, Number(event.time.toFixed(6))]),
    [
      ["main", 0],
      ["subdivision", 0.166667],
      ["subdivision", 0.333333],
    ]
  );
});

test("createSchedule lets each beat override its rhythm pattern", () => {
  const state = createDefaultState({
    meter: {
      beatsPerBar: 4,
      beatUnit: 4,
      beats: [
        { index: 0, level: "accent", rhythm: "quarter" },
        { index: 1, level: "normal", rhythm: "eighth" },
        { index: 2, level: "normal", rhythm: "triplet" },
        { index: 3, level: "normal", rhythm: "rest" },
      ],
    },
    subdivision: "none",
  });

  const events = createSchedule({ state, bars: 1, startTime: 0 });

  assert.deepEqual(
    events.map((event) => ({
      time: Number(event.time.toFixed(6)),
      beatIndex: event.beatIndex,
      subdivisionIndex: event.subdivisionIndex,
      kind: event.kind,
      audible: event.audible,
    })),
    [
      { time: 0, beatIndex: 0, subdivisionIndex: 0, kind: "main", audible: true },
      { time: 0.5, beatIndex: 1, subdivisionIndex: 0, kind: "main", audible: true },
      { time: 0.75, beatIndex: 1, subdivisionIndex: 1, kind: "subdivision", audible: true },
      { time: 1, beatIndex: 2, subdivisionIndex: 0, kind: "main", audible: true },
      { time: 1.166667, beatIndex: 2, subdivisionIndex: 1, kind: "subdivision", audible: true },
      { time: 1.333333, beatIndex: 2, subdivisionIndex: 2, kind: "subdivision", audible: true },
      { time: 1.5, beatIndex: 3, subdivisionIndex: 0, kind: "main", audible: false },
    ]
  );
});

test("beat rhythm library includes the reference rhythm choices", () => {
  assert.deepEqual(BEAT_RHYTHMS, [
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
  ]);
});

test("createSchedule supports reference rhythm rests and sixteenth combinations", () => {
  const state = createDefaultState({
    meter: {
      beatsPerBar: 4,
      beatUnit: 4,
      beats: [
        { index: 0, level: "accent", rhythm: "eighth-rest-note" },
        { index: 1, level: "normal", rhythm: "triplet-note-rest-note" },
        { index: 2, level: "normal", rhythm: "sixteenth-rest-note-rest-note" },
        { index: 3, level: "normal", rhythm: "sixteenth-eighth-sixteenth" },
      ],
    },
    subdivision: "none",
  });

  const events = createSchedule({ state, bars: 1, startTime: 0 });

  assert.deepEqual(
    events.map((event) => ({
      time: Number(event.time.toFixed(6)),
      beatIndex: event.beatIndex,
      subdivisionIndex: event.subdivisionIndex,
      audible: event.audible,
    })),
    [
      { time: 0, beatIndex: 0, subdivisionIndex: 0, audible: false },
      { time: 0.25, beatIndex: 0, subdivisionIndex: 1, audible: true },
      { time: 0.5, beatIndex: 1, subdivisionIndex: 0, audible: true },
      { time: 0.666667, beatIndex: 1, subdivisionIndex: 1, audible: false },
      { time: 0.833333, beatIndex: 1, subdivisionIndex: 2, audible: true },
      { time: 1, beatIndex: 2, subdivisionIndex: 0, audible: false },
      { time: 1.125, beatIndex: 2, subdivisionIndex: 1, audible: true },
      { time: 1.25, beatIndex: 2, subdivisionIndex: 2, audible: false },
      { time: 1.375, beatIndex: 2, subdivisionIndex: 3, audible: true },
      { time: 1.5, beatIndex: 3, subdivisionIndex: 0, audible: true },
      { time: 1.625, beatIndex: 3, subdivisionIndex: 1, audible: true },
      { time: 1.875, beatIndex: 3, subdivisionIndex: 2, audible: true },
    ]
  );
});

test("getVoiceCountToken follows English count syllables for reference rhythms", () => {
  const state = createDefaultState({
    meter: {
      beatsPerBar: 4,
      beatUnit: 4,
      beats: [
        { index: 0, level: "accent", rhythm: "sixteenth" },
        { index: 1, level: "normal", rhythm: "eighth-rest-note" },
        { index: 2, level: "normal", rhythm: "triplet-note-rest-note" },
        { index: 3, level: "normal", rhythm: "dotted-eighth-sixteenth" },
      ],
    },
    subdivision: "none",
  });

  const events = createSchedule({ state, bars: 1, startTime: 0 });

  assert.deepEqual(events.map(getVoiceCountToken), [
    "1",
    "e",
    "&",
    "a",
    null,
    "&",
    "3",
    null,
    "let",
    "4",
    "a",
  ]);
});

test("getVoiceCountToken counts inherited global subdivisions", () => {
  const state = createDefaultState({
    meter: {
      beatsPerBar: 1,
      beatUnit: 4,
      beats: [{ index: 0, level: "accent", rhythm: "inherit" }],
    },
    subdivision: "triplet",
  });

  const events = createSchedule({ state, bars: 1, startTime: 0 });

  assert.deepEqual(events.map(getVoiceCountToken), ["1", "trip", "let"]);
});

test("createSchedule cycles pattern chain segments with independent meters", () => {
  const state = createDefaultState({
    patternChain: {
      enabled: true,
      segments: [
        {
          name: "Four",
          bars: 2,
          tempo: 120,
          tempoMode: "BPM",
          meter: { beatsPerBar: 4, beatUnit: 4 },
          subdivision: "none",
        },
        {
          name: "Seven",
          bars: 1,
          tempo: 120,
          tempoMode: "BPM",
          meter: { beatsPerBar: 7, beatUnit: 8 },
          subdivision: "none",
        },
      ],
    },
  });
  const events = createSchedule({ state, bars: 3, startTime: 0 });
  const mainEvents = events.filter((event) => event.kind === "main");

  assert.equal(mainEvents.length, 15);
  assert.deepEqual(
    mainEvents.map((event) => ({
      barIndex: event.barIndex,
      beatIndex: event.beatIndex,
      segmentName: event.segmentName,
      segmentIndex: event.segmentIndex,
      time: Number(event.time.toFixed(6)),
      beatsPerBar: event.beatsPerBar,
      beatUnit: event.beatUnit,
    })),
    [
      { barIndex: 0, beatIndex: 0, segmentName: "Four", segmentIndex: 0, time: 0, beatsPerBar: 4, beatUnit: 4 },
      { barIndex: 0, beatIndex: 1, segmentName: "Four", segmentIndex: 0, time: 0.5, beatsPerBar: 4, beatUnit: 4 },
      { barIndex: 0, beatIndex: 2, segmentName: "Four", segmentIndex: 0, time: 1, beatsPerBar: 4, beatUnit: 4 },
      { barIndex: 0, beatIndex: 3, segmentName: "Four", segmentIndex: 0, time: 1.5, beatsPerBar: 4, beatUnit: 4 },
      { barIndex: 1, beatIndex: 0, segmentName: "Four", segmentIndex: 0, time: 2, beatsPerBar: 4, beatUnit: 4 },
      { barIndex: 1, beatIndex: 1, segmentName: "Four", segmentIndex: 0, time: 2.5, beatsPerBar: 4, beatUnit: 4 },
      { barIndex: 1, beatIndex: 2, segmentName: "Four", segmentIndex: 0, time: 3, beatsPerBar: 4, beatUnit: 4 },
      { barIndex: 1, beatIndex: 3, segmentName: "Four", segmentIndex: 0, time: 3.5, beatsPerBar: 4, beatUnit: 4 },
      { barIndex: 2, beatIndex: 0, segmentName: "Seven", segmentIndex: 1, time: 4, beatsPerBar: 7, beatUnit: 8 },
      { barIndex: 2, beatIndex: 1, segmentName: "Seven", segmentIndex: 1, time: 4.5, beatsPerBar: 7, beatUnit: 8 },
      { barIndex: 2, beatIndex: 2, segmentName: "Seven", segmentIndex: 1, time: 5, beatsPerBar: 7, beatUnit: 8 },
      { barIndex: 2, beatIndex: 3, segmentName: "Seven", segmentIndex: 1, time: 5.5, beatsPerBar: 7, beatUnit: 8 },
      { barIndex: 2, beatIndex: 4, segmentName: "Seven", segmentIndex: 1, time: 6, beatsPerBar: 7, beatUnit: 8 },
      { barIndex: 2, beatIndex: 5, segmentName: "Seven", segmentIndex: 1, time: 6.5, beatsPerBar: 7, beatUnit: 8 },
      { barIndex: 2, beatIndex: 6, segmentName: "Seven", segmentIndex: 1, time: 7, beatsPerBar: 7, beatUnit: 8 },
    ]
  );
  assert.equal(getScheduleEndTime(events, 0), 7.5);
});

test("createSchedule adds bar-scoped polyrhythm overlay events", () => {
  const state = createDefaultState({
    polyrhythm: { enabled: true, scope: "bar", pulses: 3 },
  });
  const events = createSchedule({ state, bars: 1, startTime: 0 });
  const polyEvents = events.filter((event) => event.kind === "polyrhythm");

  assert.equal(polyEvents.length, 3);
  assert.deepEqual(
    polyEvents.map((event) => Number(event.time.toFixed(6))),
    [0, 0.666667, 1.333333]
  );
  assert.deepEqual(
    polyEvents.map((event) => event.level),
    ["polyrhythm", "polyrhythm", "polyrhythm"]
  );
});

test("createSchedule adds beat-scoped polyrhythm overlay events", () => {
  const state = createDefaultState({
    meter: { beatsPerBar: 2, beatUnit: 4 },
    polyrhythm: { enabled: true, scope: "beat", pulses: 3 },
  });
  const events = createSchedule({ state, bars: 1, startTime: 0 });
  const polyEvents = events.filter((event) => event.kind === "polyrhythm");

  assert.equal(polyEvents.length, 6);
  assert.deepEqual(
    polyEvents.map((event) => [event.beatIndex, Number(event.time.toFixed(6))]),
    [
      [0, 0],
      [0, 0.166667],
      [0, 0.333333],
      [1, 0.5],
      [1, 0.666667],
      [1, 0.833333],
    ]
  );
});

test("rest beats mute main and subdivision clicks for that beat", () => {
  const state = createDefaultState({
    subdivision: "eighth",
    meter: {
      beatsPerBar: 2,
      beatUnit: 4,
      beats: [
        { index: 0, level: "accent" },
        { index: 1, level: "rest" },
      ],
    },
  });
  const events = createSchedule({ state, bars: 1, startTime: 0 });

  assert.deepEqual(
    events.map((event) => event.audible),
    [true, true, false, false]
  );
});

test("count-in bars precede the main loop without using trainer muting", () => {
  const state = { ...createDefaultState(), countInBars: 1 };
  const events = createSchedule({ state, bars: 1, startTime: 0 });

  assert.equal(events.length, 8);
  assert.equal(events[0].isCountIn, true);
  assert.equal(events[0].barIndex, -1);
  assert.equal(events[4].isCountIn, false);
  assert.equal(events[4].barIndex, 0);
});

test("isTrainerMutedBar supports fixed and random trainer modes", () => {
  const fixed = {
    enabled: true,
    mode: "fixed",
    playBars: 2,
    muteBars: 1,
    randomMutePercent: 0,
    hideMutedVisuals: false,
  };
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((bar) => isTrainerMutedBar(bar, fixed, () => 0.99)),
    [false, false, true, false, false, true]
  );

  const random = { ...fixed, mode: "random", randomMutePercent: 25 };
  assert.equal(isTrainerMutedBar(0, random, () => 0.1), true);
  assert.equal(isTrainerMutedBar(0, random, () => 0.3), false);
});

test("createSchedule keeps fixed trainer cycles aligned with bar offsets", () => {
  const state = createDefaultState({
    meter: { beatsPerBar: 1 },
    trainer: { enabled: true, mode: "fixed", playBars: 2, muteBars: 1 },
  });
  const events = createSchedule({
    state,
    bars: 4,
    startTime: 0,
    barOffset: 64,
  });

  assert.deepEqual(
    events.map((event) => ({
      barIndex: event.barIndex,
      audible: event.audible,
    })),
    [
      { barIndex: 64, audible: true },
      { barIndex: 65, audible: false },
      { barIndex: 66, audible: true },
      { barIndex: 67, audible: true },
    ]
  );
});

test("calculateTapTempo averages recent tap intervals", () => {
  assert.equal(calculateTapTempo([0, 500, 1000, 1500]), 120);
  assert.equal(calculateTapTempo([0, 600, 1200, 1800]), 100);
  assert.equal(calculateTapTempo([0]), null);
  assert.equal(calculateTapTempo([0, 3000]), null);
});

test("calculateTapTempo ignores invalid timestamps and clamps BPM", () => {
  assert.equal(calculateTapTempo([0, Number.NaN, 250]), 240);
  assert.equal(calculateTapTempo([0, 500, 1000, 1250], { sampleLimit: 3 }), 160);
  assert.equal(calculateTapTempo([1000, 1000]), null);
  assert.equal(calculateTapTempo([0, 100], { maxGapMs: 50 }), null);
  assert.equal(calculateTapTempo([0, 50]), TEMPO_MAX);
});

test("calculateTapTempo treats null options like omitted options", () => {
  assert.equal(calculateTapTempo([0, 500], null), 120);
});

test("createPreset and validatePreset preserve playable settings", () => {
  const state = createDefaultState({
    tempo: 144,
    subdivision: "sixteenth",
    countInBars: 2,
    trainer: { enabled: true, mode: "fixed", playBars: 2, muteBars: 2 },
  });
  const preset = createPreset("Warm Up", state);
  const validated = validatePreset(preset);

  assert.equal(validated.name, "Warm Up");
  assert.equal(validated.state.tempo, 144);
  assert.equal(validated.state.subdivision, "sixteenth");
  assert.equal(validated.state.countInBars, 2);
  assert.equal(validated.state.trainer.enabled, true);
});

test("createPreset falls back to a usable name and normalized state", () => {
  const preset = createPreset("   ", { tempo: 999, meter: null });

  assert.match(preset.id, /^preset-/);
  assert.equal(preset.name, "Preset");
  assert.equal(preset.state.tempo, TEMPO_MAX);
  assert.equal(preset.state.meter.beatsPerBar, 4);
  assert.doesNotThrow(() => new Date(preset.createdAt).toISOString());
});

test("preset fallback ids do not collide within the same millisecond", () => {
  const originalDateNow = Date.now;
  Date.now = () => 1234567890;
  try {
    const firstPreset = createPreset("A", {});
    const secondPreset = createPreset("B", {});
    const firstValidated = validatePreset({ name: "A", state: {} });
    const secondValidated = validatePreset({ name: "B", state: {} });

    assert.notEqual(firstPreset.id, secondPreset.id);
    assert.notEqual(firstValidated.id, secondValidated.id);
  } finally {
    Date.now = originalDateNow;
  }
});

test("validatePreset rejects invalid preset payloads", () => {
  assert.equal(validatePreset(null), null);
  assert.equal(validatePreset({ name: "", state: null }), null);
  assert.equal(validatePreset({ name: "Bad", state: { tempo: 999 } }).state.tempo, TEMPO_MAX);
});

test("validatePreset sanitizes persisted metadata", () => {
  const validated = validatePreset({
    id: 42,
    name: "  Saved  ",
    state: { tempo: 10 },
    createdAt: 123,
  });

  assert.equal(validated.id, "42");
  assert.equal(validated.name, "Saved");
  assert.equal(validated.state.tempo, TEMPO_MIN);
  assert.equal(validated.createdAt, "123");
});

test("getVisualBeatState respects visual modes and trainer visual muting", () => {
  const event = {
    beatIndex: 1,
    level: "normal",
    kind: "main",
    visual: true,
  };
  assert.equal(getVisualBeatState(event, "all"), "active");
  assert.equal(getVisualBeatState(event, "accent"), "idle");
  assert.equal(getVisualBeatState({ ...event, level: "secondary" }, "accent-secondary"), "active");
  assert.equal(getVisualBeatState({ ...event, visual: false }, "all"), "hidden");
  assert.equal(getVisualBeatState(event, "pendulum"), "pendulum");
});

test("getVisualBeatState defaults to active for unknown visual modes", () => {
  assert.equal(getVisualBeatState({ level: "normal", visual: true }), "active");
  assert.equal(getVisualBeatState(null, "all"), "hidden");
});

test("getAudibleEventLevel returns silent for muted or visual-only events", () => {
  assert.equal(getAudibleEventLevel({ audible: false, level: "accent" }, false), "silent");
  assert.equal(getAudibleEventLevel({ audible: true, level: "accent" }, true), "silent");
  assert.equal(getAudibleEventLevel({ audible: true, level: "subdivision" }, false), "subdivision");
});
