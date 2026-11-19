// FRAMECUT render core — composites video, images, text and transitions onto a
// 2D canvas at the project resolution. All colour/effects work goes through the
// shared WebGL ColorPass. Used by both the live preview and the export pipeline.
import { useStore } from "../state/store";
import {
  Asset, Clip, Project, clipsOnTrack, isVisual,
} from "../state/types";
import { ColorPass } from "./colorPass";
import type { PassOpts } from "./colorPass";
import { drawTransition } from "./transitions";
import { drawTextClip } from "./textRenderer";
import { audioEngine } from "../audio/engine";
import { urlFor } from "../media/urls";
import { evaluateKeyframes, evalEase } from "../state/keyframes";

export const colorPass = new ColorPass();

const elements = new Map<string, HTMLMediaElement>();
const images = new Map<string, HTMLImageElement>();
let bufA = document.createElement("canvas");
let bufB = document.createElement("canvas");
let lastSeekWarn = 0;

function ensureMediaEl(clip: Clip, asset: Asset): HTMLMediaElement {
  let el = elements.get(clip.id);
  if (!el) {
    el = document.createElement(clip.type === "audio" ? "audio" : "video") as HTMLMediaElement;
    el.preload = "auto";
    const url = urlFor(asset.id);
    if (url) el.src = url;
    (el as any).playsInline = true;
    elements.set(clip.id, el);
    if (asset.kind !== "image") audioEngine.attach(clip.id, el, clip.trackId);
  }
  return el;
}

export function getMediaEl(clipId: string): HTMLMediaElement | undefined {
  return elements.get(clipId);
}

function ensureImage(asset: Asset): HTMLImageElement {
  let img = images.get(asset.id);
  if (!img) {
    img = new Image();
    const url = urlFor(asset.id);
    if (url) img.src = url;
    images.set(asset.id, img);
  }
  return img;
}

function activeWindow(c: Clip, next: Clip | undefined, prev: Clip | undefined) {
  const tDuration = next?.transitionIn ? next.transitionIn.duration / 2 : 0;
  const bExt = c.transitionIn ? c.transitionIn.duration / 2 : 0;
  return {
    from: c.start - bExt,
    to: c.start + c.duration + tDuration - 1e-4,
  };
}

function buildPassOpts(
  clip: Clip,
  curvePts: any,
  compareSplit: number,
  time: number
): PassOpts {
  const g = clip.color;
  let blurPx = 0, glow = 0, ca = 0, pixelate = 0, rgbSplit = 0, noise = 0,
    mirror = 0, posterize = 0, hueShift = 0, gray = 0, sepia = 0, invert = 0,
    vig = g.vignette, vigSoft = g.vignetteSoft, sharpen = g.sharpen, grain = g.grain;
  for (const e of clip.effects) {
    if (!e.enabled) continue;
    const p = e.params;
    switch (e.type) {
      case "blur": blurPx += p.px ?? 0; break;
      case "sharpen": sharpen += p.amount ?? 0; break;
      case "glow": glow += p.amount ?? 0; break;
      case "chromaticAberration": ca += p.amount ?? 0; break;
      case "rgbSplit": rgbSplit += p.amount ?? 0; break;
      case "vignette": vig = Math.max(vig, p.amount ?? 0.5); vigSoft = p.soft ?? 0.4; break;
      case "grain": grain += p.amount ?? 0; break;
      case "noise": noise += p.amount ?? 0; break;
      case "pixelate": pixelate = p.px ?? 12; break;
      case "mirror": mirror = Math.max(mirror, p.on ?? 0); break;
      case "hueShift": hueShift += p.deg ?? 0; break;
      case "grayscale": gray = Math.max(gray, p.amount ?? 1); break;
      case "sepia": sepia = Math.max(sepia, p.amount ?? 1); break;
      case "invert": invert = Math.max(invert, p.amount ?? 1); break;
      case "posterize": posterize = p.levels ?? 6; break;
    }
  }
  const store = useStore.getState();
  const lut = clip.lut?.enabled
    ? store.luts.find((l) => l.name === clip.lut!.name)
    : undefined;
  if (lut) colorPass.ensureLut(lut.data, lut.size, lut.name);

  return {
    exposure: g.exposure, contrast: g.contrast, saturation: g.saturation,
    vibrance: g.vibrance, temp: g.temperature, tint: g.tint, hue: g.hue,
    highlights: g.highlights, shadows: g.shadows, whites: g.whites,
    blacks: g.blacks, brightness: g.brightness,
    lift: [g.lift.r, g.lift.g, g.lift.b],
    gamma: [g.gamma.r, g.gamma.g, g.gamma.b],
    gain: [g.gain.r, g.gain.g, g.gain.b],
    fade: g.fade, sharpen: Math.min(3, sharpen), grain: Math.min(1, grain),
    vigAmount: _scaledKey(clip, "color.vignette", vig), vigSoft,
    blurPx, glow, ca, pixelate, rgbSplit, noise, mirror, posterize, hueShift,
    gray, sepia, invert,
    lutMix: lut && clip.lut!.enabled ? clip.lut!.intensity : 0,
    compareSplit,
    time,
  };
}

