// Shared WebGL2 grading pass: exposure / LGG / temp / curves / LUT / vignette /
// grain / sharpen / chromatic aberration / glow / pixelate / rgbSplit / mask…

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp sampler3D;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTex;
uniform sampler2D uCurve;      // 256x1: r=red, g=green, b=blue curves (clamped 0..255)
uniform sampler3D uLut;        // optional 3D LUT
uniform float uLutMix;         // 0 = off
uniform float uLutSize;
uniform float uCompareSplit;   // 0..1 x-position; 0 = no split

uniform float uExposure, uContrast, uSaturation, uVibrance, uTemp, uTint, uHue;
uniform float uHighlights, uShadows, uWhites, uBlacks, uBrightness;
uniform vec3  uLift, uGamma, uGain;
uniform float uFade, uSharpen, uGrain, uTime;
uniform vec2  uVig;            // amount, softness
uniform float uBlur;           // px
uniform float uGlow;
uniform float uCA;             // chromatic aberration px
uniform float uPixelate;
uniform float uRgbSplit;
uniform float uNoise;
uniform float uMirror;
uniform float uPosterize;
uniform float uHueShift;       // effect hue rotate deg
uniform float uGray, uSepia, uInvert;
uniform vec2  uTexel;

vec3 rgb2hsv(vec3 c){
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0*d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c){
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 sampleTex(vec2 uv){
  // pixelate effect
  if (uPixelate > 0.0) {
    vec2 px = uPixelate / uTexel;
    vec2 block = px * max(vec2(1.0), floor(uv / px));
    uv = (block + px * 0.5);
  }
  if (uMirror > 0.0 && vUv.x > 0.5) uv = vec2(1.0 - uv.x, uv.y);
  return texture(uTex, clamp(uv, vec2(0.0015), vec2(0.9985))).rgb;
}

vec3 blurSample(vec2 uv, float px){
  vec2 s = px * uTexel;
  vec3 sum = sampleTex(uv) * 4.0;
  sum += sampleTex(uv + vec2( s.x, 0.0)) * 2.0;
  sum += sampleTex(uv + vec2(-s.x, 0.0)) * 2.0;
  sum += sampleTex(uv + vec2(0.0,  s.y)) * 2.0;
  sum += sampleTex(uv + vec2(0.0, -s.y)) * 2.0;
  sum += sampleTex(uv + s);
  sum += sampleTex(uv - s);
  sum += sampleTex(uv + vec2(s.x, -s.y));
  sum += sampleTex(uv + vec2(-s.x, s.y));
  return sum / 16.0;
}

void main(){
  vec2 uv = vUv;
  vec2 caDir = uv - 0.5;
  vec3 col;

  if (uCA > 0.0) {
    float o = uCA;
    col.r = sampleTex(uv + caDir * o).r;
    col.g = sampleTex(uv).g;
    col.b = sampleTex(uv - caDir * o).b;
  } else if (uRgbSplit > 0.0) {
    vec2 d = vec2(uRgbSplit, uRgbSplit * 0.35);
    col.r = sampleTex(uv + d).r;
    col.g = sampleTex(uv).g;
    col.b = sampleTex(uv - d).b;
  } else {
    col = sampleTex(uv);
  }

  if (uBlur > 0.0)  col = blurSample(uv, uBlur);
  if (uSharpen > 0.0) {
    vec3 n = sampleTex(uv + vec2(uTexel.x, 0.0)) + sampleTex(uv - vec2(uTexel.x, 0.0))
           + sampleTex(uv + vec2(0.0, uTexel.y)) + sampleTex(uv - vec2(0.0, uTexel.y));
    col = col + (col - n * 0.25) * uSharpen * 2.0;
  }
  if (uGlow > 0.0) {
    vec3 b = blurSample(uv, 6.0);
    vec3 bright = max(b - 0.55, vec3(0.0));
    col += bright * uGlow * 2.2;
  }

  // ---- grade (skipped entirely when bypassed) ----
  if (uCompareSplit > 0.0 && uv.x < uCompareSplit) {
    // untouched source on the left of the split
  } else {
    // exposure (stops)
    col *= exp2(uExposure);

    // temperature / tint
    col.r += uTemp * 0.16;
    col.b -= uTemp * 0.16;
    col.g += uTint * 0.10;
    col.r += uTint * 0.04;
    col.b += uTint * 0.04;

    // lift / gamma / gain
    col = col * (1.0 + uGain - vec3(0.0)) + uLift * 0.5;
    col = max(col, vec3(0.0));
    col = pow(max(col, vec3(1e-5)), 1.0 / max(1.0 + uGamma, vec3(0.05)));
    col *= 1.0 + uGain;

    // whites / blacks / shadows / highlights / brightness / contrast
    float l = luma(col);
    col += vec3(uWhites * (0.10 + 0.14 * l));
    col += vec3(uBlacks * (0.10 * (1.0 - l)));
    col *= 1.0 + uShadows * (1.0 - l) * -0.28;
    col *= 1.0 + uHighlights * l * -0.28;
    col += vec3(uBrightness * 0.12);
    col = (col - 0.5) * (1.0 + uContrast * 0.9) + 0.5;

    // curves (r/g/b + master sampled once)
    vec3 cu = texture(uCurve, vec2(clamp(col.r, 0.0, 1.0), 0.5)).rgb;
    col.r = cu.r;
    col.g = texture(uCurve, vec2(clamp(col.g, 0.0, 1.0), 0.5)).g;
    col.b = texture(uCurve, vec2(clamp(col.b, 0.0, 1.0), 0.5)).b;

    // hue rotate (grade)
    if (uHue != 0.0) { vec3 h = rgb2hsv(col); h.x = fract(h.x + uHue / 360.0); col = hsv2rgb(h); }

    // saturation / vibrance
    l = luma(col);
    col = mix(vec3(l), col, 1.0 + uSaturation);
    if (uVibrance != 0.0) {
      float mx = max(col.r, max(col.g, col.b));
      float mn = min(col.r, min(col.g, col.b));
      float satv = (mx - mn) / (mx + 1e-5);
      col = mix(vec3(luma(col)), col, 1.0 + uVibrance * (1.0 - satv));
    }

    if (uHueShift != 0.0) { vec3 h = rgb2hsv(col); h.x = fract(h.x + uHueShift / 360.0); col = hsv2rgb(h); }
    if (uGray  > 0.0) { l = luma(col); col = mix(col, vec3(l), uGray); }
    if (uSepia > 0.0) {
      vec3 sp = vec3(dot(col, vec3(0.393, 0.769, 0.189)),
                     dot(col, vec3(0.349, 0.686, 0.168)),
                     dot(col, vec3(0.272, 0.534, 0.131)));
      col = mix(col, sp, uSepia);
    }
    if (uInvert > 0.0) col = mix(col, 1.0 - col, uInvert);
    if (uPosterize > 0.0) {
      float levels = max(2.0, uPosterize);
      col = floor(col * levels + 0.5) / levels;
    }

    // LUT
    if (uLutMix > 0.0) {
      vec3 luv = clamp(col, 0.0, 1.0) * (uLutSize - 1.0) / uLutSize + 0.5 / uLutSize;
      vec3 lut = texture(uLut, luv).rgb;
      col = mix(col, lut, uLutMix);
    }

    // fade (lifted blacks)
    col = mix(col, vec3(0.5), uFade * 0.28);

    // vignette
    if (uVig.x > 0.0) {
      float d = length((uv - 0.5) * vec2(1.15, 1.0));
      float v = smoothstep(uVig.y, 1.0, d * (1.0 + uVig.x * 0.9));
      col *= 1.0 - v * uVig.x;
    }

    // grain
    if (uGrain > 0.0) {
      float n = fract(sin(dot(uv * 1024.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      col += n * uGrain * 0.18;
    }
    if (uNoise > 0.0) {
      float n = fract(sin(dot(uv * 512.0 + uTime * 1.7, vec2(91.3458, 47.6532))) * 37580.2532) - 0.5;
      col += n * uNoise * 0.35;
    }
  }

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export interface PassOpts {
  exposure: number; contrast: number; saturation: number; vibrance: number;
  temp: number; tint: number; hue: number;
  highlights: number; shadows: number; whites: number; blacks: number; brightness: number;
  lift: [number, number, number]; gamma: [number, number, number]; gain: [number, number, number];
  fade: number; sharpen: number; grain: number;
  vigAmount: number; vigSoft: number;
  blurPx: number; glow: number; ca: number; pixelate: number;
  rgbSplit: number; noise: number; mirror: number; posterize: number;
  hueShift: number; gray: number; sepia: number; invert: number;
  lutMix: number;
  compareSplit: number;
  time: number;
}

export class ColorPass {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private curveTex: WebGLTexture;
  private lutTex: WebGLTexture | null = null;
  private lutSize = 0;
  private lutKey = "";
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private curveCache = new Map<string, Uint8Array>();
  hasContext = true;

  constructor() {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", {
      premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false,
    });
    if (!gl) { this.hasContext = false; }
    this.canvas = canvas;
    this.gl = gl!;
    // fallback 2d context when no WebGL2
    if (!gl) { canvas.getContext("2d"); return; }

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        console.error("shader", gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    this.prog = prog;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.tex = gl.createTexture()!;
    this.curveTex = gl.createTexture()!;
    for (const t of [this.tex, this.curveTex]) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
  }

  private u(name: string) {
    if (!this.uniforms.has(name))
      this.uniforms.set(name, this.gl.getUniformLocation(this.prog, name));
    return this.uniforms.get(name)!;
  }

  private uploadCurve(curves: any) {
    const key = JSON.stringify(curves);
    let cached = this.curveCache.get(key);
    if (!cached) {
      cached = new Uint8Array(256 * 4);
      const chans = ["master", "red", "green", "blue"].map((k) => curves[k] ?? []);
      for (let i = 0; i < 256; i++) {
        const x = i / 255;
        const chansOut = [0, 1, 2].map((c) => {
          const pts = chans[c + 1];
          const m = chans[0];
          let v = x;
          const evalPts = (sorted: { x: number; y: number }[]) => {
            if (!sorted.length || sorted.length < 2) return x;
            if (x <= sorted[0].x) return sorted[0].y;
            if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y;
            for (let j = 0; j < sorted.length - 1; j++) {
              const a = sorted[j], b = sorted[j + 1];
              if (x >= a.x && x <= b.x) {
                const p = (x - a.x) / (b.x - a.x || 1e-6);
                const sp = p * p * (3 - 2 * p);
                return a.y + (b.y - a.y) * sp;
              }
            }
            return x;
          };
          if (m.length >= 2) v = evalPts(m);
          if (pts && pts.length >= 2) v = evalPts(pts);
          return clamp01(v);
        });
        cached![i * 4] = Math.round(chansOut[0] * 255);
        cached![i * 4 + 1] = Math.round(chansOut[1] * 255);
        cached![i * 4 + 2] = Math.round(chansOut[2] * 255);
        cached![i * 4 + 3] = 255;
      }
      this.curveCache.set(key, cached);
      if (this.curveCache.size > 40) this.curveCache.clear();
    }
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, cached);
  }

  ensureLut(data: Float32Array, size: number, key: string) {
    if (this.lutKey === key && this.lutTex) return;
    const gl = this.gl;
    if (!this.lutTex) this.lutTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage3D(
      gl.TEXTURE_3D, 0, gl.RGB32F, size, size, size, 0,
      gl.RGB, gl.FLOAT, data
    );
    this.lutSize = size;
    this.lutKey = key;
  }

  /** Runs the grade; caller must drawImage(this.canvas) immediately. */
  run(
    src: any,
    w: number,
    h: number,
    o: PassOpts,
    curves: any
  ): HTMLCanvasElement {
    const gl = this.gl;
    if (!gl || !this.hasContext) return this.canvas;

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);

    this.uploadCurve(curves);
    gl.uniform1i(this.u("uTex"), 0);
    gl.uniform1i(this.u("uCurve"), 1);
    gl.uniform1i(this.u("uLut"), 2);
    gl.uniform1f(this.u("uLutMix"), this.lutTex && o.lutMix > 0 ? o.lutMix : 0);
    gl.uniform1f(this.u("uLutSize"), this.lutSize);

    const f = (n: string, v: number) => gl.uniform1f(this.u(n), v);
    f("uExposure", o.exposure); f("uContrast", o.contrast);
    f("uSaturation", o.saturation); f("uVibrance", o.vibrance);
    f("uTemp", o.temp); f("uTint", o.tint); f("uHue", o.hue);
    f("uHighlights", o.highlights); f("uShadows", o.shadows);
    f("uWhites", o.whites); f("uBlacks", o.blacks); f("uBrightness", o.brightness);
    gl.uniform3fv(this.u("uLift"), o.lift);
    gl.uniform3fv(this.u("uGamma"), o.gamma);
    gl.uniform3fv(this.u("uGain"), o.gain);
    f("uFade", o.fade); f("uSharpen", o.sharpen);
    f("uGrain", o.grain);
    gl.uniform2f(this.u("uVig"), o.vigAmount, o.vigSoft);
    f("uBlur", o.blurPx); f("uGlow", o.glow); f("uCA", o.ca);
    f("uPixelate", o.pixelate); f("uRgbSplit", o.rgbSplit);
    f("uNoise", o.noise); f("uMirror", o.mirror); f("uPosterize", o.posterize);
    f("uHueShift", o.hueShift); f("uGray", o.gray); f("uSepia", o.sepia);
    f("uInvert", o.invert);
    f("uCompareSplit", o.compareSplit);
    f("uTime", o.time);
    gl.uniform2f(this.u("uTexel"), 1 / Math.max(w, 1), 1 / Math.max(h, 1));

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return this.canvas;
  }
}

function clamp01(v: number) { return Math.min(1, Math.max(0, v)); }
