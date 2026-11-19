# LIMITATIONS — what the browser can and cannot do (yet)

FRAMECUT implements every visible control as a real operation. A few advanced
requests exceed what current browser media engines provide; where that happened
we chose the honest option (disabled control labelled "future feature") plus the
best practical alternative, rather than a placebo.

## 1. Reverse playback — not supported
`HTMLVideoElement` cannot play backwards; a true reverse needs every frame
decoded and presented in reverse order (a WebGL frame-cache pipeline). It is
labelled as a future feature in the Inspector.

**Workaround:** cut the clip into short segments and apply the same source
segment as separate stepped cuts, or use **Freeze Frame** for hold moments.

## 2. Export runs in real time via MediaRecorder
Instead of shipping FFmpeg.wasm (~30 MB + slow wasm encode), export captures the
live composited canvas + Web Audio mix through `MediaRecorder`.

- Resolution (up to 4K), fps, bitrate, quality and container are real settings.
- MP4 (H.264) is used when the browser advertises it (current Chrome/Edge);
  otherwise the pipeline falls back to WebM (VP9/VP8) and tells you.
- The render takes the sequence duration (1× realtime) and needs the tab kept
  visible (background tabs throttle rAF).
- Frame-rate is capture-paced; for strict frame-accurate VFR-free output a
  frame-serial export (video frame callback + `Track.requestFrame`) is the
  identified next step — see `src/export/exporter.ts`.

## 3. Stabilisation — future feature
Requires per-frame optical-flow analysis on the GPU; the Inspector carries an
explicit "future feature" note instead of a dummy slider.

## 4. Colour curve set scope
Implemented: custom Bézier-style control-point curves for Master (luma),
R, G, B applied in the grade shader, plus hue rotation. Not implemented:
Hue-vs-Sat and Hue-vs-Hue per-band curves (needs a per-pixel hue lookup table
pass — planned as an addition to `colorPass.ts`, the plumbing is already a
2D texture).

## 5. Audio Speed / Pitch / Noise Reduction
- Speed is real (clip Speed drives `playbackRate` for audio too, pitch-stretched
  by the browser).
- Dedicated pitch-shift and spectral noise-reduction would require running the
  mix through an `AudioWorklet` DSP chain; not included (marked in the Audio
  workspace instead of being faked).

## 6. Codec support follows the browser
Import support is bounded by the browser's demuxers (MP4/MOV/WebM video, common
audio, PNG/JPG/GIF/WebP). H.265 export appears only if the browser supports it.

## 7. Transitions on the same track
Transitions are attached to the junction between adjacent clips (drop the badge
on the cut). Blend-based transitions use dual buffers; the "distortion" class of
effects is limited to the mesh-free samples in the shader (CA, RGB split,
pixelate, mirror); true mesh warp (wave/lens) is a future pass.
