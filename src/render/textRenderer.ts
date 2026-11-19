// Text rendering engine — draws text clips onto the composite canvas with
// typography, background, stroke, shadow and in/out animations.
import { Clip, TextGrad, TextAnim } from "../state/types";

function fontString(t: TextGrad): string {
  return `${t.italic ? "italic " : ""}${t.fontWeight} ${t.fontSize}px ${t.fontFamily}`;
}

export function measureTextBlock(
  ctx: CanvasRenderingContext2D,
  t: TextGrad
): { w: number; lineH: number; lines: string[] } {
  ctx.font = fontString(t);
  const lines = t.content.split("\n");
  const lineH = t.fontSize * t.lineHeight;
  let w = 0;
  for (const line of lines) w = Math.max(w, ctx.measureText(line).width + t.letterSpacing * line.length * t.fontSize);
  return { w, lineH, lines };
}

function easeOutBack(p: number) {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
}

export interface TextDrawOpts {
  localT: number;       // seconds within clip
  duration: number;
}

export function textAlphaOffset(
  t: TextGrad,
  opts: TextDrawOpts
): { alpha: number; dx: number; dy: number; scale: number; trackExtra: number; visibleChars: number | null; visibleCharsTotal: number | null } {
  const { localT, duration } = opts;
  const d = Math.max(0.001, t.animDuration);
  const pin = Math.min(1, localT / d);
  const pout = Math.min(1, (duration - localT) / d);
  let alpha = Math.min(t.opacity, Math.min(pin, pout) * 0 + 1);
  let dx = 0, dy = 0, scale = 1, trackExtra = 0;
  let visibleChars: number | null = null;
  const total = t.content.length;

  const apply = (anim: TextAnim, p: number, sign: number) => {
    if (p >= 1 || anim === "none") return;
    switch (anim) {
      case "fade": alpha *= p; break;
      case "slideUp": alpha *= p; dy += (1 - p) * 40 * sign; break;
      case "slideDown": alpha *= p; dy -= (1 - p) * 40 * sign; break;
      case "slideLeft": alpha *= p; dx += (1 - p) * 60 * sign; break;
      case "slideRight": alpha *= p; dx -= (1 - p) * 60 * sign; break;
      case "tracking": alpha *= p; trackExtra += (1 - p) * 0.5 * t.fontSize; break;
      case "scaleUp": alpha *= p; scale *= 0.5 + 0.5 * p; break;
      case "pop": alpha *= Math.min(1, p * 2); scale *= 0.4 + 0.6 * easeOutBack(p); break;
      case "typewriter": {
        if (sign > 0) visibleChars = Math.ceil(total * p);
        else visibleChars = Math.ceil(total * (1 - p));
        break;
      }
    }
  };
  apply(t.inAnim, pin, 1);
  apply(t.outAnim, pout, -1);

  const visibleCharsTotal = total;
  return { alpha, dx, dy, scale, trackExtra, visibleChars, visibleCharsTotal };
}

