import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { Clip, defaultCurve, RGBPoint } from "../state/types";
import { NumRow, ToggleBtn } from "./widgets";
import { scopeTargets } from "../render/scopes";
import { parseCube } from "../lut/parseCube";

export function ColorWorkspace() {
  const selection = useStore((s) => s.selection);
  const clip = useStore((s) => (s.selection.length ? s.project.clips[s.selection[0]] : undefined));

  return (
    <div className="color-grid">
      <div className="color-controls">
        {clip ? (
          <ColorControls clip={clip} />
        ) : (
          <div className="empty" style={{ margin: 16 }}>
            Select a video or image clip on the timeline to grade it.
            All colour edits update the preview in real time.
          </div>
        )}
      </div>
      <div className="color-scopes">
        {selection.length > 0 && clip && (
          <div style={{ fontSize: 11, color: "var(--text-2)" }}>
            Scopes of <b style={{ color: "var(--text)" }}>{clip.name}</b> · use ◧ Compare under the
            preview for original vs graded.
          </div>
        )}
        <div>
          <div className="scope-label">RGB Parade</div>
          <canvas className="scope-canvas" ref={(el) => { scopeTargets.parade = el; }} />
        </div>
        <div>
          <div className="scope-label">Luma Waveform</div>
          <canvas className="scope-canvas" ref={(el) => { scopeTargets.wave = el; }} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="scope-label">Vectorscope</div>
            <canvas className="scope-canvas" ref={(el) => { scopeTargets.vector = el; }} />
          </div>
          <div style={{ flex: 1.2 }}>
            <div className="scope-label">Histogram</div>
            <canvas className="scope-canvas" ref={(el) => { scopeTargets.histogram = el; }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorControls({ clip }: { clip: Clip }) {
  if (clip.type !== "video" && clip.type !== "image") {
    return <div className="empty">Colour grading applies to video / image clips.</div>;
  }
  return <GradePanel clip={clip} />;
}

const NEUTRAL_GRADE = {
  exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0,
  whites: 0, blacks: 0, temperature: 0, tint: 0, saturation: 0, vibrance: 0,
  lift: { r: 0, g: 0, b: 0 }, gamma: { r: 0, g: 0, b: 0 }, gain: { r: 0, g: 0, b: 0 },
  hue: 0, fade: 0, sharpen: 0, grain: 0, vignette: 0, vignetteSoft: 0.4,
};

function GradePanel({ clip }: { clip: Clip }) {
  const commit = useStore((s) => s.commit);
  const luts = useStore((s) => s.luts);
  const presets = useStore((s) => s.project.savedColorPresets);
  const compare = useStore((s) => s.compare);
  const setCompare = useStore((s) => s.setCompare);
  const [channel, setChannel] = useState<"master" | "red" | "green" | "blue">("master");
  const set = (fn: (c: Clip) => void) => commit((p) => { fn(p.clips[clip.id]); });
  const g = clip.color;
  const touched = (fn: (c: Clip) => void) => set((c) => { c.color.enable = true; fn(c); });

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <ToggleBtn on={g.enable} onClick={() => set((c) => { c.color.enable = !c.color.enable; })} tip="Bypass this clip's grade">
          {g.enable ? "GRADE ON" : "GRADE OFF"}
        </ToggleBtn>
        <ToggleBtn on={compare} onClick={() => setCompare(!compare)} tip="Split-screen: original left / graded right">◧ Compare</ToggleBtn>
        <span style={{ flex: 1 }} />
        <button className="ghost" onClick={() => {
          const name = prompt("Preset name", "Preset " + (presets.length + 1));
          if (!name) return;
          commit((p) => {
            p.savedColorPresets.push({
              name,
              color: JSON.parse(JSON.stringify(p.clips[clip.id].color)),
              curves: JSON.parse(JSON.stringify(p.clips[clip.id].curves)),
            });
          });
        }} data-tip="Save this clip's grade + curves as a preset">＋ Preset</button>
        <button className="ghost" onClick={() => set((c) => { c.color = JSON.parse(JSON.stringify(NEUTRAL_GRADE)); c.curves = defaultCurve(); })}>
          Reset grade
        </button>
      </div>

      <SliderSection title="Basic Correction">
        <NumRow label="Exposure" min={-3} max={3} step={0.02} value={g.exposure} onChange={(v) => touched((c) => { c.color.exposure = v; })} tip="Exposure in stops" />
        <NumRow label="Brightness" min={-1} max={1} step={0.01} value={g.brightness} onChange={(v) => touched((c) => { c.color.brightness = v; })} />
        <NumRow label="Contrast" min={-1} max={1} step={0.01} value={g.contrast} onChange={(v) => touched((c) => { c.color.contrast = v; })} />
        <NumRow label="Highlights" min={-1} max={1} step={0.01} value={g.highlights} onChange={(v) => touched((c) => { c.color.highlights = v; })} />
        <NumRow label="Shadows" min={-1} max={1} step={0.01} value={g.shadows} onChange={(v) => touched((c) => { c.color.shadows = v; })} />
        <NumRow label="Whites" min={-1} max={1} step={0.01} value={g.whites} onChange={(v) => touched((c) => { c.color.whites = v; })} />
        <NumRow label="Blacks" min={-1} max={1} step={0.01} value={g.blacks} onChange={(v) => touched((c) => { c.color.blacks = v; })} />
        <NumRow label="Temperature" min={-1} max={1} step={0.01} value={g.temperature} onChange={(v) => touched((c) => { c.color.temperature = v; })} />
        <NumRow label="Tint" min={-1} max={1} step={0.01} value={g.tint} onChange={(v) => touched((c) => { c.color.tint = v; })} />
        <NumRow label="Saturation" min={-1} max={1} step={0.01} value={g.saturation} onChange={(v) => touched((c) => { c.color.saturation = v; })} />
        <NumRow label="Vibrance" min={-1} max={1} step={0.01} value={g.vibrance} onChange={(v) => touched((c) => { c.color.vibrance = v; })} />
        <NumRow label="White bal." min={-1} max={1} step={0.01} value={(g.temperature + g.tint) / 2} onChange={(v) => touched((c) => { c.color.temperature = v; c.color.tint = v * 0.4; })} tip="Quick white balance (temperature + tint)" />
      </SliderSection>

      <SliderSection title="Lift · Gamma · Gain">
        <div className="wheel-box">
          <ColorWheel label="Lift" rgb={[g.lift.r, g.lift.g, g.lift.b]} onChange={(r, gg, b) => touched((c) => { c.color.lift = { r, g: gg, b }; })} />
          <ColorWheel label="Gamma" rgb={[g.gamma.r, g.gamma.g, g.gamma.b]} onChange={(r, gg, b) => touched((c) => { c.color.gamma = { r, g: gg, b }; })} />
          <ColorWheel label="Gain" rgb={[g.gain.r, g.gain.g, g.gain.b]} onChange={(r, gg, b) => touched((c) => { c.color.gain = { r, g: gg, b }; })} />
        </div>
        {(["lift", "gamma", "gain"] as const).map((wheel) =>
          (["r", "g", "b"] as const).map((ch) => (
            <NumRow key={wheel + ch} label={`${wheel} ${ch.toUpperCase()}`} min={-1} max={1} step={0.01}
              value={(g[wheel] as any)[ch]}
              onChange={(v) => touched((c) => { (c.color[wheel] as any)[ch] = v; })} />
          ))
        )}
        <NumRow label="Master hue" min={0} max={360} step={1} fmt={(v) => v.toFixed(0) + "°"} value={g.hue} onChange={(v) => touched((c) => { c.color.hue = v; })} />
      </SliderSection>

      <SliderSection title="Curves" rightNode={
        <select value={channel} style={{ fontSize: 11 }} onChange={(e) => setChannel(e.target.value as any)}>
          {["master", "red", "green", "blue"].map((c) => <option key={c} value={c}>{c === "master" ? "Master (luma)" : c}</option>)}
        </select>
      }>
        <CurveEditor
          points={clip.curves[channel]}
          onChange={(pts) => set((c) => { c.curves[channel] = pts; })}
          color={channel === "master" ? "#f5f5f5" : channel === "red" ? "#ff5566" : channel === "green" ? "#55ff77" : "#6699ff"}
        />
        <div className="sub" style={{ fontSize: 10.5, color: "var(--text-2)" }}>
          Click the canvas to add a point, drag to shape, double-click a point to remove it.
        </div>
        <button className="ghost" onClick={() => set((c) => { c.curves = defaultCurve(); })}>Reset all curves</button>
      </SliderSection>

      <SliderSection title="Look & Texture">
        <NumRow label="Sharpen" min={0} max={1} step={0.01} value={g.sharpen} onChange={(v) => touched((c) => { c.color.sharpen = v; })} />
        <NumRow label="Grain" min={0} max={1} step={0.01} value={g.grain} onChange={(v) => touched((c) => { c.color.grain = v; })} />
        <NumRow label="Fade" min={0} max={1} step={0.01} value={g.fade} onChange={(v) => touched((c) => { c.color.fade = v; })} />
        <NumRow label="Vignette" min={0} max={1} step={0.01} value={g.vignette} onChange={(v) => touched((c) => { c.color.vignette = v; })} />
        <NumRow label="Vig. soft" min={0.05} max={1} step={0.01} value={g.vignetteSoft} onChange={(v) => touched((c) => { c.color.vignetteSoft = v; })} />
      </SliderSection>

      <SliderSection title={`LUT Library (${luts.length})`}>
        <label style={{ fontSize: 11, color: "var(--text-2)", cursor: "pointer" }}>
          ＋ Import .cube LUT
          <input type="file" accept=".cube" style={{ display: "none" }} onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const parsed = parseCube(await f.text(), f.name.replace(/\.cube$/i, ""));
              useStore.getState().addLut({ id: "lut_" + parsed.name, name: parsed.name, size: parsed.size, data: parsed.data });
              toast("LUT loaded: " + parsed.name);
            } catch (err) {
              toast("LUT error: " + (err as Error).message);
            }
          }} />
        </label>
        {luts.map((l) => (
          <div key={l.name} className="lut-row">
            <input type="radio" checked={clip.lut?.name === l.name}
              onChange={() => set((c) => { c.lut = { name: l.name, intensity: c.lut?.intensity ?? 1, enabled: true }; })}
              data-tip={`Apply ${l.name} to this clip`} />
            <span style={{ flex: 1, fontSize: 12 }}>{l.name} <span style={{ color: "var(--text-2)", fontSize: 10 }}>{l.size}³</span></span>
          </div>
        ))}
        {clip.lut && (
          <>
            <NumRow label="Intensity" min={0} max={1} step={0.01} value={clip.lut.intensity} onChange={(v) => set((c) => { if (c.lut) c.lut.intensity = v; })} />
            <div className="row">
              <span className="lbl">LUT preview</span>
              <ToggleBtn on={clip.lut.enabled} onClick={() => set((c) => { if (c.lut) c.lut.enabled = !c.lut.enabled; })}>
                {clip.lut.enabled ? "ENABLED" : "OFF"}
              </ToggleBtn>
              <button className="ghost" style={{ color: "var(--danger)" }} onClick={() => set((c) => { c.lut = undefined; })}>Remove from clip</button>
            </div>
          </>
        )}
      </SliderSection>

      {presets.length > 0 && (
        <SliderSection title="Presets">
          {presets.map((pr, i) => (
            <div key={i} className="lut-row">
              <span style={{ flex: 1, fontSize: 12 }}>{pr.name}</span>
              <button onClick={() => set((c) => {
                c.color = JSON.parse(JSON.stringify(pr.color));
                c.curves = JSON.parse(JSON.stringify(pr.curves));
              })}>Apply</button>
              <button className="mini-btn" style={{ color: "var(--danger)" }}
                onClick={() => commit((p) => { p.savedColorPresets.splice(i, 1); })}>✕</button>
            </div>
          ))}
        </SliderSection>
      )}
    </>
  );
}

