import { EffectType } from "../state/types";

export interface EffectDef {
  type: EffectType;
  label: string;
  group: string;
  params: { key: string; label: string; min: number; max: number; step: number; def: number }[];
}

export const EFFECTS: EffectDef[] = [
  { type: "blur", label: "Gaussian Blur", group: "Blur", params: [{ key: "px", label: "Radius (px)", min: 0, max: 40, step: 0.5, def: 8 }] },
  { type: "sharpen", label: "Sharpen", group: "Blur", params: [{ key: "amount", label: "Amount", min: 0, max: 2, step: 0.05, def: 0.6 }] },
  { type: "glow", label: "Glow / Bloom", group: "Stylisation", params: [{ key: "amount", label: "Intensity", min: 0, max: 2, step: 0.05, def: 0.5 }] },
  { type: "chromaticAberration", label: "Chromatic Aberration", group: "Distortion", params: [{ key: "amount", label: "Shift (px)", min: 0, max: 0.05, step: 0.001, def: 0.006 }] },
  { type: "rgbSplit", label: "RGB Split", group: "Stylisation", params: [{ key: "amount", label: "Split", min: 0, max: 0.04, step: 0.001, def: 0.008 }] },
  { type: "vignette", label: "Vignette", group: "Colour Effects", params: [
      { key: "amount", label: "Amount", min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: "soft", label: "Softness", min: 0, max: 1, step: 0.01, def: 0.45 },
  ] },
  { type: "grain", label: "Film Grain", group: "Film Effects", params: [{ key: "amount", label: "Amount", min: 0, max: 1, step: 0.01, def: 0.25 }] },
  { type: "noise", label: "TV Noise", group: "Film Effects", params: [{ key: "amount", label: "Amount", min: 0, max: 1, step: 0.01, def: 0.2 }] },
  { type: "pixelate", label: "Pixelate", group: "Stylisation", params: [{ key: "px", label: "Block Size", min: 0, max: 120, step: 1, def: 12 }, { key: "mirror", label: "Mirror", min: 0, max: 1, step: 1, def: 0 }] },
  { type: "mirror", label: "Mirror", group: "Stylisation", params: [{ key: "on", label: "Mirror X", min: 0, max: 1, step: 1, def: 1 }] },
  { type: "hueShift", label: "Hue Rotate", group: "Colour Effects", params: [{ key: "deg", label: "Degrees", min: 0, max: 360, step: 1, def: 90 }] },
  { type: "grayscale", label: "Grayscale", group: "Colour Effects", params: [{ key: "amount", label: "Amount", min: 0, max: 1, step: 0.01, def: 1 }] },
  { type: "sepia", label: "Sepia", group: "Film Effects", params: [{ key: "amount", label: "Amount", min: 0, max: 1, step: 0.01, def: 1 }] },
  { type: "invert", label: "Invert", group: "Stylisation", params: [{ key: "amount", label: "Amount", min: 0, max: 1, step: 0.01, def: 1 }] },
  { type: "posterize", label: "Posterize", group: "Stylisation", params: [{ key: "levels", label: "Levels", min: 2, max: 32, step: 1, def: 6 }] },
];

// Distortion group note: geometric distortion beyond the above (lens warp, wave,
// displacement maps) requires a mesh-warp pass — see docs/LIMITATIONS.md.