export function drawTextClip(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  frameW: number,
  frameH: number,
  opts: TextDrawOpts
) {
  const t = clip.text!;
  const { alpha, dx, dy, scale, trackExtra, visibleChars } = textAlphaOffset(t, opts);
  if (alpha <= 0.001) return;

  ctx.save();
  ctx.globalAlpha = alpha * clip.transform.opacity;
  ctx.font = fontString(t);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  const cx = (0.5 + clip.transform.x) * frameW + (dx / frameH) * frameH;
  const cy = (0.5 + clip.transform.y) * frameH + (dy / frameH) * frameH;
  ctx.translate(cx, cy);
  ctx.rotate((clip.transform.rotation * Math.PI) / 180);
  const s = clip.transform.scale * scale;
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);

  const lines = t.content.split("\n");
  const lineH = t.fontSize * t.lineHeight;
  const blockH = lines.length * lineH;
  const startCx = cx;
  const startCy = cy - blockH / 2 + lineH / 2;

  const spacing = (t.letterSpacing + trackExtra / Math.max(t.fontSize, 1)) * t.fontSize;

  // Background box
  if (t.bg !== "none") {
    ctx.font = fontString(t);
    let maxW = 0;
    for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width + spacing * line.length);
    const pad = t.bgPadding * t.fontSize;
    ctx.fillStyle = t.bg;
    roundRect(
      ctx,
      startCx - maxW / 2 - pad,
      startCy - lineH / 2 - pad * 0.6,
      maxW + pad * 2,
      blockH + pad * 1.2,
      4
    );
    ctx.fill();
  }

  let charBudget = visibleChars ?? Infinity;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const y = startCy + li * lineH;
    if (t.animMode === "word") {
      // measure line width with word runs
      const words = line.split(/(\s+)/);
      const lineWidth = measureLine(ctx, words, spacing);
      let x = startXFor(ctx, lineWidth, frameW, startCx, t.align);
      ctx.font = fontString(t);
      for (const wordRun of words) {
        if (charBudget <= 0) break;
        const ww = measureRun(ctx, wordRun, spacing);
        drawRun(ctx, wordRun, x, y, ww, t, charBudget);
        charBudget -= wordRun.length;
        x += ww;
      }
    } else if (t.animMode === "char") {
      const chars = [...line];
      const lineWidth = measureLine(ctx, chars, spacing);
      let x = startXFor(ctx, lineWidth, frameW, startCx, t.align);
      ctx.font = fontString(t);
      for (const ch of chars) {
        if (charBudget <= 0) break;
        const cw = ctx.measureText(ch).width + spacing;
        drawRun(ctx, ch, x, y, cw, t, charBudget);
        charBudget--;
        x += cw;
      }
    } else {
      const lineWidth = ctx.measureText(line).width + t.letterSpacing * line.length * t.fontSize;
      const x = startXFor(ctx, lineWidth, frameW, startCx, t.align);
      drawRun(ctx, line, x, y, t.letterSpacing * t.fontSize, t, charBudget, true);
      charBudget -= line.length;
    }
  }
  ctx.restore();
}

function startXFor(
  ctx: CanvasRenderingContext2D,
  lineWidth: number,
  frameW: number,
  cx: number,
  align: TextGrad["align"]
): number {
  if (align === "left") return cx - frameW * 0.25;
  if (align === "right") return cx + frameW * 0.25 - lineWidth;
  return cx - lineWidth / 2;
}

function measureLine(ctx: CanvasRenderingContext2D, runs: string[], spacing: number): number {
  let w = 0;
  for (const r of runs) w += measureRun(ctx, r, spacing);
  return w;
}

function measureRun(ctx: CanvasRenderingContext2D, run: string, spacing: number): number {
  return ctx.measureText(run).width + spacing * run.length;
}

function drawRun(
  ctx: CanvasRenderingContext2D,
  run: string,
  x: number,
  y: number,
  spacing: number,
  t: TextGrad,
  budget: number,
  isWhole = false
) {
  if (budget <= 0) return;
  let text = run;
  if (!isWhole && budget < run.length) text = run.slice(0, Math.floor(budget));
  if (isWhole && budget < run.length) text = run.slice(0, Math.floor(budget));

  ctx.save();
  if (t.shadowBlur > 0 || t.shadowXY !== 0) {
    ctx.shadowColor = t.shadowColor;
    ctx.shadowBlur = t.shadowBlur;
    ctx.shadowOffsetX = t.shadowXY;
    ctx.shadowOffsetY = t.shadowXY;
  }
  if (t.strokeWidth > 0) {
    ctx.strokeStyle = t.strokeColor;
    ctx.lineWidth = t.strokeWidth * t.fontSize * 2;
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = t.color;
  if (isWhole && spacing !== 0) {
    let cx = x;
    for (const ch of text) {
      ctx.fillText(ch, cx + ctx.measureText(ch).width / 2, y);
      cx += ctx.measureText(ch).width + spacing;
    }
  } else {
    ctx.fillText(text, x + (t.strokeWidth > 0 ? spacing / 2 : 0), y);
  }
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
