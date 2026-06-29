import {
  ACCENT_LEVELS,
  APP_VERSION,
  PATTERN_SEGMENTS_MAX,
  SUBDIVISION_OPTIONS,
  calculateTapTempo,
  createPatternSegment,
  createDefaultState,
  createPreset,
  createSchedule,
  getAudibleEventLevel,
  getBeatDurationSeconds,
  getScheduleEndTime,
  normalizeMeter,
  validatePreset,
} from "./metronome-core.js";

const PRESET_STORAGE_KEY = "professional-metronome.presets";
const TAP_SAMPLE_LIMIT = 6;
const LOOKAHEAD_SECONDS = 0.1;
const SCHEDULER_INTERVAL_MS = 25;
const SCHEDULE_BARS = 64;

const NOTE_LIBRARY = [
  { id: "whole", name: "Whole", symbol: "𝅝", valueLabel: "1", beats: 4, rest: false },
  { id: "half", name: "Half", symbol: "𝅗𝅥", valueLabel: "1/2", beats: 2, rest: false },
  { id: "quarter", name: "Quarter", symbol: "♩", valueLabel: "1/4", beats: 1, rest: false },
  { id: "eighth", name: "Eighth", symbol: "♪", valueLabel: "1/8", beats: 0.5, rest: false },
  { id: "sixteenth", name: "Sixteenth", symbol: "♬", valueLabel: "1/16", beats: 0.25, rest: false },
  { id: "dotted-quarter", name: "Dotted quarter", symbol: "♩.", valueLabel: "1/4.", beats: 1.5, rest: false },
  { id: "triplet-eighth", name: "Triplet eighth", symbol: "♪3", valueLabel: "1/8T", beats: 1 / 3, rest: false },
  { id: "quarter-rest", name: "Quarter rest", symbol: "𝄽", valueLabel: "rest", beats: 1, rest: true },
];
document.documentElement.dataset.appVersion = APP_VERSION;

const elements = {
  beatGrid: document.querySelector("#beatGrid"),
  countInBars: document.querySelector("#countInBars"),
  meterBeats: document.querySelector("#meterBeats"),
  meterReadout: document.querySelector("#meterReadout"),
  meterUnit: document.querySelector("#meterUnit"),
  muteToggle: document.querySelector("#muteToggle"),
  pendulum: document.querySelector("#pendulum"),
  patternEnabled: document.querySelector("#patternEnabled"),
  patternSegments: document.querySelector("#patternSegments"),
  addPatternSegment: document.querySelector("#addPatternSegment"),
  clearNoteChain: document.querySelector("#clearNoteChain"),
  noteChain: document.querySelector("#noteChain"),
  noteLibrary: document.querySelector("#noteLibrary"),
  playToggle: document.querySelector("#playToggle"),
  polyrhythmEnabled: document.querySelector("#polyrhythmEnabled"),
  polyrhythmPulses: document.querySelector("#polyrhythmPulses"),
  polyrhythmScope: document.querySelector("#polyrhythmScope"),
  presetList: document.querySelector("#presetList"),
  presetName: document.querySelector("#presetName"),
  savePreset: document.querySelector("#savePreset"),
  soundStyle: document.querySelector("#soundStyle"),
  statusText: document.querySelector("#statusText"),
  subdivisionReadout: document.querySelector("#subdivisionReadout"),
  subdivisionSelect: document.querySelector("#subdivisionSelect"),
  tapTempo: document.querySelector("#tapTempo"),
  tempoDown: document.querySelector("#tempoDown"),
  tempoInput: document.querySelector("#tempoInput"),
  tempoMode: document.querySelector("#tempoMode"),
  tempoModeLabel: document.querySelector("#tempoModeLabel"),
  tempoReadout: document.querySelector("#tempoReadout"),
  tempoUp: document.querySelector("#tempoUp"),
  timerMinutes: document.querySelector("#timerMinutes"),
  timerToggle: document.querySelector("#timerToggle"),
  trainerEnabled: document.querySelector("#trainerEnabled"),
  trainerHideVisuals: document.querySelector("#trainerHideVisuals"),
  trainerMuteBars: document.querySelector("#trainerMuteBars"),
  trainerPlayBars: document.querySelector("#trainerPlayBars"),
  trainerRandomPercent: document.querySelector("#trainerRandomPercent"),
  visualMode: document.querySelector("#visualMode"),
  volumeControl: document.querySelector("#volumeControl"),
};

