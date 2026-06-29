import {
  ACCENT_LEVELS,
  APP_VERSION,
  PATTERN_SEGMENTS_MAX,
  SUBDIVISION_OPTIONS,
  calculateTapTempo,
  createPatternSegment,
  createDefaultState,
  createSchedule,
  getAudibleEventLevel,
  getScheduleEndTime,
  normalizeMeter,
} from "./metronome-core.js";

const TAP_SAMPLE_LIMIT = 6;
const LOOKAHEAD_SECONDS = 0.1;
const SCHEDULER_INTERVAL_MS = 25;
const SCHEDULE_BARS = 64;

const BEAT_RHYTHM_OPTIONS = [
  { value: "inherit", symbol: "↺", label: "跟随全局" },
  { value: "quarter", symbol: "♩", label: "四分音符" },
  { value: "eighth", symbol: "♫", label: "两个八分音符" },
  { value: "triplet", symbol: "♪³", label: "三连音" },
  { value: "sixteenth", symbol: "♬", label: "四个十六分音符" },
  { value: "rest", symbol: "𝄽", label: "休止" },
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
  beatRhythmEditor: document.querySelector("#beatRhythmEditor"),
  playToggle: document.querySelector("#playToggle"),
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
  rafId: null,
  schedule: [],
  scheduledIndex: 0,
  scheduledNodes: new Set(),
  schedulerTimer: null,
  state: createDefaultState(),
  startedAt: 0,
  tapTimes: [],
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

function getBeatRhythmLabel(value) {
  return (
    BEAT_RHYTHM_OPTIONS.find((option) => option.value === value)?.label ||
    "Follow global"
  );
}

function createBeatRhythmButton(option, beat, index) {
  const button = document.createElement("button");
  const selected = (beat.rhythm ?? "inherit") === option.value;
  button.type = "button";
  button.className = "beat-rhythm-option";
  button.dataset.beatRhythm = String(index);
  button.dataset.rhythmValue = option.value;
  button.textContent = option.symbol;
  button.setAttribute("aria-label", `第 ${index + 1} 拍：${option.label}`);
  button.setAttribute("aria-pressed", String(selected));
  button.classList.toggle("is-selected", selected);
  return button;
}

function renderBeatRhythmEditor() {
  elements.beatRhythmEditor.replaceChildren();

  getDisplayMeter().beats.forEach((beat, index) => {
    const row = document.createElement("div");
    row.className = "beat-rhythm-row";

    const label = document.createElement("span");
    label.className = "beat-rhythm-index";
    label.textContent = String(index + 1);

    const options = document.createElement("div");
    options.className = "beat-rhythm-options";
    options.setAttribute("role", "group");
    options.setAttribute("aria-label", `第 ${index + 1} 拍节奏`);

    for (const option of BEAT_RHYTHM_OPTIONS) {
      options.append(createBeatRhythmButton(option, beat, index));
    }

    row.append(label, options);
    elements.beatRhythmEditor.append(row);
  });
}

function updateBeatRhythm(beatIndex, rhythm) {
  const segmentIndex = getEditableSegmentIndex();

  if (segmentIndex >= 0) {
    const segments = app.state.patternChain.segments.map((segment, itemIndex) => {
      if (itemIndex !== segmentIndex) {
        return segment;
      }

      const beats = segment.meter.beats.map((beat, index) =>
        index === beatIndex ? { ...beat, rhythm } : beat
      );
      return createPatternSegment(
        { ...segment, meter: { ...segment.meter, beats } },
        app.state,
        itemIndex
      );
    });

    app.state = createDefaultState({
      ...app.state,
      patternChain: { ...app.state.patternChain, segments },
    });
  } else {
    const beats = app.state.meter.beats.map((beat, index) =>
      index === beatIndex ? { ...beat, rhythm } : beat
    );
    app.state = createDefaultState({
      ...app.state,
      meter: { ...app.state.meter, beats },
    });
  }

  refreshPlaybackSchedule();
  render();
  setStatus(`Beat ${beatIndex + 1}: ${getBeatRhythmLabel(rhythm)}`);
}

function handleBeatRhythmClick(event) {
  const control = event.target.closest("[data-beat-rhythm]");
  if (!control) {
    return;
  }

  updateBeatRhythm(
    Number(control.dataset.beatRhythm),
    control.dataset.rhythmValue
  );
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
  elements.pendulum.hidden = app.state.visualMode !== "pendulum";
  renderBeatGrid();
  renderBeatRhythmEditor();
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

function rebuildSchedule({ includeCountIn = true } = {}) {
  const context = getAudioContext();
  if (!context) {
    app.schedule = [];
    app.scheduledIndex = 0;
    app.nextScheduleTime = 0;
    app.nextBarIndex = 0;
    return;
  }

  app.startedAt = context.currentTime + 0.08;
  app.schedule = createSchedule({
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
  const appendedEvents = createSchedule({
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
    elements.soundStyle,
    elements.subdivisionSelect,
    elements.tempoMode,
    elements.visualMode,
    elements.volumeControl,
  ]) {
    control.addEventListener("input", updateFromControls);
    control.addEventListener("change", updateFromControls);
  }

  elements.addPatternSegment.addEventListener("click", addPatternSegment);
  elements.beatRhythmEditor.addEventListener("click", handleBeatRhythmClick);
  elements.patternSegments.addEventListener("input", handlePatternSegmentInput);
  elements.patternSegments.addEventListener("change", handlePatternSegmentInput);
  elements.patternSegments.addEventListener("click", handlePatternSegmentClick);
  window.addEventListener("keydown", handleShortcut);
}

wireControls();
syncControlsFromState();
renderPatternSegments();
render();
