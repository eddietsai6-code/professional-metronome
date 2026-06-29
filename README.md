# Professional Metronome

A dependency-free static web metronome for music practice and teaching. It uses Web Audio lookahead scheduling so audible clicks are scheduled against `AudioContext.currentTime` instead of relying on direct JavaScript timer callbacks.

This is a browser app that can be committed to GitHub and hosted as static files. It is not an iOS, macOS, or native app package.

## Features

- 30 to 280 BPM
- BPM and QPM calculation modes
- 1 to 16 beats per bar
- Beat units: 2, 4, 8, 16, 32
- Per-beat accent states: accent, secondary, normal, rest
- Subdivisions: eighth, triplet, sixteenth, dotted feel
- Count-in from 0 to 8 bars
- Visual beat grid and pendulum-style mode
- Tap tempo
- Synthesized Web Audio click styles
- Rhythm trainer with fixed and random mute behavior
- Practice timer
- Local presets stored in the browser
- Keyboard shortcuts for stage-style operation
- Responsive portrait and landscape layouts

## Quick Start

```powershell
npm run serve
```

Open:

```text
http://127.0.0.1:4192/
```

Click `Play` once so the browser can start audio from a user gesture.

## Tests

```powershell
npm test
```

The test suite covers tempo math, BPM/QPM timing, meter normalization, event generation, subdivisions, rests, count-in, rhythm trainer muting, tap tempo, preset validation, scheduler guardrails, keyboard shortcuts, timer hooks, and static app wiring.

## GitHub Hosting

The app is plain HTML, CSS, and JavaScript under this directory:

```text
professional-metronome/
```

For GitHub Pages or another static host, publish this folder as the site root. No build step is required.

## Timing Notes

The app uses a short JavaScript lookahead loop to schedule Web Audio nodes ahead of playback time. The audible click timing comes from the Web Audio timeline. Browser CPU load, suspended tabs, Bluetooth audio latency, and device output buffering can still affect what the user hears.

## Reference Notes

This project was designed after reviewing Pro Metronome product behavior, the user-provided metronome manual, `cwilso/metronome`, `padenot/metro`, and the Web.dev article `A Tale of Two Clocks`. It borrows product ideas and timing principles only; it does not copy proprietary Pro Metronome source, assets, sounds, or UI.

## License

MIT
