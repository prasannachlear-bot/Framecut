// Transition registry — every transition draws two graded buffers onto the
// composite canvas at progress p (0..1, already eased).
import { TransitionType } from "../state/types";

export interface TransitionDef {
  type: TransitionType;
  label: string;
  dir: boolean;       // supports direction
  group: string;
}

export const TRANSITIONS: TransitionDef[] = [
  { type: "crossDissolve", label: "Cross Dissolve", dir: false, group: "Dissolve" },
  { type: "dipToBlack", label: "Dip to Black", dir: false, group: "Dissolve" },
  { type: "dipToWhite", label: "Dip to White", dir: false, group: "Dissolve" },
  { type: "pushLeft", label: "Push Left", dir: true, group: "Motion" },
  { type: "pushRight", label: "Push Right", dir: true, group: "Motion" },
  { type: "slideLeft", label: "Slide In", dir: true, group: "Motion" },
  { type: "slideRight", label: "Slide Out", dir: true, group: "Motion" },
  { type: "zoomIn", label: "Zoom In", dir: false, group: "Motion" },
  { type: "zoomOut", label: "Zoom Out", dir: false, group: "Motion" },
  { type: "seamlessZoom", label: "Seamless Zoom", dir: true, group: "Motion" },
  { type: "spin", label: "Spin", dir: true, group: "Motion" },
  { type: "whipPan", label: "Whip Pan", dir: true, group: "Motion" },
  { type: "motionBlur", label: "Motion Blur", dir: true, group: "Motion" },
  { type: "blurDissolve", label: "Blur Transition", dir: false, group: "Blur" },
  { type: "lightLeak", label: "Light Leak", dir: false, group: "Light" },
  { type: "filmBurn", label: "Film Burn", dir: false, group: "Light" },
  { type: "glitch", label: "Glitch", dir: false, group: "Stylize" },
  { type: "rgbSplit", label: "RGB Split", dir: false, group: "Stylize" },
  { type: "maskReveal", label: "Mask Reveal", dir: true, group: "Wipe" },
  { type: "wipeLeft", label: "Wipe Left", dir: true, group: "Wipe" },
  { type: "wipeRight", label: "Wipe Right", dir: true, group: "Wipe" },
];

function drawBuf(
  ctx: CanvasRenderingContext2D,
  buf: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement,
  x: number, y: number, w: number, h: number,
  extra: { scale?: number; alpha?: number; rotate?: number } = {}
) {
  ctx.save();
  ctx.globalAlpha = extra.alpha ?? 1;
  if (extra.scale !== undefined || extra.rotate) {
    ctx.translate(x + w / 2, y + h / 2);
    if (extra.rotate) ctx.rotate(extra.rotate);
    const s = extra.scale ?? 1;
    ctx.scale(s, s);
    ctx.drawImage(buf, -w / 2, -h / 2, w, h);
  } else {
    ctx.drawImage(buf, x, y, w, h);
  }
  ctx.restore();
}

