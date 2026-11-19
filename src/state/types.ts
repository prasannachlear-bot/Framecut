// FRAMECUT — core data model

export type AssetKind = "video" | "audio" | "image";
export type TrackKind = "video" | "audio" | "text";
export type ClipType = "video" | "audio" | "image" | "text";

export type Easing =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "bezier";

export interface BezierHandle {
  x1: number; y1: number; x2: number; y2: number;
}

export interface Keyframe {
  t: number;              // local time within clip (seconds)
  value: number;          // scalar; vec props use two keyframe tracks (x/y)
  ease: Easing;
  bezier?: BezierHandle;
}

export interface KeyframeTrack {
  prop: string;           // e.g. "transform.x", "transform.opacity"
  keys: Keyframe[];
}

export interface Transform {
  x: number; y: number;         // offset in fraction of frame (0.5 = center)
  scale: number;                // uniform multiplier (1 = fit)
  rotation: number;             // degrees
  anchorX: number; anchorY: number;
  opacity: number;              // 0..1
}

export interface Crop { l: number; r: number; t: number; b: number } // fractions 0..1

export interface ColorGrade {
  exposure: number;      // stops
  brightness: number;    // -1..1
  contrast: number;      // -1..1
  highlights: number;    // -1..1
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;   // -1..1 (cool..warm)
  tint: number;          // -1..1 (green..magenta)
  saturation: number;    // -1..1
  vibrance: number;      // -1..1
  lift: { r: number; g: number; b: number };     // -1..1
  gamma: { r: number; g: number; b: number };    // -1..1
  gain: { r: number; g: number; b: number };     // -1..1
  hue: number;           // degrees
  fade: number;          // 0..1
  sharpen: number;       // 0..1
  grain: number;         // 0..1
  vignette: number;      // 0..1
  vignetteSoft: number;  // 0..1
  enable: boolean;
}

export interface RGBPoint { x: number; y: number } // 0..1

export interface CurveSet {
  master: RGBPoint[];
  red: RGBPoint[];
  green: RGBPoint[];
  blue: RGBPoint[];
}

export interface LUTRef {
  name: string;
  intensity: number;   // 0..1
  enabled: boolean;
}

export type EffectType =
  | "blur" | "sharpen" | "glow" | "chromaticAberration" | "vignette"
  | "grain" | "noise" | "pixelate" | "rgbSplit" | "hueShift"
  | "grayscale" | "sepia" | "invert" | "posterize" | "mirror";

export interface EffectInstance {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number>;
}

export type TransitionType =
  | "crossDissolve" | "dipToBlack" | "dipToWhite" | "pushLeft" | "pushRight"
  | "slideLeft" | "slideRight" | "zoomIn" | "zoomOut" | "whipPan"
  | "motionBlur" | "lightLeak" | "glitch" | "filmBurn" | "blurDissolve"
  | "spin" | "seamlessZoom" | "rgbSplit" | "maskReveal" | "wipeLeft" | "wipeRight";

export interface TransitionInstance {
  id: string;
  type: TransitionType;
  duration: number;      // seconds, centered on junction
  direction: number;     // -1 / 1 for directional
  intensity: number;     // 0..2
  ease: Easing;
}

export interface AudioSettings {
  volume: number;        // gain 0..2
  pan: number;           // -1..1
  fadeIn: number;        // sec
  fadeOut: number;       // sec
  muted: boolean;
  duck: number;          // 0..1 ducking amount when other audio plays (0 = off)
}

export interface TextGrad {
  content: string;
  fontFamily: string;
  fontWeight: number;
  italic: boolean;
  fontSize: number;      // fraction of frame height
  letterSpacing: number; // em
  lineHeight: number;
  align: "left" | "center" | "right";
  color: string;
  bg: string;            // "none" disables background box
  bgPadding: number;     // em
  strokeColor: string;
  strokeWidth: number;   // em
  shadowColor: string;
  shadowBlur: number;
  shadowXY: number;
  opacity: number;
  inAnim: TextAnim;
  outAnim: TextAnim;
  animDuration: number;  // sec
  animMode: "whole" | "word" | "char";
}

export type TextAnim =
  | "none" | "fade" | "slideUp" | "slideDown" | "slideLeft" | "slideRight"
  | "typewriter" | "tracking" | "scaleUp" | "pop";

export interface Clip {
  id: string;
  trackId: string;
  type: ClipType;
  name: string;
  assetId?: string;

  start: number;         // timeline seconds
  duration: number;      // timeline seconds
  inPoint: number;       // source offset seconds
  speed: number;         // 0.25..4
  extractedAudio: boolean; // video element audio muted (moved to A-track clip)