const app = {
  activeBeatIndex: -1,
  activeSegmentIndex: -1,
  audioContext: null,
  masterGain: null,
  nextBarIndex: 0,
  nextScheduleTime: 0,
  playing: false,
  presets: [],
  rafId: null,
  schedule: [],
  scheduledIndex: 0,
  scheduledNodes: new Set(),
  schedulerTimer: null,
  noteChain: [],
  state: createDefaultState(),
  startedAt: 0,
  tapTimes: [],
  timerId: null,
  timerRemainingSeconds: 0,
};

function setStatus(message) {
  elements.statusText.textContent = message;
}

function getSubdivisionLabel(value) {
  return (
    SUBDIVISION_OPTIONS.find((option) => option.value === value)?.label ||
    "Quarter"
  );
}

function getSelectedSubdivisionLabel() {
  return getSubdivisionLabel(elements.subdivisionSelect.value);
}

function getNoteById(id) {
  return NOTE_LIBRARY.find((note) => note.id === id) || NOTE_LIBRARY[2];
}

function createNoteText(className, text) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

function renderNoteLibrary() {
  elements.noteLibrary.replaceChildren();

  for (const note of NOTE_LIBRARY) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-card";
    button.setAttribute("data-note-id", note.id);
    button.setAttribute("role", "option");
    button.setAttribute("aria-label", `Add ${note.name}`);
    button.append(
      createNoteText("note-symbol", note.symbol),
      createNoteText("note-name", note.name),
      createNoteText("note-value", note.valueLabel)
    );
    button.addEventListener("click", () => addNoteToChain(note.id));
    elements.noteLibrary.append(button);
  }
}

function renderNoteChain() {
  elements.noteChain.replaceChildren();

  if (app.noteChain.length === 0) {
    const empty = document.createElement("span");
    empty.className = "note-chain-empty";
    empty.textContent = "Tap notes to build a chain";
    elements.noteChain.append(empty);
    return;
  }

  app.noteChain.forEach((item, index) => {
    const note = getNoteById(item.noteId);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "note-chip";
    chip.classList.toggle("is-rest", note.rest);
    chip.textContent = note.symbol;
    chip.setAttribute("aria-label", `Remove ${note.name}`);
    chip.addEventListener("click", () => {
      removeNoteFromChain(index);
    });
    elements.noteChain.append(chip);
  });
}

function addNoteToChain(noteId) {
  const note = getNoteById(noteId);
  app.noteChain = [...app.noteChain, { noteId: note.id }];
  refreshPlaybackSchedule();
  render();
  setStatus(`Added ${note.name}`);
}

function removeNoteFromChain(index) {
  const note = getNoteById(app.noteChain[index]?.noteId);
  app.noteChain = app.noteChain.filter((_, itemIndex) => itemIndex !== index);
  refreshPlaybackSchedule();
  render();
  setStatus(`Removed ${note.name}`);
}

function clearNoteChain() {
  app.noteChain = [];
  refreshPlaybackSchedule();
  render();
  setStatus("Chain cleared");
}

function readStateFromControls() {
  const previousMeter = app.state?.meter ?? createDefaultState().meter;
  const meter = normalizeMeter({
    beatsPerBar: elements.meterBeats.value,
    beatUnit: elements.meterUnit.value,
    beats: previousMeter.beats,
  });

  return createDefaultState({
    ...app.state,
    tempo: elements.tempoInput.value,
    tempoMode: elements.tempoMode.value,
    meter,
    subdivision: elements.subdivisionSelect.value,
    countInBars: elements.countInBars.value,
    volume: elements.volumeControl.value,
    muted: app.state.muted,
    soundStyle: elements.soundStyle.value,
    visualMode: elements.visualMode.value,
    patternChain: {
      ...app.state.patternChain,
      enabled: elements.patternEnabled.checked,
    },
    polyrhythm: {
      enabled: elements.polyrhythmEnabled.checked,
      scope: elements.polyrhythmScope.value,
      pulses: elements.polyrhythmPulses.value,
    },
    trainer: {
      enabled: elements.trainerEnabled.checked,
      mode: Number(elements.trainerRandomPercent.value) > 0 ? "random" : "fixed",
      playBars: elements.trainerPlayBars.value,
      muteBars: elements.trainerMuteBars.value,
      randomMutePercent: elements.trainerRandomPercent.value,
      hideMutedVisuals: elements.trainerHideVisuals.checked,
    },
    timer: {
      ...app.state.timer,
      minutes: elements.timerMinutes.value,
    },
  });
}

