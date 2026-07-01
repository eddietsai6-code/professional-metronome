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
  getVoiceCountToken,
  normalizeMeter,
} from "./metronome-core.js";

const TAP_SAMPLE_LIMIT = 6;
const LOOKAHEAD_SECONDS = 0.1;
const SCHEDULER_INTERVAL_MS = 25;
const SCHEDULE_BARS = 64;
const OUTPUT_GAIN = 1.8;
const VOICE_SAMPLE_GAIN = 1.6;
const VOICE_COUNT_SAMPLE_URLS = {
  "1": "assets/voice-count/one.wav",
  "2": "assets/voice-count/two.wav",
  "3": "assets/voice-count/three.wav",
  "4": "assets/voice-count/four.wav",
  "5": "assets/voice-count/five.wav",
  "6": "assets/voice-count/six.wav",
  "7": "assets/voice-count/seven.wav",
  "8": "assets/voice-count/eight.wav",
  "9": "assets/voice-count/nine.wav",
  "10": "assets/voice-count/ten.wav",
  "11": "assets/voice-count/eleven.wav",
  "12": "assets/voice-count/twelve.wav",
  "13": "assets/voice-count/thirteen.wav",
  "14": "assets/voice-count/fourteen.wav",
  "15": "assets/voice-count/fifteen.wav",
  "16": "assets/voice-count/sixteen.wav",
  "&": "assets/voice-count/and.wav",
  e: "assets/voice-count/e.wav",
  a: "assets/voice-count/a.wav",
  trip: "assets/voice-count/trip.wav",
  let: "assets/voice-count/let.wav",
};

const BEAT_RHYTHM_OPTIONS = [
  { value: "quarter", label: "Quarter note" },
  { value: "eighth", label: "Two eighth notes" },
  { value: "eighth-rest-note", label: "Eighth rest then note" },
  { value: "triplet", label: "Triplet" },
  { value: "triplet-rest-note-note", label: "Triplet rest note note" },
  { value: "triplet-note-rest-note", label: "Triplet note rest note" },
  { value: "triplet-note-note-rest", label: "Triplet note note rest" },
  { value: "sixteenth", label: "Four sixteenth notes" },
  { value: "sixteenth-rest-note-rest-note", label: "Sixteenth rest note rest note" },
  { value: "sixteenth-pair-eighth", label: "Two sixteenths then eighth" },
  { value: "eighth-sixteenth-pair", label: "Eighth then two sixteenths" },
  { value: "dotted-eighth-sixteenth", label: "Dotted eighth then sixteenth" },
  { value: "sixteenth-dotted-eighth", label: "Sixteenth then dotted eighth" },
  { value: "sixteenth-eighth-sixteenth", label: "Sixteenth eighth sixteenth" },
];

const RHYTHM_DRAWINGS = {
  quarter: {
    notes: [{ x: 54, y: 61 }],
  },
  eighth: {
    notes: [{ x: 42, y: 61 }, { x: 68, y: 61 }],
    beams: [{ from: 48, to: 74, y: 25, count: 1 }],
  },
  "eighth-rest-note": {
    rests: [{ x: 39, y: 38 }],
    notes: [{ x: 69, y: 61, flag: true }],
  },
  triplet: {
    tuplet: true,
    notes: [{ x: 35, y: 61 }, { x: 55, y: 61 }, { x: 75, y: 61 }],
    beams: [{ from: 41, to: 81, y: 27, count: 1 }],
  },
  "triplet-rest-note-note": {
    tuplet: true,
    rests: [{ x: 35, y: 38 }],
    notes: [{ x: 55, y: 61 }, { x: 75, y: 61 }],
    beams: [{ from: 61, to: 81, y: 31, count: 1 }],
  },
  "triplet-note-rest-note": {
    tuplet: true,
    rests: [{ x: 55, y: 38 }],
    notes: [{ x: 35, y: 61 }, { x: 75, y: 61 }],
  },
  "triplet-note-note-rest": {
    tuplet: true,
    rests: [{ x: 75, y: 38 }],
    notes: [{ x: 35, y: 61 }, { x: 55, y: 61 }],
    beams: [{ from: 41, to: 61, y: 31, count: 1 }],
  },
  sixteenth: {
    notes: [{ x: 31, y: 61 }, { x: 47, y: 61 }, { x: 63, y: 61 }, { x: 79, y: 61 }],
    beams: [{ from: 37, to: 85, y: 24, count: 2 }],
  },
  "sixteenth-rest-note-rest-note": {
    rests: [{ x: 31, y: 38 }, { x: 63, y: 38 }],
    notes: [{ x: 47, y: 61 }, { x: 79, y: 61 }],
  },
  "sixteenth-pair-eighth": {
    notes: [{ x: 36, y: 61 }, { x: 53, y: 61 }, { x: 76, y: 61 }],
    beams: [{ from: 42, to: 82, y: 24, count: 1 }, { from: 42, to: 59, y: 33, count: 1 }],
  },
  "eighth-sixteenth-pair": {
    notes: [{ x: 34, y: 61 }, { x: 58, y: 61 }, { x: 75, y: 61 }],
    beams: [{ from: 40, to: 81, y: 24, count: 1 }, { from: 64, to: 81, y: 33, count: 1 }],
  },
  "dotted-eighth-sixteenth": {
    notes: [{ x: 39, y: 61, dotted: true }, { x: 73, y: 61 }],
    beams: [{ from: 45, to: 79, y: 24, count: 2 }],
  },
  "sixteenth-dotted-eighth": {
    notes: [{ x: 37, y: 61 }, { x: 70, y: 61, dotted: true }],
    beams: [{ from: 43, to: 76, y: 24, count: 2 }],
  },
  "sixteenth-eighth-sixteenth": {
    notes: [{ x: 34, y: 61 }, { x: 56, y: 61 }, { x: 78, y: 61 }],
    beams: [{ from: 40, to: 84, y: 24, count: 1 }, { from: 40, to: 46, y: 33, count: 1 }, { from: 78, to: 84, y: 33, count: 1 }],
  },
};

