// Colour scopes: RGB parade, waveform (luma), vectorscope, histogram.
// Computed from a downscaled sample of the composite canvas.
// The live preview writes into `scopeTargets` when the color workspace is open.

const SAMPLE_W = 128;
const SAMPLE_H = 72;

const sampleCanvas = document.createElement("canvas");
sampleCanvas.width = SAMPLE_W;
sampleCanvas.height = SAMPLE_H;
const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true })!;

export interface ScopeCanvases {
  parade?: HTMLCanvasElement | null;
  wave?: HTMLCanvasElement | null;
  vector?: HTMLCanvasElement | null;
  histogram?: HTMLCanvasElement | null;
}

export function drawScopes(source: HTMLCanvasElement, scopes: ScopeCanvases) {
  try {
    sampleCtx.drawImage(source, 0, 0, SAMPLE_W, SAMPLE_H);
  } catch { return; }
  const data = sampleCtx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;

  if (scopes.histogram) drawHistogram(data, scopes.histogram);
  if (scopes.parade) drawParade(data, scopes.parade);
  if (scopes.wave) drawWave(data, scopes.wave);
  if (scopes.vector) drawVector(data, scopes.vector);
}

function prep(canvas: HTMLCanvasElement, w: number, h: number) {
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0b0c0e";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#23252a";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (h / 4) * i); ctx.lineTo(w, (h / 4) * i);
    ctx.stroke();
  }
  return ctx;
}

function drawHistogram(data: Uint8ClampedArray, canvas: HTMLCanvasElement) {
  const ctx = prep(canvas, 256, 120);
  const bins = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let i = 0; i < data.length; i += 4) {
    bins[0][data[i]]++; bins[1][data[i + 1]]++; bins[2][data[i + 2]]++;
  }
  const max = Math.max(...bins[0], ...bins[1], ...bins[2], 1);
  const cols = ["rgba(255,70,70,0.7)", "rgba(70,255,90,0.7)", "rgba(80,120,255,0.8)"];
  for (let c = 0; c < 3; c++) {
    ctx.strokeStyle = cols[c];
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const y = 120 - (bins[c][i] / max) * 116;
      if (i === 0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
    }
    ctx.stroke();
  }
}

function drawParade(data: Uint8ClampedArray, canvas: HTMLCanvasElement) {
  const ctx = prep(canvas, 384, 120);
  const panelW = 128;
  const cols = ["rgba(255,60,60,0.8)", "rgba(60,255,90,0.8)", "rgba(90,120,255,0.9)"];
  for (let c = 0; c < 3; c++) {
    ctx.fillStyle = cols[c];
    ctx.globalAlpha = 0.55;
    for (let x = 0; x < panelW; x++) {
      for (let y = 0; y < SAMPLE_H; y += 2) {
        const idx = (y * SAMPLE_W + x) * 4 + c;
        const v = data[idx] / 255;
        const py = 118 - Math.round(v * 112);
        ctx.fillRect(x, py, 1, 1.6);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawWave(data: Uint8ClampedArray, canvas: HTMLCanvasElement) {
  const ctx = prep(canvas, 256, 120);
  ctx.fillStyle = "rgba(165,244,91,0.85)";
  for (let x = 0; x < SAMPLE_W; x++) {
    for (let y = 0; y < SAMPLE_H; y++) {
      const idx = (y * SAMPLE_W + x) * 4;
      const l = (data[idx] * 0.2126 + data[idx + 1] * 0.7152 + data[idx + 2] * 0.0722) / 255;
      const py = 118 - Math.round(l * 112);
      ctx.fillRect(x * 2, py, 2, 1.6);
    }
  }
}

function drawVector(data: Uint8ClampedArray, canvas: HTMLCanvasElement) {
  const ctx = prep(canvas, 160, 160);
  const cx = 80, cy = 80;
  ctx.strokeStyle = "#2a2d33";
  for (const r of [24, 48, 72]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,120,200,0.85)";
  for (let i = 0; i < SAMPLE_W * SAMPLE_H; i += 3) {
    const idx = i * 4;
    const r = data[idx] / 255, g = data[idx + 1] / 255, b = data[idx + 2] / 255;
    const u = -0.169 * r - 0.331 * g + 0.5 * b;
    const v = 0.5 * r - 0.419 * g - 0.081 * b;
    ctx.fillRect(cx + u * 260 - 0.7, cy - v * 260 - 0.7, 1.6, 1.6);
  }
}

export const scopeTargets: ScopeCanvases = {};
