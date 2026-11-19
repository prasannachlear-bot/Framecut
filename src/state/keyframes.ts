import { KeyframeTrack, Keyframe, Easing, BezierHandle } from "../state/types";

export const KEYFRAME_PROPS = [
  { key: "transform.x", label: "Position X" },
  { key: "transform.y", label: "Position Y" },
  { key: "transform.scale", label: "Scale" },
  { key: "transform.rotation", label: "Rotation" },
  { key: "transform.opacity", label: "Opacity" },
] as const;

export function cubicBezier(t: number, h: BezierHandle): number {
  // cubic-bezier(x1,y1,x2,y2) solver for y at time t
  const { x1, y1, x2, y2 } = h;
  const solve = (u: number) => {
    const v = 1 - u;
    return (
      3 * v * v * u * y1 +
      3 * v * u * u * y2 +
      u * u * u
    );
  };
  const solveX = (u: number) => {
    const v = 1 - u;
    return 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u;
  };
  let lo = 0, hi = 1, u = t;
  for (let i = 0; i < 24; i++) {
    const x = solveX(u);
    if (Math.abs(x - t) < 1e-5) break;
    if (x < t) lo = u;
    else hi = u;
    u = (lo + hi) / 2;
  }
  return solve(u);
}

export function evalEase(e: Easing, p: number, bezier?: BezierHandle): number {
  const x = Math.min(1, Math.max(0, p));
  switch (e) {
    case "linear": return x;
    case "easeIn": return x * x;
    case "easeOut": return 1 - (1 - x) * (1 - x);
    case "easeInOut": return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case "bezier": return bezier ? cubicBezier(x, bezier) : x;
  }
}

export function getProp(obj: any, prop: string): number {
  const [a, b] = prop.split(".");
  return obj[a]?.[b] ?? obj[a] ?? 0;
}

export function setProp(obj: any, prop: string, v: number) {
  const [a, b] = prop.split(".");
  if (b === undefined) obj[a] = v;
  else if (obj[a]) obj[a][b] = v;
}

export function valueAt(kt: KeyframeTrack, localT: number, fallback: number): number {
  const keys = kt.keys;
  if (!keys.length) return fallback;
  if (localT <= keys[0].t) return keys[0].value;
  if (localT >= keys[keys.length - 1].t) return keys[keys.length - 1].value;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (localT >= a.t && localT <= b.t) {
      const dp = b.t - a.t || 1e-6;
      const p = (localT - a.t) / dp;
      return a.value + (b.value - a.value) * evalEase(b.ease, p, b.bezier);
    }
  }
  return fallback;
}

export function evaluateKeyframes(kfs: KeyframeTrack[], localT: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const kt of kfs) out[kt.prop] = valueAt(kt, localT, 0);
  return out;
}

export function newKey(t: number, value: number, ease: Easing = "easeInOut"): Keyframe {
  return { t, value, ease };
}

export function upsertKey(kfs: KeyframeTrack[], prop: string, t: number, value: number): KeyframeTrack[] {
  const existing = kfs.find((k) => k.prop === prop);
  if (existing) {
    const k = existing.keys.find((x) => Math.abs(x.t - t) < 1 / 120);
    if (k) k.value = value;
    else {
      existing.keys.push({ t, value, ease: "easeInOut" });
      existing.keys.sort((a, b) => a.t - b.t);
    }
    return kfs;
  }
  return [...kfs, { prop, keys: [{ t, value, ease: "easeInOut" }] }];
}

export function removeKeyAt(kfs: KeyframeTrack[], prop: string, t: number): KeyframeTrack[] {
  return kfs
    .map((kt) =>
      kt.prop === prop
        ? { ...kt, keys: kt.keys.filter((k) => Math.abs(k.t - t) > 1 / 120) }
        : kt
    )
    .filter((kt) => kt.keys.length > 0);
}