  transform: Transform;
  crop: Crop;
  blendMode: GlobalCompositeOperation;
  color: ColorGrade;
  curves: CurveSet;
  lut?: LUTRef;
  effects: EffectInstance[];
  audio: AudioSettings;
  text?: TextGrad;

  transitionIn?: TransitionInstance;   // transition shared with previous clip on same track
  keyframes: KeyframeTrack[];
  groupId?: string;      // link group (A/V sync groups, multi-select grouping)
  frozenAt?: number;     // freeze-frame source time
}

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;          // V1, V2, A1...
  visible: boolean;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  volume: number;        // audio tracks / master mixer row
  pan: number;
}

export interface Marker {
  id: string;
  t: number;
  label: string;
}

export interface Bin {
  id: string;
  name: string;
}

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  mimeType: string;
  blobId: string;        // key into blob store
  duration: number;      // seconds (images: computed at clip-create time default 5s)
  width: number;
  height: number;
  fps: number;
  thumbnail?: string;    // dataURL
  peaks?: number[];      // waveform peaks (max abs per bucket)
  binId?: string;
  hasAudio: boolean;
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
  tracks: Track[];
  clips: Record<string, Clip>;
  markers: Marker[];
  bins: Bin[];
  customFonts: { name: string; blobId: string }[];
  savedColorPresets: { name: string; color: ColorGrade; curves: CurveSet }[];
}

export const defaultCurve = (): CurveSet => ({
  master: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  red: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  green: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
});

export const defaultColor = (): ColorGrade => ({
  exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0,
  whites: 0, blacks: 0, temperature: 0, tint: 0, saturation: 0, vibrance: 0,
  lift: { r: 0, g: 0, b: 0 }, gamma: { r: 0, g: 0, b: 0 }, gain: { r: 0, g: 0, b: 0 },
  hue: 0, fade: 0, sharpen: 0, grain: 0, vignette: 0, vignetteSoft: 0.4,
  enable: false,
});

export const defaultTransform = (): Transform => ({
  x: 0, y: 0, scale: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5, opacity: 1,
});

export const defaultAudio = (): AudioSettings => ({
  volume: 1, pan: 0, fadeIn: 0, fadeOut: 0, muted: false, duck: 0,
});

export const defaultText = (content = "Your Title"): TextGrad => ({
  content,
  fontFamily: "Inter",
  fontWeight: 700,
  italic: false,
  fontSize: 0.09,
  letterSpacing: 0,
  lineHeight: 1.2,
  align: "center",
  color: "#ffffff",
  bg: "none",
  bgPadding: 0.4,
  strokeColor: "#000000",
  strokeWidth: 0,
  shadowColor: "#000000",
  shadowBlur: 8,
  shadowXY: 2,
  opacity: 1,
  inAnim: "fade",
  outAnim: "fade",
  animDuration: 0.5,
  animMode: "whole",
});

export const cloneClip = (c: Clip): Clip =>
  JSON.parse(JSON.stringify(c)) as Clip;

export function newProject(name = "Untitled Project"): Project {
  const now = Date.now();
  return {
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    settings: { width: 1920, height: 1080, fps: 30 },
    tracks: [
      { id: "T1", kind: "text", name: "TXT", visible: true, muted: false, solo: false, locked: false, volume: 1, pan: 0 },
      { id: "V3", kind: "video", name: "V3", visible: true, muted: false, solo: false, locked: false, volume: 1, pan: 0 },
      { id: "V2", kind: "video", name: "V2", visible: true, muted: false, solo: false, locked: false, volume: 1, pan: 0 },
      { id: "V1", kind: "video", name: "V1", visible: true, muted: false, solo: false, locked: false, volume: 1, pan: 0 },
      { id: "A1", kind: "audio", name: "A1", visible: true, muted: false, solo: false, locked: false, volume: 1, pan: 0 },
      { id: "A2", kind: "audio", name: "A2", visible: true, muted: false, solo: false, locked: false, volume: 1, pan: 0 },
    ],
    clips: {},
    markers: [],
    bins: [{ id: "bin-root", name: "Media" }],
    customFonts: [],
    savedColorPresets: [],
  };
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// ---- timeline helpers ----

export const isVisual = (c: Clip) => c.type === "video" || c.type === "image" || c.type === "text";

export function clipsOnTrack(clips: Record<string, Clip>, trackId: string): Clip[] {
  return Object.values(clips)
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.start - b.start);
}

export function sequenceEnd(clips: Record<string, Clip>): number {
  let end = 0;
  for (const c of Object.values(clips)) end = Math.max(end, c.start + c.duration);
  return end;
}

export function trackDuration(trackClips: Clip[]): number {
  return trackClips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
}
