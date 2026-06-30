import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../assets/styles.css", import.meta.url), "utf8");

const requiredIds = [
  "playToggle",
  "tempoInput",
  "tempoDown",
  "tempoUp",
  "tapTempo",
  "meterBeats",
  "meterUnit",
  "subdivisionSelect",
  "beatGrid",
  "visualMode",
  "soundStyle",
  "volumeControl",
  "countInBars",
  "statusText",
  "muteToggle",
  "tempoMode",
  "tempoReadout",
  "tempoModeLabel",
  "meterReadout",
  "subdivisionReadout",
  "pendulum",
  "patternEnabled",
  "beatRhythmEditor",
  "patternSegments",
  "addPatternSegment",
];

test("app shell links the stylesheet and module script", () => {
  assert.match(html, /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']assets\/styles\.css["'][^>]*>/);
  assert.match(html, /<script\b[^>]*type=["']module["'][^>]*src=["']assets\/app\.js["'][^>]*><\/script>/);
});

test("app shell exposes stable DOM ids for the metronome UI", () => {
  for (const id of requiredIds) {
    assert.match(html, new RegExp(`\\bid=["']${id}["']`), `missing #${id}`);
  }
});

test("app shell has simplified semantic regions without advanced panels", () => {
  assert.match(html, /<main\b[^>]*class=["'][^"']*\bmetronome-app\b/);
  assert.match(html, /<section\b[^>]*class=["'][^"']*\bdisplay-panel\b/);
  assert.match(html, /<section\b[^>]*class=["'][^"']*\bcontrol-panel\b/);
  assert.match(html, /<section\b[^>]*class=["'][^"']*\btool-grid\b/);
  assert.match(html, /<section\b[^>]*class=["'][^"']*\bpattern-panel\b/);
  assert.doesNotMatch(html, /\bpolyrhythm-panel\b/);
  assert.doesNotMatch(html, /\bpractice-panel\b/);
  assert.doesNotMatch(html, /\bpreset-panel\b/);
});

test("brand header uses the requested Eddie rhythm logo", () => {
  assert.match(html, /Eddie\.RHYTHM/);
  assert.doesNotMatch(html, /RHYTHM\.CORE/);
});

test("visual mode options match core visual state values", () => {
  const selectMatch = html.match(/<select\b[^>]*id=["']visualMode["'][^>]*>([\s\S]*?)<\/select>/);
  assert.ok(selectMatch, "missing #visualMode select");

  const values = [...selectMatch[1].matchAll(/<option\b[^>]*value=["']([^"']+)["'][^>]*>/g)].map(
    ([, value]) => value
  );

  assert.deepEqual(values, ["all", "accent", "accent-secondary", "pendulum"]);
});

test("subdivision options expose expanded rhythm choices", () => {
  const selectMatch = html.match(/<select\b[^>]*id=["']subdivisionSelect["'][^>]*>([\s\S]*?)<\/select>/);
  assert.ok(selectMatch, "missing #subdivisionSelect select");

  const values = [...selectMatch[1].matchAll(/<option\b[^>]*value=["']([^"']+)["'][^>]*>/g)].map(
    ([, value]) => value
  );

  assert.deepEqual(values, [
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
  ]);
});

test("sound options include a voice count style", () => {
  const selectMatch = html.match(/<select\b[^>]*id=["']soundStyle["'][^>]*>([\s\S]*?)<\/select>/);
  assert.ok(selectMatch, "missing #soundStyle select");

  const values = [...selectMatch[1].matchAll(/<option\b[^>]*value=["']([^"']+)["'][^>]*>/g)].map(
    ([, value]) => value
  );

  assert.deepEqual(values, ["digital", "wood", "stick", "beep", "voice-count"]);
  assert.match(selectMatch[1], /Voice Count/);
});

test("advanced practice, polyrhythm, timer, and preset UI are removed from the shell", () => {
  assert.doesNotMatch(html, /Polyrhythm|Practice|Presets|Timer minutes|Saved presets/);
  assert.doesNotMatch(html, /id=["']timerToggle["']/);
  assert.doesNotMatch(appJs, /timerToggle|toggleTimer|savePresets|loadPresets|polyrhythmEnabled|trainerEnabled|presetList/);
});

test("app imports core scheduler helpers for browser playback", () => {
  assert.match(appJs, /\bcreateSchedule,\s*\n\s*getAudibleEventLevel,\s*\n\s*getScheduleEndTime,\s*\n\s*getVoiceCountToken,/);
  assert.match(appJs, /\bgetScheduleEndTime,/);
  assert.match(appJs, /createSchedule\(\{\s*state: createDefaultState\(\{/);
  assert.match(appJs, /getAudibleEventLevel\(event, app\.state\.muted\)/);
});

test("app wires pattern chain and symbol rhythm controls", () => {
  assert.match(appJs, /function renderPatternSegments\(\) \{/);
  assert.match(appJs, /function renderBeatRhythmEditor\(\) \{/);
  assert.match(appJs, /function updateBeatRhythm\(/);
  assert.match(appJs, /function updatePatternSegment\(/);
  assert.match(appJs, /patternEnabled/);
  assert.match(appJs, /beat-rhythm-current/);
  assert.match(appJs, /beat-rhythm-option/);
});

test("per-beat rhythm editor exposes the complete embedded rhythm library", () => {
  assert.match(html, /Beat Rhythm/);
  assert.match(html, /id=["']beatRhythmEditor["']/);
  assert.match(appJs, /const BEAT_RHYTHM_OPTIONS = \[/);
  const optionBlock = appJs.match(/const BEAT_RHYTHM_OPTIONS = \[([\s\S]*?)\];/);
  assert.ok(optionBlock, "missing BEAT_RHYTHM_OPTIONS");
  const values = [...optionBlock[1].matchAll(/value:\s*"([^"]+)"/g)].map(
    ([, value]) => value
  );
  assert.deepEqual(values, [
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
  ]);
});

test("per-beat rhythm editor draws SVG notation instead of font glyphs", () => {
  assert.match(appJs, /dataset\.beatRhythmToggle/);
  assert.match(appJs, /data-beat-rhythm/);
  assert.match(appJs, /aria-pressed/);
  assert.match(appJs, /function createRhythmNotation\(/);
  assert.match(appJs, /createElementNS\("http:\/\/www\.w3\.org\/2000\/svg", "svg"\)/);
  assert.match(appJs, /classList\.add\("rhythm-card-svg"\)/);
  assert.doesNotMatch(appJs, /symbol:/);
  assert.doesNotMatch(appJs, /textContent = option\.symbol/);
  assert.doesNotMatch(appJs, /createBeatRhythmSelect/);
  assert.doesNotMatch(appJs, /Beat \$\{index \+ 1\} rhythm/);
  assert.doesNotMatch(styles, /Segoe UI Symbol|Noto Music|Arial Unicode MS/);
  assert.doesNotMatch(html, /Note Library/);
  assert.doesNotMatch(appJs, /createNoteChainSchedule/);
});

test("per-beat rhythm editor keeps the note library collapsed by default", () => {
  assert.match(appJs, /activeRhythmPickerIndex:\s*-1/);
  assert.match(appJs, /function createBeatRhythmCurrentButton\(/);
  assert.match(appJs, /className = "beat-rhythm-chain"/);
  assert.match(appJs, /className = "beat-rhythm-current"/);
  assert.match(appJs, /className = "beat-rhythm-picker"/);
  assert.match(appJs, /app\.activeRhythmPickerIndex === index/);
  assert.match(appJs, /app\.activeRhythmPickerIndex = -1;/);
  assert.match(styles, /\.beat-rhythm-chain/);
  assert.match(styles, /\.beat-rhythm-current/);
  assert.match(styles, /\.beat-rhythm-picker/);
  assert.doesNotMatch(appJs, /className = "beat-rhythm-row"/);
  assert.doesNotMatch(styles, /\.beat-rhythm-row/);
  assert.doesNotMatch(styles, /\.beat-rhythm-options\s*\{[\s\S]*overflow-x:\s*auto/);
});

test("tap tempo remains visible in the main interface", () => {
  assert.match(html, /id=["']tapTempo["']/);
  assert.doesNotMatch(styles, /#tapTempo[\s\S]{0,80}display:\s*none;/);
});

test("hardware-inspired interface classes are present", () => {
  assert.match(html, /class=["'][^"']*\bdevice-header\b/);
  assert.match(html, /class=["'][^"']*\brhythm-shell\b/);
  assert.match(styles, /--crt-green:/);
  assert.match(styles, /--control-orange:/);
  assert.match(styles, /\.beat-rhythm-editor/);
  assert.match(styles, /\.beat-rhythm-chain/);
  assert.match(styles, /\.beat-rhythm-current/);
  assert.match(styles, /\.beat-rhythm-option/);
  assert.match(styles, /\.device-header/);
});

test("app uses Web Audio and avoids setInterval for audible timing", () => {
  assert.match(appJs, /AudioContext|webkitAudioContext/);
  assert.match(appJs, /currentTime/);
  assert.doesNotMatch(appJs, /setInterval\s*\(/);
});

test("app schedules lookahead work with setTimeout", () => {
  assert.match(appJs, /LOOKAHEAD_SECONDS/);
  assert.match(appJs, /SCHEDULER_INTERVAL_MS/);
  assert.match(appJs, /setTimeout\s*\(/);
});

test("app retains and cancels scheduled audio nodes", () => {
  assert.match(appJs, /scheduledNodes:\s*new Set\(\)/);
  assert.match(appJs, /function cancelScheduledNodes\(\) \{/);
  assert.match(appJs, /const scheduledNode = \{\s*oscillator,\s*gain\s*\}/);
  assert.match(appJs, /app\.scheduledNodes\.add\(scheduledNode\)/);
  assert.match(appJs, /app\.scheduledNodes\.delete\(scheduledNode\)/);
  assert.match(appJs, /oscillator\.onended\s*=\s*\(\)\s*=>\s*\{/);
  assert.match(appJs, /cancelScheduledNodes\(\);\s*setStatus\("Stopped"\)/);
});

test("voice count sound schedules count syllables from audio samples", () => {
  assert.match(appJs, /function scheduleVoiceCount\(/);
  assert.match(appJs, /const VOICE_COUNT_SAMPLE_URLS = \{/);
  assert.match(appJs, /function loadVoiceCountSamples\(/);
  assert.match(appJs, /fetch\(url\)/);
  assert.match(appJs, /decodeAudioData/);
  assert.match(appJs, /createBufferSource\(\)/);
  assert.match(appJs, /getVoiceCountToken\(event\)/);
  assert.match(appJs, /soundStyle === "voice-count"/);
  assert.doesNotMatch(appJs, /SpeechSynthesisUtterance/);
  assert.doesNotMatch(appJs, /speechSynthesis/);
});

test("voice count audio package includes required syllable samples", () => {
  const voiceDir = new URL("../assets/voice-count/", import.meta.url);
  const files = readdirSync(voiceDir).sort();

  assert.deepEqual(files, [
    "a.wav",
    "and.wav",
    "e.wav",
    "eight.wav",
    "eleven.wav",
    "fifteen.wav",
    "five.wav",
    "four.wav",
    "fourteen.wav",
    "let.wav",
    "nine.wav",
    "one.wav",
    "seven.wav",
    "six.wav",
    "sixteen.wav",
    "ten.wav",
    "thirteen.wav",
    "three.wav",
    "trip.wav",
    "twelve.wav",
    "two.wav",
  ]);

  for (const file of files) {
    assert.ok(statSync(new URL(file, voiceDir)).size > 1000, `${file} is empty`);
  }
});

test("app applies higher output gain for audible styles", () => {
  assert.match(appJs, /const OUTPUT_GAIN = 1\.8;/);
  assert.match(appJs, /const VOICE_SAMPLE_GAIN = 1\.6;/);
  assert.match(appJs, /gainValue \* app\.state\.volume \* OUTPUT_GAIN/);
  assert.match(appJs, /app\.state\.volume \* VOICE_SAMPLE_GAIN/);
});

test("playing edits refresh the active playback schedule", () => {
  assert.match(appJs, /function refreshPlaybackSchedule\(\) \{/);
  assert.match(appJs, /function updateFromControls\(\) \{[\s\S]*refreshPlaybackSchedule\(\);[\s\S]*render\(\);[\s\S]*\}/);
  assert.match(appJs, /function changeTempo\(delta\) \{[\s\S]*refreshPlaybackSchedule\(\);[\s\S]*setStatus/);
  assert.match(appJs, /function handleTapTempo\(\) \{[\s\S]*refreshPlaybackSchedule\(\);[\s\S]*setStatus/);
  assert.match(appJs, /Beat \$\{index \+ 1\}:[\s\S]*refreshPlaybackSchedule\(\);/);
});

test("scheduler does not rebuild early over an active schedule", () => {
  assert.doesNotMatch(appJs, /schedule\.length\s*-\s*16/);
  assert.doesNotMatch(appJs, /app\.scheduledIndex\s*>=\s*app\.schedule\.length[\s\S]{0,120}stopPlayback\(\);/);
});

test("scheduler appends continuous windows without repeating count-in", () => {
  assert.match(appJs, /nextScheduleTime:\s*0/);
  assert.match(appJs, /nextBarIndex:\s*0/);
  assert.match(appJs, /function rebuildSchedule\(\{\s*includeCountIn = true\s*\} = \{\}\) \{/);
  assert.match(appJs, /countInBars: includeCountIn \? app\.state\.countInBars : 0/);
  assert.match(appJs, /app\.nextScheduleTime = getScheduleEndTime\(app\.schedule, app\.startedAt\)/);
  assert.match(appJs, /function appendScheduleWindow\(\) \{/);
  assert.match(appJs, /countInBars: 0/);
  assert.match(appJs, /getScheduleEndTime\(\s*appendedEvents,\s*app\.nextScheduleTime\s*\)/);
  assert.match(appJs, /app\.nextBarIndex \+= SCHEDULE_BARS/);
  assert.match(appJs, /appendScheduleWindow\(\);/);
});

test("app passes bar offsets into appended schedule windows", () => {
  assert.match(appJs, /barOffset:\s*app\.nextBarIndex/);
  assert.doesNotMatch(appJs, /barIndex:\s*event\.barIndex \+ app\.nextBarIndex/);
});

test("app wires keyboard shortcuts and core controls", () => {
  assert.match(appJs, /keydown/);
  assert.match(appJs, /handleShortcut/);
  assert.match(appJs, /elements\.playToggle\.addEventListener\("click", togglePlayback\)/);
  assert.match(appJs, /elements\.tapTempo\.addEventListener\("click", handleTapTempo\)/);
});

test("keyboard shortcuts ignore focused buttons", () => {
  assert.match(appJs, /target instanceof HTMLButtonElement/);
});