function syncControlsFromState() {
  const { state } = app;
  elements.tempoInput.value = state.tempo;
  elements.tempoMode.value = state.tempoMode;
  elements.meterBeats.value = state.meter.beatsPerBar;
  elements.meterUnit.value = state.meter.beatUnit;
  elements.subdivisionSelect.value = state.subdivision;
  elements.visualMode.value = state.visualMode;
  elements.soundStyle.value = state.soundStyle;
  elements.volumeControl.value = state.volume;
  elements.countInBars.value = state.countInBars;
  elements.patternEnabled.checked = state.patternChain.enabled;
  elements.polyrhythmEnabled.checked = state.polyrhythm.enabled;
  elements.polyrhythmScope.value = state.polyrhythm.scope;
  elements.polyrhythmPulses.value = state.polyrhythm.pulses;
  elements.trainerEnabled.checked = state.trainer.enabled;
  elements.trainerPlayBars.value = state.trainer.playBars;
  elements.trainerMuteBars.value = state.trainer.muteBars;
  elements.trainerRandomPercent.value = state.trainer.randomMutePercent;
  elements.trainerHideVisuals.checked = state.trainer.hideMutedVisuals;
  elements.timerMinutes.value = state.timer.minutes;
}

function cycleAccentLevel(level) {
  const currentIndex = ACCENT_LEVELS.indexOf(level);
  const nextIndex = (currentIndex + 1) % ACCENT_LEVELS.length;
  return ACCENT_LEVELS[nextIndex] ?? "normal";
}

function getDisplaySegment() {
  if (!app.state.patternChain.enabled) {
    return null;
  }
  return (
    app.state.patternChain.segments[app.activeSegmentIndex] ||
    app.state.patternChain.segments[0] ||
    null
  );
}

function getEditableSegmentIndex() {
  if (!app.state.patternChain.enabled) {
    return -1;
  }
  return app.activeSegmentIndex >= 0 ? app.activeSegmentIndex : 0;
}

function getDisplayMeter() {
  const segment = getDisplaySegment();
  if (segment) {
    return segment.meter;
  }
  if (app.state.patternChain.enabled) {
    return app.state.patternChain.segments[0]?.meter ?? app.state.meter;
  }
  return app.state.meter;
}

function renderBeatGrid() {
  const beats = getDisplayMeter().beats;
  elements.beatGrid.style.setProperty("--beat-count", beats.length);

  for (let index = elements.beatGrid.children.length; index < beats.length; index += 1) {
    const button = document.createElement("button");
    button.className = "beat";
    button.type = "button";
    button.addEventListener("click", () => {
      const segmentIndex = getEditableSegmentIndex();
      const meter = segmentIndex >= 0
        ? app.state.patternChain.segments[segmentIndex].meter
        : app.state.meter;
      const beat = meter.beats[index];
      const nextBeats = meter.beats.map((item, beatIndex) =>
        beatIndex === index
          ? { ...item, level: cycleAccentLevel(beat.level) }
          : item
      );

      if (segmentIndex >= 0) {
        const segments = app.state.patternChain.segments.map((segment, itemIndex) =>
          itemIndex === segmentIndex
            ? {
                ...segment,
                meter: { ...segment.meter, beats: nextBeats },
              }
            : segment
        );
        app.state = createDefaultState({
          ...app.state,
          patternChain: { ...app.state.patternChain, segments },
        });
        renderPatternSegments();
      } else {
        app.state = createDefaultState({
          ...app.state,
          meter: { ...app.state.meter, beats: nextBeats },
        });
      }
      refreshPlaybackSchedule();
      render();
      setStatus(`Beat ${index + 1}: ${getDisplayMeter().beats[index].level}`);
    });
    elements.beatGrid.append(button);
  }

  while (elements.beatGrid.children.length > beats.length) {
    elements.beatGrid.lastElementChild.remove();
  }

  beats.forEach((beat, index) => {
    const button = elements.beatGrid.children[index];
    const label = `Beat ${index + 1}: ${beat.level}`;
    button.className = `beat beat-${beat.level}`;
    button.textContent = index + 1;
    button.dataset.level = beat.level;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", beat.level !== "normal");
    button.classList.toggle("is-active", index === app.activeBeatIndex);
  });
}

