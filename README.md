# SketchLab

**Draw a machine, press Play, and run the experiment.** SketchLab is a browser
physics-experiment notebook: sketch ramps, balls, boxes and pendulums, simulate
them with a real rigid-body engine, scrub back through the recorded run, fork
the experiment, change one thing (like gravity), and compare the two runs with
motion and energy charts.

Everything runs client-side. No accounts, no servers, no paid APIs, no GPU.

![Stack](https://img.shields.io/badge/stack-React%2018%20%2B%20TypeScript%20%2B%20Matter.js-blue)

## Why it exists

Physics simulators usually start from equations or pre-built scenes. SketchLab
starts from a **drawing**: the fastest way to ask "what happens if...?" is to
sketch the machine and watch it go. It is an editable experiment notebook, not
a chatbot explaining physics and not a photo-to-science guesser.

## Features

- **Drawing grammar** - ball, box, ramp (static bar), pendulum (anchor + bob),
  pin (pivot a moving body around any clicked point), erase, select/move.
- **Live simulation** - Matter.js rigid-body engine at a fixed 60 Hz timestep
  with tuned solver iterations.
- **Time scrubbing** - every run is recorded; drag the timeline to any frame
  and press Play to resume the run from that exact state.
- **Fork and compare** - copy an experiment, change gravity, friction or
  geometry, and overlay the two runs' charts.
- **Motion and energy charts** - speed, height, kinetic, potential and total
  energy for any selected object, or system energy totals. Gravity is
  calibrated against the engine's measured acceleration so KE and PE stay
  consistent (100 px = 1 m, values in sim joules).
- **Undo/redo** for every edit (Ctrl+Z / Ctrl+Y).
- **Local persistence** - experiments are saved in `localStorage`.

## Honest limits

- 2D rigid bodies only; no soft bodies, fluids, joints beyond pins/rods.
- Pendulum rods and pins are stiff spring constraints, not idealized rods, so
  they can drift a few percent over long runs.
- Energy figures are in consistent sim units for comparison, not calibrated
  laboratory values.
- The layout is desktop-first; it works on a phone but is cramped.

## Develop

```bash
npm install
npm run dev       # local dev server
npm test          # 18 unit tests (physics, history, scene model)
npm run build     # type-check + production bundle in dist/
node e2e/verify.mjs   # headless-Chromium end-to-end smoke test with screenshots
```

## Deploy (GitHub Pages, free)

The built app is fully static, so any static host works. For GitHub Pages:
build with `npm run build`, push `dist/` to a `gh-pages` branch, and set
Settings -> Pages -> Deploy from a branch -> `gh-pages` / root. The site is
then live at `https://<user>.github.io/sketchlab/`. (`vite.config.ts` uses a
relative base, so the project-page path works without extra config.)

## Architecture

```
src/
  model/    scene types (the drawing grammar), undo history, samples, persistence
  physics/  matter-js world compiler, per-frame recorder, energy metrics
  state/    useSketchLab: experiments, playback loop, fork/compare, selection
  ui/       CanvasView (rendering + drawing gestures), Toolbar, TopBar,
            Inspector (per-object tuning), Charts (time-series overlay)
```

Editing rebuilds the simulation from the scene model; playback only advances
and records. That separation is what makes scrubbing, resuming mid-run, and
fork-compare safe.

Physics engine: [Matter.js](https://github.com/liabru/matter-js) (MIT).