function _scaledKey(clip: Clip, prop: string, base: number) { return base; }

/** Source time (seconds within asset) for a clip at timeline time t. */
export function clipSourceTime(clip: Clip, t: number): number {
  if (clip.frozenAt != null) return clip.frozenAt;
  if (t <= clip.start) return clip.inPoint; // pre-roll (transition lead-in)
  return clip.inPoint + (t - clip.start) * clip.speed;
}

function kval(clip: Clip, localT: number, prop: string, base: number): number {
  const kt = clip.keyframes.find((k) => k.prop === prop);
  if (!kt || kt.keys.length === 0) return base;
  const vals = evaluateKeyframes([kt], localT);
  return vals[prop];
}

export interface RenderOpts {
  compareSplit?: number;
  skipAudio?: boolean;
}

/**
 * Render one frame of the project at time t into ctx (canvas sized to target).
 */
export function renderFrame(
  project: Project,
  assets: Record<string, Asset>,
  t: number,
  playing: boolean,
  ctx: CanvasRenderingContext2D,
  opts: RenderOpts = {}
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const compareSplit = opts.compareSplit ?? 0;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  const drawTracks = project.tracks
    .filter((tr) => tr.kind !== "audio")
    .sort((a, b) => {
      // video bottom-to-top (V1 first), text layers on top
      if (a.kind === "text" && b.kind !== "text") return 1;
      if (b.kind === "text" && a.kind !== "text") return -1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });

  const anyAudioActiveRefs = collectAudioActive(project, t);

  for (const track of drawTracks) {
    if (!track.visible) continue;
    const clips = clipsOnTrack(project.clips, track.id);
    if (!clips.length) continue;

    if (clips[0].type === "text") {
      for (const c of clips) {
        if (t >= c.start && t < c.start + c.duration && c.text) {
          drawTextClip(ctx, c, W, H, { localT: t - c.start, duration: c.duration });
        }
      }
      continue;
    }

    // find overlapping pair (transition) or singles
    const pairs: { c: Clip; next?: Clip }[] = [];
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      const next = clips[i + 1];
      const prev = clips[i - 1];
      const win = activeWindow(c, next, prev);
      if (t >= win.from && t < win.to) pairs.push({ c, next });
    }

    if (pairs.length === 2 && pairs[1].c.transitionIn) {
      const A = pairs[0].c, B = pairs[1].c;
      const d = B.transitionIn!.duration;
      const p0 = (t - (B.start - d / 2)) / Math.max(d, 1e-3);
      const p = Math.min(1, Math.max(0, evalEase(B.transitionIn!.ease, p0)));
      renderClipPair(ctx, project, assets, A, B, t, p, W, H, playing, compareSplit, opts);
      syncMedia(project, [A, B], t, playing, assets);
    } else {
      for (const { c } of pairs) {
        drawSingleClip(ctx, project, assets, c, t, W, H, playing, compareSplit, opts);
      }
      syncMedia(project, pairs.map((x) => x.c), t, playing, assets);
    }
  }

  // audio-only tracks: sync playback (they are audible but not drawn)
  const audioTrackIds = new Set(project.tracks.filter((tr) => tr.kind === "audio").map((tr) => tr.id));
  const audioClips = Object.values(project.clips).filter((c) => audioTrackIds.has(c.trackId));
  syncMedia(project, audioClips, t, playing, assets);

  updateMasterAudio(project, t, playing, anyAudioActiveRefs);
}