function render() {
  const segment = getDisplaySegment();
  const displayMeter = getDisplayMeter();
  const displayTempo = segment?.tempo ?? app.state.tempo;
  const displayTempoMode = segment?.tempoMode ?? app.state.tempoMode;
  const displaySubdivision = segment?.subdivision ?? app.state.subdivision;
  elements.tempoReadout.value = displayTempo;
  elements.tempoReadout.textContent = displayTempo;
  elements.tempoModeLabel.textContent = displayTempoMode;
  elements.meterReadout.value = segment
    ? `${segment.name} ${displayMeter.beatsPerBar}/${displayMeter.beatUnit}`
    : `${displayMeter.beatsPerBar}/${displayMeter.beatUnit}`;
  elements.meterReadout.textContent = elements.meterReadout.value;
  elements.subdivisionReadout.value = getSubdivisionLabel(displaySubdivision);
  elements.subdivisionReadout.textContent = elements.subdivisionReadout.value;
  elements.muteToggle.textContent = app.state.muted ? "Unmute" : "Mute";
  elements.muteToggle.setAttribute("aria-pressed", String(app.state.muted));
  elements.playToggle.textContent = app.playing ? "Stop" : "Play";
  if (!app.timerId) {
  elements.timerToggle.textContent = "Timer";
  }
  elements.pendulum.hidden = app.state.visualMode !== "pendulum";
  renderBeatGrid();
  renderNoteChain();
}

function updateFromControls() {
  app.state = readStateFromControls();
  syncControlsFromState();
  refreshPlaybackSchedule();
  render();
}

function changeTempo(delta) {
  app.state = createDefaultState({
    ...app.state,
    tempo: app.state.tempo + delta,
  });
  syncControlsFromState();
  refreshPlaybackSchedule();
  render();
  setStatus(`${app.state.tempo} ${app.state.tempoMode}`);
}

function handleTapTempo() {
  const now = performance.now();
  app.tapTimes.push(now);
  app.tapTimes = app.tapTimes.slice(-TAP_SAMPLE_LIMIT);

  const tempo = calculateTapTempo(app.tapTimes);
  if (!tempo) {
    setStatus("Tap again");
    return;
  }

  app.state = createDefaultState({ ...app.state, tempo });
  syncControlsFromState();
  refreshPlaybackSchedule();
  render();
  setStatus(`Tap tempo ${tempo}`);
}

function toggleMute() {
  app.state = createDefaultState({ ...app.state, muted: !app.state.muted });
  refreshPlaybackSchedule();
  render();
  setStatus(app.state.muted ? "Muted" : "Unmuted");
}

function createField(labelText, control) {
  const label = document.createElement("label");
  const labelSpan = document.createElement("span");
  labelSpan.className = "label";
  labelSpan.textContent = labelText;
  label.append(labelSpan, control);
  return label;
}

function createPatternInput(field, value, options = {}) {
  const input = document.createElement("input");
  input.dataset.patternField = field;
  input.value = value;
  input.type = options.type ?? "text";
  if (options.min != null) {
    input.min = options.min;
  }
  if (options.max != null) {
    input.max = options.max;
  }
  if (options.step != null) {
    input.step = options.step;
  }
  if (options.inputMode) {
    input.inputMode = options.inputMode;
  }
  return input;
}

function createPatternSelect(field, value, options) {
  const select = document.createElement("select");
  select.dataset.patternField = field;
  for (const option of options) {
    select.add(new Option(option.label, option.value));
  }
  select.value = value;
  return select;
}

function renderPatternSegments() {
  elements.patternSegments.replaceChildren();

  app.state.patternChain.segments.forEach((segment, index) => {
    const row = document.createElement("div");
    row.className = "pattern-row";
    row.dataset.patternIndex = String(index);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "pattern-remove";
    removeButton.dataset.patternRemove = String(index);
    removeButton.textContent = "Remove";
    removeButton.disabled = app.state.patternChain.segments.length <= 1;

    row.append(
      createField("Name", createPatternInput("name", segment.name)),
      createField(
        "Bars",
        createPatternInput("bars", segment.bars, {
          type: "number",
          min: "1",
          max: "32",
          step: "1",
          inputMode: "numeric",
        })
      ),
      createField(
        "Tempo",
        createPatternInput("tempo", segment.tempo, {
          type: "number",
          min: "30",
          max: "280",
          step: "1",
          inputMode: "numeric",
        })
      ),
      createField(
        "Beats",
        createPatternInput("beatsPerBar", segment.meter.beatsPerBar, {
          type: "number",
          min: "1",
          max: "16",
          step: "1",
          inputMode: "numeric",
        })
      ),
      createField(
        "Unit",
        createPatternSelect("beatUnit", segment.meter.beatUnit, [
          { value: "2", label: "2" },
          { value: "4", label: "4" },
          { value: "8", label: "8" },
          { value: "16", label: "16" },
          { value: "32", label: "32" },
        ])
      ),
      createField(
        "Subdivision",
        createPatternSelect("subdivision", segment.subdivision, SUBDIVISION_OPTIONS)
      ),
      removeButton
    );

    elements.patternSegments.append(row);
  });
}