const SVG_NS = "http://www.w3.org/2000/svg";
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
  activeRhythmPickerIndex: -1,
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
  voiceSampleBuffers: new Map(),
  voiceSampleBufferPromises: new Map(),
  voiceSamples: new Map(),
  voiceSamplePromises: new Map(),
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

function createSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tagName);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

function appendSvgElement(parent, tagName, attributes = {}) {
  const element = createSvgElement(tagName, attributes);
  parent.append(element);
  return element;
}

function appendRhythmNote(svg, note) {
  appendSvgElement(svg, "ellipse", {
    class: "rhythm-note-head",
    cx: note.x,
    cy: note.y,
    rx: 7.8,
    ry: 5.2,
    transform: `rotate(-18 ${note.x} ${note.y})`,
  });
  appendSvgElement(svg, "line", {
    class: "rhythm-stem",
    x1: note.x + 6,
    y1: note.y - 2,
    x2: note.x + 6,
    y2: 24,
  });

  if (note.flag) {
    appendSvgElement(svg, "path", {
      class: "rhythm-flag",
      d: `M ${note.x + 6} 24 C ${note.x + 23} 29, ${note.x + 22} 42, ${note.x + 10} 47`,
    });
  }

  if (note.dotted) {
    appendSvgElement(svg, "circle", {
      class: "rhythm-dot",
      cx: note.x + 17,
      cy: note.y - 2,
      r: 2.2,
    });
  }
}

function appendRhythmRest(svg, rest) {
  appendSvgElement(svg, "circle", {
    class: "rhythm-rest-dot",
    cx: rest.x - 7,
    cy: rest.y - 4,
    r: 3.2,
  });
  appendSvgElement(svg, "path", {
    class: "rhythm-rest",
    d: `M ${rest.x + 1} ${rest.y - 12} C ${rest.x + 15} ${rest.y - 7}, ${rest.x + 14} ${rest.y + 4}, ${rest.x + 2} ${rest.y + 4} L ${rest.x - 7} ${rest.y + 22}`,
  });
}

function appendRhythmBeam(svg, beam) {
  for (let index = 0; index < beam.count; index += 1) {
    const y = beam.y + index * 8;
    appendSvgElement(svg, "path", {
      class: "rhythm-beam",
      d: `M ${beam.from} ${y} L ${beam.to} ${y} L ${beam.to} ${y + 5} L ${beam.from} ${y + 5} Z`,
    });
  }
}

function appendTupletMark(svg) {
  appendSvgElement(svg, "path", {
    class: "rhythm-tuplet-bracket",
    d: "M 31 16 H 48 M 62 16 H 79 M 31 16 V 21 M 79 16 V 21",
  });
  appendSvgElement(svg, "text", {
    class: "rhythm-tuplet-number",
    x: 55,
    y: 19,
    "text-anchor": "middle",
  }).textContent = "3";
}