function collectAudioActive(project: Project, t: number): boolean {
  return Object.values(project.clips).some((c) => {
    if (c.type === "text") return false;
    const tr = project.tracks.find((x) => x.id === c.trackId);
    if (!tr || tr.muted || c.audio.muted) return false;
    return t >= c.start && t < c.start + c.duration;
  });
}

function updateMasterAudio(project: Project, t: number, playing: boolean, anyActive: boolean) {
  const audible: Clip[] = Object.values(project.clips).filter((c) => {
    if (c.type === "text") return false;
    return t >= c.start - 1 && t < c.start + c.duration + 1;
  });
  audioEngine.update(project, audible, t, playing, anyActive);
}

function syncMedia(
  project: Project,
  clips: Clip[],
  t: number,
  playing: boolean,
  assets: Record<string, Asset>
) {
  for (const clip of clips) {
    if (clip.type === "text" || !clip.assetId) continue;
    const asset = assets[clip.assetId];
    if (!asset) continue;
    const el = ensureMediaEl(clip, asset);
    const near = t >= clip.start - 2 && t <= clip.start + clip.duration + 2;
    if (!near) {
      if (!el.paused) el.pause();
      continue;
    }
    const srcT = Math.max(0, clipSourceTime(clip, t));
    const speed = Math.min(4, Math.max(0.25, clip.speed));
    const want = clip.frozenAt != null ? clip.frozenAt : srcT;
    const isAudioKind = clip.type === "audio" || asset.kind === "audio";
    el.playbackRate = isAudioKind ? 1 : speed;

    const inWindow = t >= clip.start - 0.001 && t < clip.start + clip.duration + 0.001;
    const preplay = !inWindow && clip.transitionIn && t >= clip.start;

    if (playing && (inWindow || preplay)) {
      if (el.paused) {
        try { el.currentTime = want; } catch {}
        el.play().catch(() => {});
      } else {
        const drift = Math.abs(el.currentTime - want);
        if (drift > 0.34 && !clip.frozenAt) {
          try { el.currentTime = want; } catch {}
        }
      }
    } else {
      if (!el.paused) el.pause();
      const drift = Math.abs(el.currentTime - want);
      const anyel = el as any;
      if (drift > 1 / project.settings.fps && !anyel.__seeking) {
        anyel.__seeking = true;
        try { el.currentTime = Math.min(want, Math.max(0, (asset.duration || 0) - 1e-3)); } catch {}
        el.onseeked = el.onseeked = () => { (el as any).__seeking = false; };
        setTimeout(() => { (el as any).__seeking = false; }, 500);
      }
    }
  }
}