function SliderSection({
  title, children, rightNode,
}: { title: string; children: React.ReactNode; rightNode?: React.ReactNode }) {
  return (
    <div className="insp-section">
      <div className="sec-head"><span>{title}</span>{rightNode}</div>
      <div className="sec-body">{children}</div>
    </div>
  );
}

const WHEEL_BG = "conic-gradient(from 90deg, #ff6a6a, #ffd76a, #7dff7d, #6ad1ff, #b07dff, #ff6ab0, #ff6a6a), radial-gradient(circle, #808080 0%, #606060 100%)";

function ColorWheel({
  label, rgb, onChange,
}: {
  label: string;
  rgb: [number, number, number];
  onChange: (r: number, g: number, b: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  let r = rgb[0], g = rgb[1], b = rgb[2];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div
        ref={ref}
        className="wheel"
        style={{ background: WHEEL_BG }}
        title={`${label} — drag to shift R/G/B balance`}
        onMouseDown={(e) => {
          const el = ref.current!;
          const rect = el.getBoundingClientRect();
          const mv = (ev: MouseEvent | React.MouseEvent) => {
            const mx = (ev as MouseEvent).clientX;
            const my = (ev as MouseEvent).clientY;
            const nx = ((mx - rect.left) / rect.width - 0.5) * 2;
            const ny = ((my - rect.top) / rect.height - 0.5) * 2;
            const mag = Math.min(1, Math.hypot(nx, ny));
            const red = nx, green = -ny;
            const scale = Math.min(1, mag);
            onChange(
              Math.max(-1, Math.min(1, red * scale * 0.9)),
              Math.max(-1, Math.min(1, green * scale * 0.9)),
              Math.max(-1, Math.min(1, ((red + green) / -2) * scale * 0.9))
            );
          };
          mv(e);
          const up = () => {
            window.removeEventListener("mousemove", mv as any);
            window.removeEventListener("mouseup", up);
          };
          window.addEventListener("mousemove", mv as any);
          window.addEventListener("mouseup", up);
        }}
      >
        <div
          className="wheel-dot"
          style={{
            left: `${50 + Math.max(-45, Math.min(45, r * 50))}%`,
            top: `${50 - Math.max(-45, Math.min(45, g * 50))}%`,
          }}
        />
      </div>
      <span style={{ fontSize: 10, color: "var(--text-2)" }}>{label}</span>
    </div>
  );
}

function CurveEditor({
  points, onChange, color,
}: {
  points: RGBPoint[];
  onChange: (pts: RGBPoint[]) => void;
  color: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const S = 220;
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    const canvas = ref.current!;
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#151619";
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = "#26282d";
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((S / 4) * i, 0); ctx.lineTo((S / 4) * i, S);
      ctx.moveTo(0, (S / 4) * i); ctx.lineTo(S, (S / 4) * i);
      ctx.stroke();
    }
    // diagonal reference
    ctx.strokeStyle = "#3a3d44";
    ctx.beginPath(); ctx.moveTo(0, S); ctx.lineTo(S, 0); ctx.stroke();

    const sorted = [...points].sort((a, b) => a.x - b.x);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const evalAt = (x: number) => {
      if (sorted.length < 2) return x;
      if (x <= sorted[0].x) return sorted[0].y;
      if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y;
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i], b = sorted[i + 1];
        if (x >= a.x && x <= b.x) {
          const p = (x - a.x) / (b.x - a.x || 1e-6);
          const sp = p * p * (3 - 2 * p);
          return a.y + (b.y - a.y) * sp;
        }
      }
      return x;
    };
    for (let px = 0; px <= S; px++) {
      const y = evalAt(px / S);
      const yy = S - y * S;
      if (px === 0) ctx.moveTo(px, yy); else ctx.lineTo(px, yy);
    }
    ctx.stroke();
    ctx.fillStyle = "#f5f5f5";
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x * S, S - p.y * S, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [points, color]);

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = ref.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
  };

  return (
    <canvas
      ref={ref}
      className="curve-editor"
      style={{ width: S, height: S }}
      onMouseDown={(e) => {
        const { x, y } = local(e);
        const hit = points.findIndex((p) => Math.hypot(p.x - x, p.y - y) < 0.05);
        if (hit >= 0) {
          setDragIdx(hit);
          const mv = (ev: MouseEvent) => {
            const { x: nx, y: ny } = local(ev);
            const pts = [...points];
            pts[dragIdxRef.current!] = { x: nx, y: ny };
            onChange(pts);
          };
          dragIdxRef.current = hit;
          const up = () => {
            window.removeEventListener("mousemove", mv);
            window.removeEventListener("mouseup", up);
            setDragIdx(null);
          };
          dragIdxRef.current = hit;
          window.addEventListener("mousemove", mv);
          window.addEventListener("mouseup", up);
        } else {
          const pts = [...points, { x, y }].sort((a, b) => a.x - b.x);
          onChange(pts);
        }
      }}
      onDoubleClick={(e) => {
        const { x, y } = local(e);
        const hit = points.findIndex((p) => Math.hypot(p.x - x, p.y - y) < 0.05);
        if (hit > 0 && hit < points.length - 1) {
          const pts = [...points];
          pts.splice(hit, 1);
          onChange(pts);
        }
      }}
    />
  );
}

const dragIdxRef: { current: number | null } = { current: null };

function toast(msg: string) {
  (window as any).__fc_toast = msg;
  window.dispatchEvent(new CustomEvent("fc-toast"));
}