function createRhythmNotation(option) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const drawing = RHYTHM_DRAWINGS[option.value] ?? RHYTHM_DRAWINGS.quarter;
  svg.classList.add("rhythm-card-svg");
  svg.setAttribute("viewBox", "0 0 110 84");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  if (drawing.tuplet) {
    appendTupletMark(svg);
  }
  for (const rest of drawing.rests ?? []) {
    appendRhythmRest(svg, rest);
  }
  for (const note of drawing.notes ?? []) {
    appendRhythmNote(svg, note);
  }
  for (const beam of drawing.beams ?? []) {
    appendRhythmBeam(svg, beam);
  }

  return svg;
}

function getBeatRhythmLabel(value) {
  return (
    BEAT_RHYTHM_OPTIONS.find((option) => option.value === value)?.label ||
    "Quarter note"
  );
}

function getBeatRhythmOption(value) {
  return (
    BEAT_RHYTHM_OPTIONS.find((option) => option.value === value) ||
    BEAT_RHYTHM_OPTIONS[0]
  );
}

function getBeatDisplayRhythm(beat) {
  return beat.rhythm === "inherit" ? "quarter" : beat.rhythm;
}

function createBeatRhythmCurrentButton(beat, index) {
  const option = getBeatRhythmOption(getBeatDisplayRhythm(beat));
  const button = document.createElement("button");
  const label = document.createElement("span");

  button.type = "button";
  button.className = "beat-rhythm-current";
  button.dataset.beatRhythmToggle = String(index);
  button.setAttribute("aria-label", `Beat ${index + 1}: ${option.label}`);
  button.setAttribute(
    "aria-expanded",
    String(app.activeRhythmPickerIndex === index)
  );
  button.setAttribute("aria-controls", `beat-rhythm-picker-${index}`);

  label.className = "beat-rhythm-index";
  label.textContent = String(index + 1);
  button.append(label, createRhythmNotation(option));
  return button;
}

function createBeatRhythmOptionButton(option, beat, index) {
  const button = document.createElement("button");
  const rhythm = getBeatDisplayRhythm(beat);
  const selected = (rhythm ?? "quarter") === option.value;
  button.type = "button";
  button.className = "beat-rhythm-option";
  button.dataset.beatRhythm = String(index);
  button.dataset.rhythmValue = option.value;
  button.replaceChildren(createRhythmNotation(option));
  button.setAttribute("aria-label", `Beat ${index + 1}: ${option.label}`);
  button.setAttribute("aria-pressed", String(selected));
  button.classList.toggle("is-selected", selected);
  return button;
}

function renderBeatRhythmEditor() {
  elements.beatRhythmEditor.replaceChildren();
  const meter = getDisplayMeter();
  const chain = document.createElement("div");

  if (app.activeRhythmPickerIndex >= meter.beats.length) {
    app.activeRhythmPickerIndex = -1;
  }

  chain.className = "beat-rhythm-chain";

  meter.beats.forEach((beat, index) => {
    const slot = document.createElement("div");
    slot.className = "beat-rhythm-slot";
    slot.append(createBeatRhythmCurrentButton(beat, index));
    chain.append(slot);
  });

  elements.beatRhythmEditor.append(chain);

  if (app.activeRhythmPickerIndex >= 0) {
    const index = app.activeRhythmPickerIndex;
    const beat = meter.beats[index];
    const picker = document.createElement("div");
    picker.id = `beat-rhythm-picker-${index}`;
    picker.className = "beat-rhythm-picker";
    picker.setAttribute("role", "group");
    picker.setAttribute("aria-label", `Rhythm choices for beat ${index + 1}`);
    for (const option of BEAT_RHYTHM_OPTIONS) {
      picker.append(createBeatRhythmOptionButton(option, beat, index));
    }
    elements.beatRhythmEditor.append(picker);
  }
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

  app.activeRhythmPickerIndex = -1;
  refreshPlaybackSchedule();
  render();
  setStatus(`Beat ${beatIndex + 1}: ${getBeatRhythmLabel(rhythm)}`);
}

function handleBeatRhythmClick(event) {
  const toggle = event.target.closest("[data-beat-rhythm-toggle]");
  if (toggle) {
    const index = Number(toggle.dataset.beatRhythmToggle);
    app.activeRhythmPickerIndex =
      app.activeRhythmPickerIndex === index ? -1 : index;
    render();
    return;
  }

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
  if (app.state.soundStyle === "voice-count") {
    preloadVoiceCountSampleBuffers();
    const context = app.audioContext ?? getAudioContext();
    if (context) {
      loadVoiceCountSamples(context);
    }
  }
  syncControlsFromState();
  refreshPlaybackSchedule();
  render();
}