function updatePatternSegment(index, field, value) {
  const segments = app.state.patternChain.segments.map((segment, itemIndex) => {
    if (itemIndex !== index) {
      return segment;
    }

    const nextSegment = { ...segment, meter: { ...segment.meter } };
    if (field === "beatsPerBar") {
      nextSegment.meter = normalizeMeter({
        ...nextSegment.meter,
        beatsPerBar: value,
      });
    } else if (field === "beatUnit") {
      nextSegment.meter = normalizeMeter({
        ...nextSegment.meter,
        beatUnit: value,
      });
    } else {
      nextSegment[field] = value;
    }

    return createPatternSegment(nextSegment, app.state, itemIndex);
  });

  app.state = createDefaultState({
    ...readStateFromControls(),
    patternChain: {
      enabled: elements.patternEnabled.checked,
      segments,
    },
  });
  refreshPlaybackSchedule();
  render();
}

function handlePatternSegmentInput(event) {
  const control = event.target.closest("[data-pattern-field]");
  const row = event.target.closest("[data-pattern-index]");
  if (!control || !row) {
    return;
  }

  updatePatternSegment(
    Number(row.dataset.patternIndex),
    control.dataset.patternField,
    control.value
  );
}

function removePatternSegment(index) {
  if (app.state.patternChain.segments.length <= 1) {
    return;
  }

  const segments = app.state.patternChain.segments.filter(
    (_, itemIndex) => itemIndex !== index
  );
  app.activeSegmentIndex = -1;
  app.state = createDefaultState({
    ...readStateFromControls(),
    patternChain: { enabled: elements.patternEnabled.checked, segments },
  });
  renderPatternSegments();
  refreshPlaybackSchedule();
  render();
}

function addPatternSegment() {
  const existingSegments = app.state.patternChain.enabled
    ? app.state.patternChain.segments
    : [];

  if (existingSegments.length >= PATTERN_SEGMENTS_MAX) {
    setStatus(`Chain supports up to ${PATTERN_SEGMENTS_MAX} segments`);
    return;
  }

  const nextIndex = existingSegments.length;
  const nextSegment = createPatternSegment(
    {
      name: `Pattern ${nextIndex + 1}`,
      bars: 1,
      tempo: app.state.tempo,
      tempoMode: app.state.tempoMode,
      meter: { beatsPerBar: 7, beatUnit: 8 },
      subdivision: "eighth",
    },
    app.state,
    nextIndex
  );
  app.state = createDefaultState({
    ...readStateFromControls(),
    patternChain: {
      enabled: true,
      segments: [...existingSegments, nextSegment],
    },
  });
  app.activeSegmentIndex = nextIndex;
  syncControlsFromState();
  renderPatternSegments();
  refreshPlaybackSchedule();
  render();
  setStatus(`Added ${nextSegment.name}`);
}

function handlePatternSegmentClick(event) {
  const removeButton = event.target.closest("[data-pattern-remove]");
  if (!removeButton) {
    return;
  }
  removePatternSegment(Number(removeButton.dataset.patternRemove));
}

function loadPresets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) || "[]");
    app.presets = Array.isArray(parsed)
      ? parsed.map(validatePreset).filter(Boolean)
      : [];
  } catch {
    app.presets = [];
  }
  return app.presets;
}

function savePresets(presets = app.presets) {
  const nextPresets = presets.map(validatePreset).filter(Boolean);
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(nextPresets));
  } catch {
    setStatus("Presets are unavailable in this browser");
    return false;
  }
  app.presets = nextPresets;
  return true;
}

function renderPresets() {
  elements.presetList.replaceChildren();
  if (app.presets.length === 0) {
    const option = new Option("No presets saved", "");
    elements.presetList.add(option);
    elements.presetList.disabled = true;
    return;
  }

  elements.presetList.disabled = false;
  elements.presetList.add(new Option("Load preset...", ""));
  for (const preset of app.presets) {
    elements.presetList.add(new Option(preset.name, preset.id));
  }
}