export function drawTransition(
  ctx: CanvasRenderingContext2D,
  type: TransitionType,
  p: number,
  dir: number,
  intensity: number,
  A: HTMLCanvasElement,
  B: HTMLCanvasElement,
  w: number,
  h: number,
  time: number
) {
  const q = 1 - p;
  ctx.save();
  switch (type) {
    case "crossDissolve": {
      drawBuf(ctx, A, 0, 0, w, h);
      ctx.globalAlpha = p;
      drawBuf(ctx, B, 0, 0, w, h);
      break;
    }
    case "dipToBlack": case "dipToWhite": {
      const c = type === "dipToBlack" ? 0 : 255;
      if (q > 0.5) drawBuf(ctx, A, 0, 0, w, h, { alpha: q * 2 });
      else drawBuf(ctx, B, 0, 0, w, h, { alpha: p * 2 });
      ctx.fillStyle = `rgb(${c},${c},${c})`;
      ctx.globalAlpha = 1 - Math.abs(q - 0.5) * 2;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "pushLeft": case "pushRight": {
      const s = dir || (type === "pushLeft" ? 1 : -1);
      drawBuf(ctx, A, -p * w * s, 0, w, h);
      drawBuf(ctx, B, q * w * s, 0, w, h);
      break;
    }
    case "slideLeft": case "slideRight": {
      const s = dir || (type === "slideLeft" ? -1 : 1);
      drawBuf(ctx, A, 0, 0, w, h);
      drawBuf(ctx, B, p * w * s, 0, w, h);
      break;
    }
    case "zoomIn": case "zoomOut": {
      const zin = type === "zoomOut";
      drawBuf(ctx, A, 0, 0, w, h, { scale: zin ? 1 - p * 0.7 * intensity : 1 + p * 1.4 * intensity, alpha: 1 - p });
      drawBuf(ctx, B, 0, 0, w, h, { scale: zin ? 1 + q * 0.5 : 1.8 - q * 0.8, alpha: p });
      break;
    }
    case "seamlessZoom": {
      // A zooms in fast, B starts zoomed beyond screen and settles
      const s = dir || 1;
      drawBuf(ctx, A, 0, 0, w, h, { scale: 1 + Math.pow(p, 1.5) * 3 * intensity, alpha: q > 0.85 ? q : 1 });
      const bs = 4 - Math.pow(p, 0.8) * 3;
      drawBuf(ctx, B, 0, 0, w, h, { scale: Math.max(1, bs), alpha: Math.pow(p, 0.5) });
      break;
    }
    case "spin": {
      const s = dir || 1;
      const ease = Math.pow(p, 2);
      drawBuf(ctx, A, 0, 0, w, h, { alpha: 1 - p, scale: 1 + ease * (0.4 * intensity) });
      drawBuf(ctx, B, 0, 0, w, h, { alpha: p, scale: 1 + (1 - ease) * (0.4 * intensity), rotate: s * ease * Math.PI * 2 * intensity });
      break;
    }
    case "whipPan": case "motionBlur": {
      const s = dir || 1;
      const samples = 12;
      for (let i = 0; i < samples; i++) {
        const t = i / (samples - 1);
        const px = (p * samples - t) * 0.18 * w * s;
        const aA = Math.max(0, 1 - p * 1.35);
        const aB = Math.max(0, p * 1.35 - t * 0.02);
        if (aA > 0.01) drawBuf(ctx, A, px + t * 0.003 * w, 0, w, h, { alpha: aA / samples * 2.2 });
        if (aB > 0.01) drawBuf(ctx, B, px - (1 - t) * 0.003 * w, 0, w, h, { alpha: aB / samples * 2.2 });
      }
      break;
    }
    case "blurDissolve": {
      drawBuf(ctx, A, 0, 0, w, h, { alpha: 1 });
      drawBuf(ctx, B, 0, 0, w, h, { alpha: p });
      const blurPx = Math.sin(p * Math.PI) * 18 * intensity;
      if (blurPx > 0.5) {
        ctx.globalCompositeOperation = "source-over";
        ctx.save();
        ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
        ctx.globalAlpha = 0.9;
        if (q > 0.5) { ctx.globalAlpha = q; drawBuf(ctx, A, 0, 0, w, h); }
        else { ctx.globalAlpha = p; drawBuf(ctx, B, 0, 0, w, h); }
        ctx.restore();
      }
      break;
    }
    case "lightLeak": {
      drawBuf(ctx, A, 0, 0, w, h);
      drawBuf(ctx, B, 0, 0, w, h, { alpha: p });
      const g = ctx.createLinearGradient(0, 0, w * (0.4 + Math.sin(time * 12) * 0.1), h);
      g.addColorStop(0, "rgba(255,190,80,0)");
      g.addColorStop(0.5 + Math.sin(time * 15) * 0.15, `rgba(255,140,40,${0.55 * intensity * Math.sin(p * Math.PI)})`);
      g.addColorStop(1, "rgba(255,80,120,0)");
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "filmBurn": {
      drawBuf(ctx, A, 0, 0, w, h);
      drawBuf(ctx, B, 0, 0, w, h, { alpha: Math.pow(p, 0.7) });
      const fl = 0.65 + Math.abs(Math.sin(time * 40)) * 0.35;
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
      g.addColorStop(0, `rgba(255,240,190,${0.85 * intensity * Math.sin(p * Math.PI) * fl})`);
      g.addColorStop(0.55, `rgba(255,120,30,${0.5 * intensity * Math.sin(p * Math.PI) * fl})`);
      g.addColorStop(1, "rgba(60,0,0,0)");
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "glitch": {
      drawBuf(ctx, A, 0, 0, w, h);
      drawBuf(ctx, B, 0, 0, w, h, { alpha: p });
      const slices = 10;
      const amp = 0.12 * intensity * Math.sin(p * Math.PI);
      for (let i = 0; i < slices; i++) {
        const sy = Math.floor(Math.random() * h);
        const sh = Math.floor(h / slices);
        const off = (Math.random() - 0.5) * 2 * amp * w;
        if (Math.random() > 0.45) {
          ctx.drawImage(B, 0, sy, w, sh, off, sy, w, sh);
        }
      }
      const shift = w * 0.012 * intensity * Math.sin(p * Math.PI);
      ctx.globalCompositeOperation = "lighter";
      ctx.save(); ctx.globalAlpha = 0.35; ctx.drawImage(B, shift, 0, w, h); ctx.restore();
      break;
    }
    case "rgbSplit": {
      const d = w * 0.02 * intensity * Math.sin(p * Math.PI);
      const src = p < 0.5 ? B : B;
      drawBuf(ctx, A, 0, 0, w, h);
      ctx.globalAlpha = p; drawBuf(ctx, src, 0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = p * 0.4;
      ctx.drawImage(src, d, d * 0.4, w, h);
      ctx.drawImage(src, -d, -d * 0.4, w, h);
      break;
    }
    case "maskReveal": {
      drawBuf(ctx, A, 0, 0, w, h);
      ctx.save();
      ctx.beginPath();
      const r = p * Math.hypot(w, h) * 0.75;
      ctx.arc(w / 2, h / 2, Math.max(1, r), 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(B, 0, 0, w, h);
      ctx.restore();
      break;
    }
    case "wipeLeft": case "wipeRight": {
      const s = dir || (type === "wipeRight" ? 1 : -1);
      drawBuf(ctx, A, 0, 0, w, h);
      const bx = s > 0 ? 0 : w - p * w;
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, 0, p * w, h);
      ctx.clip();
      ctx.drawImage(B, 0, 0, w, h);
      ctx.restore();
      break;
    }
    default: {
      drawBuf(ctx, A, 0, 0, w, h);
      ctx.globalAlpha = p;
      drawBuf(ctx, B, 0, 0, w, h);
    }
  }
  ctx.restore();
}
