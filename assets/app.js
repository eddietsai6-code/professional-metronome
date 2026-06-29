import {
  ACCENT_LEVELS,
  APP_VERSION,
  calculateTapTempo,
  createDefaultState,
  createPreset,
  createSchedule,
  getAudibleEventLevel,
  getBeatDurationSeconds,
  normalizeMeter,
  validatePreset,
} from "./metronome-core.js";

const PRESET_STORAGE_KEY = "professional-metronome.presets";
const TAP_SAMPLE_LIMIT = 6;
const LOOKAHEAD_SECONDS = 0.1;
const SCHEDULER_INTERVAL_MS = 25;
const SCHEDULE_BARS = 64;

document.documentElement.dataset.appVersion = APP_VERSION;

const elements = {
  beatGrid: document.querySelector("#beatGrid"),
  countInBars: document.querySelector("#countInBars"),
  meterBeats: document.querySelector("#meterBeats"),
  meterReadout: document.querySelector("#meterReadout"),
  meterUnit: document.querySelector("#meterUnit"),
  muteToggle: document.querySelector("#muteToggle"),
  pendulum: document.querySelector("#pendulum"),
  playToggle: document.querySelector("#playToggle"),
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
  state: createDefaultState(),
  startedAt: 0,
  tapTimes: [],
  timerId: null,
  timerRemainingSeconds: 0,
};

function setStatus(message) {
  elements.statusText.textContent = message;
}

function getSelectedSubdivisionLabel() {
  return (
    elements.subdivisionSelect.selectedOptions[0]?.textContent?.trim() ||
    "Quarter"
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

function renderBeatGrid() {
  const beats = app.state.meter.beats;
  elements.beatGrid.style.setProperty("--beat-count", beats.length);

  for (let index = elements.beatGrid.children.length; index < beats.length; index += 1) {
    const button = document.createElement("button");
    button.className = "beat";
    button.type = "button";
    button.addEventListener("click", () => {
      const beat = app.state.meter.beats[index];
      const nextBeats = app.state.meter.beats.map((item, beatIndex) =>
        beatIndex === index
          ? { ...item, level: cycleAccentLevel(beat.level) }
          : item
      );
      app.state = createDefaultState({
        ...app.state,
        meter: { ...app.state.meter, beats: nextBeats },
      });
      refreshPlaybackSchedule();
      render();
      setStatus(`Beat ${index + 1}: ${app.state.meter.beats[index].level}`);
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
  elements.tempoReadout.value = app.state.tempo;
  elements.tempoReadout.textContent = app.state.tempo;
  elements.tempoModeLabel.textContent = app.state.tempoMode;
  elements.meterReadout.value = `${app.state.meter.beatsPerBar}/${app.state.meter.beatUnit}`;
  elements.meterReadout.textContent = elements.meterReadout.value;
  elements.subdivisionReadout.value = getSelectedSubdivisionLabel();
  elements.subdivisionReadout.textContent = elements.subdivisionReadout.value;
  elements.muteToggle.textContent = app.state.muted ? "Unmute" : "Mute";
  elements.muteToggle.setAttribute("aria-pressed", String(app.state.muted));
  elements.playToggle.textContent = app.playing ? "Stop" : "Play";
  if (!app.timerId) {
    elements.timerToggle.textContent = "Timer";
  }
  elements.pendulum.hidden = app.state.visualMode !== "pendulum";
  renderBeatGrid();
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
    },
    wood: {
      accent: [980, 0.24],
      secondary: [760, 0.17],
      normal: [590, 0.12],
      subdivision: [420, 0.07],
    },
    stick: {
      accent: [1550, 0.2],
      secondary: [1180, 0.15],
      normal: [880, 0.1],
      subdivision: [660, 0.06],
    },
    beep: {
      accent: [880, 0.16],
      secondary: [660, 0.12],
      normal: [550, 0.09],
      subdivision: [440, 0.05],
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

function getBarDurationSeconds() {
  return (
    getBeatDurationSeconds({
      tempo: app.state.tempo,
      tempoMode: app.state.tempoMode,
      beatUnit: app.state.meter.beatUnit,
    }) * app.state.meter.beatsPerBar
  );
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
  const barDurationSeconds = getBarDurationSeconds();
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
  app.nextScheduleTime =
    app.startedAt + (countInBars + SCHEDULE_BARS) * barDurationSeconds;
  app.nextBarIndex = SCHEDULE_BARS;
}

function appendScheduleWindow() {
  const barDurationSeconds = getBarDurationSeconds();
  const appendedEvents = createSchedule({
    state: createDefaultState({ ...app.state, countInBars: 0 }),
    bars: SCHEDULE_BARS,
    startTime: app.nextScheduleTime,
    barOffset: app.nextBarIndex,
  });

  app.schedule = [...app.schedule, ...appendedEvents];
  app.nextScheduleTime += SCHEDULE_BARS * barDurationSeconds;
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

  elements.savePreset.addEventListener("click", saveCurrentPreset);
  elements.presetList.addEventListener("change", loadSelectedPreset);
  window.addEventListener("keydown", handleShortcut);
}

loadPresets();
wireControls();
syncControlsFromState();
renderPresets();
render();