function saveCurrentPreset() {
  const name = elements.presetName.value.trim() || "Practice setup";
  const preset = createPreset(name, readStateFromControls());
  if (!savePresets([...app.presets, preset])) {
    return;
  }
  renderPresets();
  elements.presetList.value = preset.id;
  elements.presetName.value = "";
  setStatus(`Saved ${preset.name}`);
}

function loadSelectedPreset() {
  const preset = app.presets.find((item) => item.id === elements.presetList.value);
  if (!preset) {
    return;
  }

  app.state = createDefaultState(preset.state);
  syncControlsFromState();
  renderPatternSegments();
  refreshPlaybackSchedule();
  render();
  setStatus(`Loaded ${preset.name}`);
}

function getAudioContext() {
  if (!app.audioContext) {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      setStatus("Web Audio is not supported in this browser");
      return null;
    }

    app.audioContext = new AudioContextConstructor();
    app.masterGain = app.audioContext.createGain();
    app.masterGain.connect(app.audioContext.destination);
  }

  return app.audioContext;
}

function getClickProfile(level, soundStyle) {
  const profiles = {
    digital: {
      accent: [1320, 0.22],
      secondary: [990, 0.16],
      normal: [760, 0.12],
      subdivision: [520, 0.07],
      polyrhythm: [360, 0.08],
    },
    wood: {
      accent: [980, 0.24],
      secondary: [760, 0.17],
      normal: [590, 0.12],
      subdivision: [420, 0.07],
      polyrhythm: [310, 0.08],
    },
    stick: {
      accent: [1550, 0.2],
      secondary: [1180, 0.15],
      normal: [880, 0.1],
      subdivision: [660, 0.06],
      polyrhythm: [480, 0.08],
    },
    beep: {
      accent: [880, 0.16],
      secondary: [660, 0.12],
      normal: [550, 0.09],
      subdivision: [440, 0.05],
      polyrhythm: [330, 0.08],
    },
  };

  return profiles[soundStyle]?.[level] || profiles.digital.normal;
}

function scheduleClick(event) {
  const context = getAudioContext();
  if (!context || !app.masterGain) {
    return;
  }

  const level = getAudibleEventLevel(event, app.state.muted);
  if (level === "silent") {
    return;
  }

  const [frequency, gainValue] = getClickProfile(level, app.state.soundStyle);
  const clickGain = Math.max(0.0001, gainValue * app.state.volume);
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.setValueAtTime(frequency, event.time);
  oscillator.type = app.state.soundStyle === "beep" ? "sine" : "square";
  gain.gain.setValueAtTime(0.0001, event.time);
  gain.gain.exponentialRampToValueAtTime(clickGain, event.time + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, event.time + 0.055);
  oscillator.connect(gain);
  gain.connect(app.masterGain);
  const scheduledNode = { oscillator, gain };
  app.scheduledNodes.add(scheduledNode);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
    app.scheduledNodes.delete(scheduledNode);
  };
  oscillator.start(event.time);
  oscillator.stop(event.time + 0.06);
}

function cancelScheduledNodes() {
  for (const { oscillator, gain } of app.scheduledNodes) {
    oscillator.onended = null;
    try {
      oscillator.stop();
    } catch {
      // Already stopped or not stoppable; disconnect below still releases nodes.
    }
    oscillator.disconnect();
    gain.disconnect();
  }
  app.scheduledNodes.clear();
}

function hasNoteChain() {
  return app.noteChain.length > 0;
}