function drawSingleClip(
  ctx: CanvasRenderingContext2D,
  project: Project,
  assets: Record<string, Asset>,
  clip: Clip,
  t: number,
  W: number,
  H: number,
  playing: boolean,
  compareSplit: number,
  opts: RenderOpts
) {
  const localT = t - clip.start;
  if (clip.type === "text") {
    if (clip.text) drawTextClip(ctx, clip, W, H, { localT, duration: clip.duration });
    return;
  }

  const asset = clip.assetId ? assets[clip.assetId] : undefined;
  if (!asset) return;

  let src: CanvasImageSource | null = null;
  let srcW = asset.width, srcH = asset.height;

  if (clip.type === "video") {
    const el = ensureMediaEl(clip, asset) as HTMLVideoElement;
    srcW = el.videoWidth || asset.width || 1920;
    srcH = el.videoHeight || asset.height || 1080;
    if (el.readyState < 2) return;
    src = el;
  } else if (clip.type === "image") {
    const img = ensureImage(asset);
    if (!img.complete || !img.naturalWidth) return;
    srcW = img.naturalWidth; srcH = img.naturalHeight;
    src = img;
  }
  if (!src) return;

  const localT2 = t - clip.start;

  const hasKf = clip.keyframes.some((k) => k.keys.length);
  const opacity = hasKf
    ? kval(clip, localT2, "transform.opacity", clip.transform.opacity)
    : clip.transform.opacity;
  const tx = hasKf ? kval(clip, localT2, "transform.x", clip.transform.x) : clip.transform.x;
  const ty = hasKf ? kval(clip, localT2, "transform.y", clip.transform.y) : clip.transform.y;
  const sc = hasKf ? kval(clip, localT2, "transform.scale", clip.transform.scale) : clip.transform.scale;
  const rot = hasKf ? kval(clip, localT2, "transform.rotation", clip.transform.rotation) : clip.transform.rotation;

  const sw = srcW * (1 - clip.crop.l - clip.crop.r);
  const sh = srcH * (1 - clip.crop.t - clip.crop.b);
  const sx = srcW * clip.crop.l;
  const sy = srcH * clip.crop.t;
  if (sw < 2 || sh < 2) return;

  const fit = Math.min(W / sw, H / sh);
  const dw = sw * fit * sc;
  const dh = sh * fit * sc;
  const cx = W / 2 + tx * W;
  const cy = H / 2 + ty * H;

  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
  ctx.globalCompositeOperation = clip.blendMode || "source-over";
  ctx.translate(cx, cy);
  ctx.rotate((rot * Math.PI) / 180);

  const g = clip.color;
  const luts = useStore.getState().luts;
  const lutOn = clip.lut?.enabled && luts.some((l) => l.name === clip.lut!.name);
  const effectsOn = clip.effects.some((e) => e.enabled);
  const graded = (g.enable || effectsOn || lutOn);

  if (graded && colorPass.hasContext) {
    const passOpts = buildPassOpts(clip, clip.curves, compareSplit, t);
    const out = colorPass.run(src, Math.round(sw), Math.round(sh), passOpts, clip.curves);
    ctx.drawImage(out, -dw / 2, -dh / 2, dw, dh);
  } else {
    ctx.drawImage(src, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  }
  ctx.restore();
  void localT;
}

function renderClipPair(
  ctx: CanvasRenderingContext2D,
  project: Project,
  assets: Record<string, Asset>,
  A: Clip,
  B: Clip,
  t: number,
  p: number,
  W: number,
  H: number,
  playing: boolean,
  compareSplit: number,
  opts: RenderOpts
) {
  if (bufA.width !== W || bufA.height !== H) {
    bufA.width = W; bufA.height = H;
    bufB.width = W; bufB.height = H;
  }
  const aCtx = bufA.getContext("2d")!;
  const bCtx = bufB.getContext("2d")!;
  aCtx.clearRect(0, 0, W, H);
  bCtx.clearRect(0, 0, W, H);
  drawSingleClip(aCtx, project, assets, A, t, W, H, playing, 0, opts);
  drawSingleClip(bCtx, project, assets, B, t, W, H, playing, 0, opts);
  drawTransition(
    ctx,
    B.transitionIn!.type,
    p,
    B.transitionIn!.direction,
    B.transitionIn!.intensity,
    bufA,
    bufB,
    W,
    H,
    t
  );
}

export function pauseAllMedia() {
  for (const el of elements.values()) el.pause();
}

export function destroyMediaEl(clipId: string) {
  const el = elements.get(clipId);
  if (el) {
    el.pause();
    (el as any).src = "";
    audioEngine.detach(clipId);
    elements.delete(clipId);
  }
}
