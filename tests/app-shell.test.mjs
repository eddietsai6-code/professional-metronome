import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");

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
  "trainerEnabled",
  "timerMinutes",
  "presetName",
  "savePreset",
  "presetList",
  "statusText",
  "muteToggle",
  "tempoMode",
  "tempoReadout",
  "tempoModeLabel",
  "meterReadout",
  "subdivisionReadout",
  "trainerPlayBars",
  "trainerMuteBars",
  "trainerRandomPercent",
  "trainerHideVisuals",
  "timerToggle",
  "pendulum",
  "patternEnabled",
  "patternSegments",
  "addPatternSegment",
  "polyrhythmEnabled",
  "polyrhythmScope",
  "polyrhythmPulses",
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

test("app shell has semantic regions for display, controls, tools, practice, and presets", () => {
  assert.match(html, /<main\b[^>]*class=["'][^"']*\bmetronome-app\b/);
  assert.match(html, /<section\b[^>]*class=["'][^"']*\bdisplay-panel\b/);
  assert.match(html, /<section\b[^>]*class=["'][^"']*\bcontrol-panel\b/);
  assert.match(html, /<section\b[^>]*class=["'][^"']*\btool-grid\b/);
  assert.match(html, /<section\b[^>]*class=["'][^"']*\bpractice-panel\b/);
  assert.match(html, /<section\b[^>]*class=["'][^"']*\bpreset-panel\b/);
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

test("browser state enables random trainer mode from random mute percent", () => {
  assert.match(
    appJs,
    /mode:\s*Number\(elements\.trainerRandomPercent\.value\)\s*>\s*0\s*\?\s*"random"\s*:\s*"fixed"/
  );
});

test("preset saves only update browser state after storage succeeds", () => {
  assert.match(appJs, /function savePresets\(presets = app\.presets\) \{/);
  assert.match(appJs, /return false;/);
  assert.match(appJs, /return true;/);
  assert.match(appJs, /if \(!savePresets\(\[\.\.\.app\.presets, preset\]\)\) \{\s*return;\s*\}/);
});

test("timer control toggles the active practice countdown", () => {
  assert.match(appJs, /function formatTime\(seconds\) \{/);
  assert.match(appJs, /function toggleTimer\(\) \{/);
  assert.match(appJs, /elements\.playToggle\.addEventListener\("click", togglePlayback\)/);
  assert.match(appJs, /elements\.timerToggle\.addEventListener\("click", toggleTimer\)/);
});

test("app imports core scheduler helpers for browser playback", () => {
  assert.match(appJs, /\bcreateSchedule,\s*\n\s*getAudibleEventLevel,\s*\n\s*getBeatDurationSeconds,/);
  assert.match(appJs, /\bgetScheduleEndTime,/);
  assert.match(appJs, /createSchedule\(\{\s*state: createDefaultState\(\{/);
  assert.match(appJs, /getAudibleEventLevel\(event, app\.state\.muted\)/);
});

test("app wires pattern chain and polyrhythm controls", () => {
  assert.match(appJs, /function renderPatternSegments\(\) \{/);
  assert.match(appJs, /function updatePatternSegment\(/);
  assert.match(appJs, /patternEnabled/);
  assert.match(appJs, /polyrhythmEnabled/);
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

test("app wires keyboard shortcuts and timer controls", () => {
  assert.match(appJs, /keydown/);
  assert.match(appJs, /handleShortcut/);
  assert.match(appJs, /startTimer/);
  assert.match(appJs, /stopTimer/);
});

test("keyboard shortcuts ignore focused buttons", () => {
  assert.match(appJs, /target instanceof HTMLButtonElement/);
});