function createNoteChainSchedule({ startTime, cycles, cycleOffset = 0 }) {
  const quarterDuration = getBeatDurationSeconds({
    tempo: app.state.tempo,
    tempoMode: app.state.tempoMode,
    beatUnit: 4,
  });
  const events = [];
  let currentTime = startTime;

  for (let cycleIndex = 0; cycleIndex < cycles; cycleIndex += 1) {
    const barIndex = cycleOffset + cycleIndex;
    const barStart = currentTime;
    let beatPosition = 0;

    for (let noteIndex = 0; noteIndex < app.noteChain.length; noteIndex += 1) {
      const note = getNoteById(app.noteChain[noteIndex].noteId);
      const duration = note.beats * quarterDuration;
      events.push({
        time: currentTime,
        barIndex,
        beatIndex: noteIndex,
        subdivisionIndex: 0,
        kind: "main",
        level: noteIndex === 0 ? "accent" : "normal",
        audible: !note.rest,
        isCountIn: false,
        mutedByTrainer: false,
        visual: true,
        segmentIndex: -1,
        segmentName: "Note Chain",
        beatsPerBar: app.noteChain.length,
        beatUnit: 4,
        noteId: note.id,
        noteValue: note.valueLabel,
        barEndTime: currentTime + duration,
      });
      currentTime += duration;
      beatPosition += note.beats;
    }

    const lastEvent = events[events.length - 1];
    if (lastEvent) {
      lastEvent.barEndTime = currentTime;
    }
    for (let index = events.length - app.noteChain.length; index < events.length; index += 1) {
      if (events[index]?.barIndex === barIndex) {
        events[index].barEndTime = currentTime;
        events[index].beatsPerBar = Math.max(1, Math.ceil(beatPosition));
      }
    }
  }

  return events;
}

function rebuildSchedule({ includeCountIn = true } = {}) {
  const context = getAudioContext();
  if (!context) {
    app.schedule = [];
    app.scheduledIndex = 0;
    app.nextScheduleTime = 0;
    app.nextBarIndex = 0;
    return;
  }

  const countInBars = includeCountIn ? app.state.countInBars : 0;
  app.startedAt = context.currentTime + 0.08;
  app.schedule = hasNoteChain()
    ? createNoteChainSchedule({
        startTime: app.startedAt,
        cycles: SCHEDULE_BARS,
      })
    : createSchedule({
        state: createDefaultState({
          ...app.state,
          countInBars: includeCountIn ? app.state.countInBars : 0,
        }),
        bars: SCHEDULE_BARS,
        startTime: app.startedAt,
      });
  app.scheduledIndex = 0;
  app.nextScheduleTime = getScheduleEndTime(app.schedule, app.startedAt);
  app.nextBarIndex = SCHEDULE_BARS;
}

function appendScheduleWindow() {
  const appendedEvents = hasNoteChain()
    ? createNoteChainSchedule({
        startTime: app.nextScheduleTime,
        cycles: SCHEDULE_BARS,
        cycleOffset: app.nextBarIndex,
      })
    : createSchedule({
        state: createDefaultState({ ...app.state, countInBars: 0 }),
        bars: SCHEDULE_BARS,
        startTime: app.nextScheduleTime,
        barOffset: app.nextBarIndex,
      });

  app.schedule = [...app.schedule, ...appendedEvents];
  app.nextScheduleTime = getScheduleEndTime(
    appendedEvents,
    app.nextScheduleTime
  );
  app.nextBarIndex += SCHEDULE_BARS;
}

function refreshPlaybackSchedule() {
  if (!app.playing) {
    return;
  }

  cancelScheduledNodes();
  rebuildSchedule({ includeCountIn: false });
}

function schedulerTick() {
  if (!app.playing || !app.audioContext) {
    return;
  }

  const throughTime = app.audioContext.currentTime + LOOKAHEAD_SECONDS;
  while (
    app.scheduledIndex < app.schedule.length &&
    app.schedule[app.scheduledIndex].time <= throughTime
  ) {
    scheduleClick(app.schedule[app.scheduledIndex]);
    app.scheduledIndex += 1;
  }

  if (app.schedule.length - app.scheduledIndex <= 16) {
    appendScheduleWindow();
  }

  app.schedulerTimer = window.setTimeout(schedulerTick, SCHEDULER_INTERVAL_MS);
}

function visualTick() {
  if (!app.playing || !app.audioContext) {
    return;
  }

  const now = app.audioContext.currentTime;
  let current = null;
  for (let index = app.schedule.length - 1; index >= 0; index -= 1) {
    const event = app.schedule[index];
    if (event.time <= now && event.kind === "main") {
      current = event;
      break;
    }
  }

  app.activeBeatIndex = current?.visual === false ? -1 : current?.beatIndex ?? -1;
  app.activeSegmentIndex = current?.segmentIndex ?? -1;
  render();
  app.rafId = window.requestAnimationFrame(visualTick);
}

function startPlayback() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  app.state = readStateFromControls();
  app.playing = true;
  rebuildSchedule();
  schedulerTick();
  visualTick();
  setStatus(
    app.state.countInBars ? `Count-in ${app.state.countInBars} bar(s)` : "Playing"
  );
  render();

  context.resume().catch(() => {
    if (app.playing) {
      stopPlayback();
      setStatus("Audio playback could not start");
    }
  });
}