function commitTempoInput() {
  app.state = readStateFromControls();
  syncControlsFromState();
  refreshPlaybackSchedule();
  render();
  setStatus(`${app.state.tempo} ${app.state.tempoMode}`);
}

function handleTempoInput() {
  const rawTempo = elements.tempoInput.value.trim();
  const tempo = Number(rawTempo);
  const minTempo = Number(elements.tempoInput.min);
  const maxTempo = Number(elements.tempoInput.max);
  if (!rawTempo || !Number.isFinite(tempo) || tempo < minTempo || tempo > maxTempo) {
    return;
  }

  app.state = createDefaultState({ ...app.state, tempo });
  refreshPlaybackSchedule();
  render();
  setStatus(`${app.state.tempo} ${app.state.tempoMode}`);
}

function handleTempoInputKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    commitTempoInput();
    elements.tempoInput.select();
  } else if (event.key === "Escape") {
    syncControlsFromState();
    elements.tempoInput.blur();
  }
}

function focusTempoInput() {
  elements.tempoInput.focus();
  elements.tempoInput.select();
  setStatus("Set tempo");
}

function handleTempoReadoutKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  focusTempoInput();
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

function scheduleToneClick(event, level, context) {
  if (!app.masterGain) {
    return;
  }

  const soundStyle =
    app.state.soundStyle === "voice-count" ? "digital" : app.state.soundStyle;
  const [frequency, gainValue] = getClickProfile(level, soundStyle);
  const clickGain = Math.max(
    0.0001,
    Math.min(0.95, gainValue * app.state.volume * OUTPUT_GAIN)
  );
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.setValueAtTime(frequency, event.time);
  oscillator.type = soundStyle === "beep" ? "sine" : "square";
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

function preloadVoiceCountSampleBuffer(token, url = VOICE_COUNT_SAMPLE_URLS[token]) {
  if (!token || !url) {
    return Promise.resolve(null);
  }
  if (app.voiceSampleBuffers.has(token)) {
    return Promise.resolve(app.voiceSampleBuffers.get(token));
  }
  if (!app.voiceSampleBufferPromises.has(token)) {
    const bufferPromise = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load ${url}`);
        }
        return response.arrayBuffer();
      })
      .then((arrayBuffer) => {
        app.voiceSampleBuffers.set(token, arrayBuffer);
        return arrayBuffer;
      })
      .catch((error) => {
        console.warn(error);
        return null;
      })
      .finally(() => {
        app.voiceSampleBufferPromises.delete(token);
      });

    app.voiceSampleBufferPromises.set(token, bufferPromise);
  }

  return app.voiceSampleBufferPromises.get(token);
}

function preloadVoiceCountSampleBuffers() {
  const sampleEntries = Object.entries(VOICE_COUNT_SAMPLE_URLS);
  if (app.voiceSampleBuffers.size === sampleEntries.length) {
    return Promise.resolve(app.voiceSampleBuffers);
  }

  return Promise.allSettled(
    sampleEntries.map(([token, url]) =>
      preloadVoiceCountSampleBuffer(token, url)
    )
  ).then(() => app.voiceSampleBuffers);
}

function loadVoiceCountSample(context, token) {
  if (!context || !token) {
    return Promise.resolve(null);
  }
  if (app.voiceSamples.has(token)) {
    return Promise.resolve(app.voiceSamples.get(token));
  }
  if (!app.voiceSamplePromises.has(token)) {
    const samplePromise = preloadVoiceCountSampleBuffer(token)
      .then((arrayBuffer) => {
        if (!arrayBuffer) {
          return null;
        }
        return context.decodeAudioData(arrayBuffer.slice(0));
      })
      .then((audioBuffer) => {
        if (audioBuffer) {
          app.voiceSamples.set(token, audioBuffer);
        }
        return audioBuffer;
      })
      .catch((error) => {
        console.warn(error);
        return null;
      })
      .finally(() => {
        app.voiceSamplePromises.delete(token);
      });

    app.voiceSamplePromises.set(token, samplePromise);
  }

  return app.voiceSamplePromises.get(token);
}

async function loadVoiceCountSamples(context = getAudioContext()) {
  if (!context) {
    return app.voiceSamples;
  }

  await Promise.all(
    Object.keys(VOICE_COUNT_SAMPLE_URLS).map((token) =>
      loadVoiceCountSample(context, token)
    )
  );
  return app.voiceSamples;
}

function getStartupVoiceCountTokens() {
  const startupState = createDefaultState(app.state);
  const startupEvents = createSchedule({
    state: createDefaultState({
      ...startupState,
      countInBars: startupState.countInBars ? 1 : 0,
    }),
    bars: 1,
    startTime: 0,
  });
  const tokens = [];

  for (const event of startupEvents) {
    if (getAudibleEventLevel(event, startupState.muted) === "silent") {
      continue;
    }

    const token = getVoiceCountToken(event);
    if (token && !tokens.includes(token)) {
      tokens.push(token);
    }
    if (tokens.length >= 8) {
      break;
    }
  }

  return tokens.length ? tokens : ["1"];
}

function loadVoiceCountStartupSamples(context) {
  const tokens = getStartupVoiceCountTokens();
  return Promise.all(tokens.map((token) => loadVoiceCountSample(context, token)))
    .then(() => {
      loadVoiceCountSamples(context);
      return app.voiceSamples;
    });
}

function scheduleVoiceCount(event, level, context) {
  const token = getVoiceCountToken(event);
  if (!token) {
    return;
  }

  const sample = app.voiceSamples.get(token);
  if (!sample) {
    loadVoiceCountSample(context, token);
    scheduleToneClick(event, level, context);
    return;
  }

  const source = context.createBufferSource();
  const gain = context.createGain();
  const sampleGain = Math.max(
    0.0001,
    Math.min(2.4, app.state.volume * VOICE_SAMPLE_GAIN)
  );
  const stopTime = event.time + Math.min(sample.duration, 0.46);
  const fadeInEnd = event.time + 0.008;
  const fadeOutStart = Math.max(fadeInEnd, stopTime - 0.03);

  source.buffer = sample;
  gain.gain.setValueAtTime(0.0001, event.time);
  gain.gain.linearRampToValueAtTime(sampleGain, fadeInEnd);
  gain.gain.setValueAtTime(sampleGain, fadeOutStart);
  gain.gain.linearRampToValueAtTime(0.0001, stopTime);
  source.connect(gain);
  gain.connect(app.masterGain);

  const scheduledNode = { source, gain };
  app.scheduledNodes.add(scheduledNode);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
    app.scheduledNodes.delete(scheduledNode);
  };
  source.start(event.time);
  source.stop(stopTime);
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

  if (app.state.soundStyle === "voice-count") {
    scheduleVoiceCount(event, level, context);
    return;
  }

  scheduleToneClick(event, level, context);
}

function cancelScheduledNodes() {
  for (const node of app.scheduledNodes) {
    if (node.source && node.gain) {
      node.source.onended = null;
      try {
        node.source.stop();
      } catch {
        // Already stopped or not stoppable; disconnect below still releases nodes.
      }
      node.source.disconnect();
      node.gain.disconnect();
      continue;
    }
    if (!node.oscillator || !node.gain) {
      continue;
    }

    const { oscillator, gain } = node;
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

async function startPlayback() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  app.state = readStateFromControls();
  app.playing = true;
  const resumePromise = context.resume();

  if (app.state.soundStyle === "voice-count") {
    setStatus("Starting voice count");
    render();
    await loadVoiceCountStartupSamples(context);
    if (!app.playing) {
      return;
    }
  }

  rebuildSchedule();
  schedulerTick();
  visualTick();
  setStatus(
    app.state.countInBars ? `Count-in ${app.state.countInBars} bar(s)` : "Playing"
  );
  render();

  resumePromise.catch(() => {
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
  elements.tempoInput.addEventListener("input", handleTempoInput);
  elements.tempoInput.addEventListener("keydown", handleTempoInputKeydown);
  elements.tempoInput.addEventListener("change", commitTempoInput);
  elements.tempoInput.addEventListener("blur", commitTempoInput);
  elements.tempoReadout.tabIndex = 0;
  elements.tempoReadout.setAttribute("role", "button");
  elements.tempoReadout.setAttribute("aria-label", "Edit tempo");
  elements.tempoReadout.addEventListener("click", focusTempoInput);
  elements.tempoReadout.addEventListener("keydown", handleTempoReadoutKeydown);
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
preloadVoiceCountSampleBuffers();
