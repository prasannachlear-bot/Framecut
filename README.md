# FRAMECUT — Professional Browser-Based Video Editor

FRAMECUT is a timeline-driven, professional-grade video editing web application.
It is a real editing tool — import, cut, trim, transition, title, mix, grade,
keyframe and export video sequences — built entirely in the browser, no server.

![stack](https://img.shields.io/badge/stack-React%2018%20·%20TypeScript%20·%20Vite%20·%20Zustand-a5f45b)

## Run it

```bash
npm install
npm run dev        # → http://localhost:5173
# or production build:
npm run build && npm run preview
```

Use a Chromium-based browser (Chrome / Edge) for media decode + export support.
Everything runs client-side: media never leaves your machine, and projects are
persisted to IndexedDB.

## Workspace

| Area | What lives there |
| --- | --- |
| Top bar | project name, new / save / open, undo / redo, sequence settings, Export |
| Left panel (tabs) | **Media** (bins, import, preview), **Transitions** (21), **Effects** (15 stackable) |
| Center top | preview monitor — canvas compositor + WebGL2 grade pass, transport with loop, frame step, master volume, compare split |
| Center bottom (dock tabs) | **Timeline**, **Color** (grade + wheels + curves + LUTs + 4 scopes), **Audio** (mixer, ducking, beat sync) |
| Right panel | Inspector: Transition · Transform · Video · Colour · Text · Audio · Effects · Keyframes |

## Editing engine

- **Multitrack timeline** — V1–Vn, A1–An + dedicated text track: drag clips between
  and across tracks, trim from both ends, split at playhead (S), ripple delete,
  copy/paste/duplicate, grouping + A/V unlink, snap (edges / playhead / markers),
  magnetic behaviour, zoom 4–400 px/s, scrub-jogging, frame stepping (←/→), markers.
- **Renderer** — every frame is composited from scratch by `renderFrame`
  (`src/render/renderer.ts`): per-clip media elements synced to the playhead,
  crop/transform/opacity/blend, keyframed properties, transitions composited from
  dual buffers, text layers drawn on top.
- **Colour engine** — one shared WebGL2 pass (`colorPass.ts`) applies exposure,
  LGG wheels, temp/tint, HSL, vibrance, curves (RGBA + master), 3D `.cube` LUTs,
  vignette, grain, sharpen, chromatic aberration, glow, pixelate … with a
  split-screen compare mode. Scopes (parade / waveform / vectorscope /
  histogram) are computed live from the composite.
- **Audio engine** — Web Audio graph `element → clip gain → pan → track gain →
  master`; per-clip volume, balance, fades, **ducking**, track mute/solo,
  beat markers + snap-to-beat alignment, real waveforms decoded from the files.
- **Text engine** — full typography (family, weight, tracking, line height,
  align, colour, background box, stroke, shadow), in/out animations
  (fade/slide/typewriter/tracking/scale/pop) at whole/word/character scope,
  custom font loading via the FontFace API.
- **Export** — canvas + audio are captured through MediaRecorder; codec probed
  from the browser (MP4/H.264 when supported, WebM/VP9 fallback), with
  resolution (480p–4K), aspect (16:9 / 9:16 / 1:1 / 4:5 / custom), FPS
  24–60, bitrate, quality and progress with live size estimate, plus a final
  preview and download.
- **Persistence** — projects (structure + all asset blobs + LUTs + fonts) save to
  and reopen from IndexedDB; full undo/redo history (100 steps).

## Architecture

```
src/
  state/        types.ts (data model), store.ts (Zustand + undo/redo),
                ops.ts (editing operations), keyframes.ts (kinetics)
  media/        importer.ts (probe, thumbnails, waveform peaks), urls.ts
  render/       renderer.ts (compositor + media sync), colorPass.ts (WebGL2 grade),
                transitions.ts (21 GPU/CPU transitions), textRenderer.ts,
                effectsDefs.ts, scopes.ts
  audio/        engine.ts (Web Audio graph, fades, ducking)
  export/       exporter.ts (MediaRecorder pipeline)
  lut/          parseCube.ts (.cube 3D LUT)
  storage/      db.ts (IndexedDB)
  ui/           TopBar, LibraryPanels, PreviewMonitor, Timeline, Inspector,
                ColorWorkspace, AudioWorkspace, ExportDialog, ProjectDialog, widgets
```

Undo/redo works by structural snapshots of the project document — the render
loop reads the latest store state every frame, so every edit is immediately
visible.

## Honest limitations

Browser media engines impose real constraints. We mark what is not possible
instead of faking it. See **[docs/LIMITATIONS.md](docs/LIMITATIONS.md)**.