function stopPlayback() {
  app.playing = false;
  app.activeBeatIndex = -1;
  app.activeSegmentIndex = -1;
  window.clearTimeout(app.schedulerTimer);
  window.cancelAnimationFrame(app.rafId);
  app.schedulerTimer = null;
  app.rafId = null;
  app.schedule = [];
  app.scheduledIndex = 0;
  app.nextScheduleTime = 0;
  app.nextBarIndex = 0;
  cancelScheduledNodes();
  setStatus("Stopped");
  render();
}

function togglePlayback() {
  if (app.playing) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function startTimer() {
  stopTimer();
  app.state = readStateFromControls();
  app.timerRemainingSeconds = app.state.timer.minutes * 60;
  elements.timerToggle.textContent = formatTime(app.timerRemainingSeconds);
  app.timerId = window.setTimeout(timerTick, 1000);
  setStatus(`Timer ${formatTime(app.timerRemainingSeconds)}`);
}

function timerTick() {
  app.timerRemainingSeconds -= 1;
  elements.timerToggle.textContent = formatTime(app.timerRemainingSeconds);

  if (app.timerRemainingSeconds <= 0) {
    stopTimer();
    if (app.state.timer.autoStopMetronome && app.playing) {
      stopPlayback();
    }
    setStatus("Timer complete");
    return;
  }

  app.timerId = window.setTimeout(timerTick, 1000);
}

function stopTimer() {
  window.clearTimeout(app.timerId);
  app.timerId = null;
  app.timerRemainingSeconds = 0;
  elements.timerToggle.textContent = "Timer";
}

function toggleTimer() {
  app.state = readStateFromControls();

  if (app.timerId) {
    stopTimer();
    setStatus("Timer stopped");
    return;
  }

  startTimer();
  if (app.state.timer.autoStartMetronome && !app.playing) {
    startPlayback();
  }
}

function handleShortcut(event) {
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLButtonElement
  ) {
    return;
  }

  if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
  } else if (event.key.toLowerCase() === "t") {
    handleTapTempo();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    changeTempo(event.shiftKey ? 5 : 1);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    changeTempo(event.shiftKey ? -5 : -1);
  } else if (event.key.toLowerCase() === "m") {
    toggleMute();
  } else if (event.key.toLowerCase() === "r") {
    app.activeBeatIndex = -1;
    app.tapTimes = [];
    setStatus("Reset");
    render();
  }
}

function wireControls() {
  elements.playToggle.addEventListener("click", togglePlayback);
  elements.timerToggle.addEventListener("click", toggleTimer);
  elements.tempoDown.addEventListener("click", () => changeTempo(-1));
  elements.tempoUp.addEventListener("click", () => changeTempo(1));
  elements.tempoInput.addEventListener("input", updateFromControls);
  elements.tapTempo.addEventListener("click", handleTapTempo);
  elements.muteToggle.addEventListener("click", toggleMute);

  for (const control of [
    elements.countInBars,
    elements.meterBeats,
    elements.meterUnit,
    elements.patternEnabled,
    elements.polyrhythmEnabled,
    elements.polyrhythmPulses,
    elements.polyrhythmScope,
    elements.soundStyle,
    elements.subdivisionSelect,
    elements.tempoMode,
    elements.timerMinutes,
    elements.trainerEnabled,
    elements.trainerHideVisuals,
    elements.trainerMuteBars,
    elements.trainerPlayBars,
    elements.trainerRandomPercent,
    elements.visualMode,
    elements.volumeControl,
  ]) {
    control.addEventListener("input", updateFromControls);
    control.addEventListener("change", updateFromControls);
  }

  elements.addPatternSegment.addEventListener("click", addPatternSegment);
  elements.clearNoteChain.addEventListener("click", clearNoteChain);
  elements.patternSegments.addEventListener("input", handlePatternSegmentInput);
  elements.patternSegments.addEventListener("change", handlePatternSegmentInput);
  elements.patternSegments.addEventListener("click", handlePatternSegmentClick);
  elements.savePreset.addEventListener("click", saveCurrentPreset);
  elements.presetList.addEventListener("change", loadSelectedPreset);
  window.addEventListener("keydown", handleShortcut);
}

loadPresets();
wireControls();
syncControlsFromState();
renderNoteLibrary();
renderPatternSegments();
renderPresets();
render();
