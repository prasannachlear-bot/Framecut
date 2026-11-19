import React, { useEffect } from "react";
import { useStore } from "../state/store";
import { Clip, defaultText, uid, defaultCurve } from "../state/types";
import { NumRow, Section, ToggleBtn } from "./widgets";
import {
  KEYFRAME_PROPS, removeKeyAt, upsertKey, evalEase,
} from "../state/keyframes";
import { timecode } from "../state/ops";
import { EFFECTS } from "../render/effectsDefs";
import { TRANSITIONS } from "../render/transitions";
import { parseCube } from "../lut/parseCube";
import { putBlob } from "../storage/db";

export function Inspector() {
  const selection = useStore((s) => s.selection);
  const clip = useStore((s) => (s.selection.length ? s.project.clips[s.selection[0]] : undefined));
  const tab = useStore((s) => s.inspectorTab);
  const setTab = useStore((s) => s.setInspectorTab);
  const project = useStore((s) => s.project);
  const fps = project.settings.fps;

  if (!clip) {
    return (
      <div className="inspector">
        <div className="insp-header">Inspector</div>
        <div className="empty">
          Select a clip in the timeline to edit its transform, colour, text, audio,
          effects and keyframes.<br /><br />
          Workflow: <b>Import</b> → drag to timeline → <b>cut / trim</b> → add
          <b> transitions</b>, <b>text</b>, <b>music</b> → grade in <b>Color</b> → <b>Export</b>.
        </div>
      </div>
    );
  }

  const tabs: [string, string][] = [
    ["transition", "⇄"],
    ["video", "Video"],
    ["transform", "Transform"],
    ["color", "Colour"],
    ["text", "Text"],
    ["audio", "Audio"],
    ["effects", "Effects"],
    ["keys", "Keys"],
  ];
  const visible = tabs.filter(([k]) => {
    if (k === "text") return clip.type === "text";
    if (k === "audio") return clip.type !== "text";
    if (k === "transition") return !!clip.transitionIn;
    if (k === "video") return clip.type !== "audio";
    if (k === "color") return clip.type === "video" || clip.type === "image";
    return k === "transform" ? clip.type !== "audio" : true;
  });

  return (
    <div className="inspector">
      <div className="insp-header">{clip.name}</div>
      <div className="insp-sub">
        {clip.type.toUpperCase()} · start {timecode(clip.start, fps)} · dur {clip.duration.toFixed(2)}s
      </div>
      <div className="insp-tabs">
        {visible.map(([k, label]) => (
          <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === "transition" && <TransitionTab clip={clip} />}
      {tab === "transform" && <TransformTab clip={clip} />}
      {tab === "video" && <VideoTab clip={clip} />}
      {tab === "color" && <ColorTab clip={clip} />}
      {tab === "text" && <TextTab clip={clip} />}
      {tab === "audio" && <AudioTab clip={clip} />}
      {tab === "effects" && <EffectsTab clip={clip} />}
      {tab === "keys" && <KeysTab clip={clip} />}
    </div>
  );
}

function TransitionTab({ clip }: { clip: Clip }) {
  const t = clip.transitionIn!;
  const commit = useStore((s) => s.commit);
  const setClip = (fn: (c: Clip) => void) => commit((p) => { const c = p.clips[clip.id]; if (c) fn(c); });
  return (
    <>
      <Section title="Transition">
        <div className="row">
          <span className="lbl">Type</span>
          <select className="wide" value={t.type}
            onChange={(e) => setClip((c) => { if (c.transitionIn) c.transitionIn.type = e.target.value as any; })}>
            {TRANSITIONS.map((td) => <option key={td.type} value={td.type}>{td.label}</option>)}
          </select>
        </div>
        <NumRow label="Duration" min={0.1} max={Math.min(4, clip.duration)} step={0.05} fmt={(v) => v.toFixed(2) + "s"}
          value={t.duration} onChange={(v) => setClip((c) => { if (c.transitionIn) c.transitionIn.duration = v; })} />
        {TRANSITIONS.find((x) => x.type === t.type)?.dir && (
          <div className="row">
            <span className="lbl">Direction</span>
            <select className="wide" value={t.direction}
              onChange={(e) => setClip((c) => { if (c.transitionIn) c.transitionIn.direction = parseInt(e.target.value); })}>
              <option value={1}>Forward</option>
              <option value={-1}>Reverse</option>
            </select>
          </div>
        )}
        <NumRow label="Intensity" min={0.2} max={2} step={0.05} value={t.intensity}
          onChange={(v) => setClip((c) => { if (c.transitionIn) c.transitionIn.intensity = v; })} />
        <div className="row">
          <span className="lbl">Easing</span>
          <select className="wide" value={t.ease}
            onChange={(e) => setClip((c) => { if (c.transitionIn) c.transitionIn.ease = e.target.value as any; })}>
            {["linear", "easeIn", "easeOut", "easeInOut", "bezier"].map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button style={{ flex: 1 }} onClick={() => {
            // preview: jump playhead to transition start
            useStore.getState().setPlayhead(Math.max(0, clip.start - t.duration / 2));
            useStore.getState().setPlaying(true);
          }} data-tip="Play through the transition">▶ Preview</button>
          <button style={{ flex: 1, color: "var(--danger)" }} onClick={() => setClip((c) => { c.transitionIn = undefined; })}>Remove</button>
        </div>
      </Section>
      <div className="empty">Drop new transitions from the <b>Transitions</b> tab onto clip boundaries.</div>
    </>
  );
}

function TransformTab({ clip }: { clip: Clip }) {
  const commit = useStore((s) => s.commit);
  const set = (fn: (c: Clip) => void) => commit((p) => { fn(p.clips[clip.id]); });
  const t = clip.transform;
  return (
    <>
      <Section title="Position & Size">
        <NumRow label="Position X" min={-1} max={1} step={0.005} value={t.x} onChange={(v) => set((c) => { c.transform.x = v; })} tip="Horizontal offset — fraction of frame" />
        <NumRow label="Position Y" min={-1} max={1} step={0.005} value={t.y} onChange={(v) => set((c) => { c.transform.y = v; })} />
        <NumRow label="Scale" min={0.05} max={4} step={0.01} value={t.scale} onChange={(v) => set((c) => { c.transform.scale = v; })} />
        <NumRow label="Rotation" min={-180} max={180} step={1} fmt={(v) => v.toFixed(0) + "°"} value={t.rotation} onChange={(v) => set((c) => { c.transform.rotation = v; })} />
        <NumRow label="Anchor X" min={0} max={1} step={0.01} value={t.anchorX} onChange={(v) => set((c) => { c.transform.anchorX = v; })} />
        <NumRow label="Anchor Y" min={0} max={1} step={0.01} value={t.anchorY} onChange={(v) => set((c) => { c.transform.anchorY = v; })} />
        <NumRow label="Opacity" min={0} max={1} step={0.01} value={t.opacity} onChange={(v) => set((c) => { c.transform.opacity = v; })} />
      </Section>
      <Section title="Crop">
        {(["l", "t", "r", "b"] as const).map((k) => (
          <NumRow key={k} label={"Crop " + k.toUpperCase()} min={0} max={0.9} step={0.005} value={clip.crop[k]}
            onChange={(v) => set((c) => { c.crop[k] = v; })} />
        ))}
      </Section>
      <Section title="Blend Mode">
        <div className="row">
          <select className="wide" value={clip.blendMode} onChange={(e) => set((c) => { c.blendMode = e.target.value as GlobalCompositeOperation; })}>
            {["source-over", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"].map((m) => (
              <option key={m} value={m}>{m === "source-over" ? "normal" : m}</option>
            ))}
          </select>
        </div>
      </Section>
    </>
  );
}

function VideoTab({ clip }: { clip: Clip }) {
  const commit = useStore((s) => s.commit);
  const assets = useStore((s) => s.assets);
  const asset = clip.assetId ? assets[clip.assetId] : undefined;
  const set = (fn: (c: Clip) => void) => commit((p) => { fn(p.clips[clip.id]); });
  const maxDur = asset && clip.type === "video" ? (asset.duration - clip.inPoint) / clip.speed : 3600;
  return (
    <>
      <Section title="Timing & Speed">
        <NumRow label="Speed" min={0.25} max={4} step={0.05} fmt={(v) => v.toFixed(2) + "×"}
          value={clip.speed}
          onChange={(v) => set((c) => {
            const srcLen = c.duration * c.speed;
            c.speed = v;
            c.duration = Math.min(srcLen / v, maxDur * 0.999);
          })} />
        <div className="row">
          <span className="lbl">Duration</span>
          <input type="number" value={clip.duration.toFixed(2)} step={0.1} min={0.1} max={maxDur}
            onChange={(e) => set((c) => { c.duration = Math.max(0.1, Math.min(parseFloat(e.target.value) || 1, maxDur * 0.999)); })} />
          <span className="val" style={{ color: "var(--text-2)" }}>{clip.type === "image" ? "still" : `max ${maxDur.toFixed(1)}s`}</span>
        </div>
        <div className="row">
          <span className="lbl" data-tip="Not supported by the browser media engine — see docs/LIMITATIONS.md for the workaround">Reverse</span>
          <span style={{ fontSize: 11, color: "var(--text-2)" }} data-tip="Not supported by the browser media engine — see docs/LIMITATIONS.md">
            ⏪ Reversed playback — future feature
          </span>
        </div>
      </Section>
      <Section title="Source">
        <div className="sub" style={{ fontSize: 11, color: "var(--text-2)" }}>
          Asset: {asset?.name ?? "—"}<br />
          In: {clip.inPoint.toFixed(2)}s · Source {asset ? timecode(asset.duration, 30) : "—"}<br />
          {asset ? `${asset.width}×${asset.height}${asset.fps ? ` @ ${asset.fps}fps` : ""}` : ""}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button style={{ flex: 1 }} onClick={() => set((c) => { c.frozenAt = c.frozenAt != null ? undefined : clip.inPoint + (useStore.getState().playhead - c.start) * c.speed; })}>
            {clip.frozenAt != null ? "▶ Unfreeze" : "⏸ Freeze Frame"}
          </button>
        </div>
      </Section>
      {clip.type === "video" && (
        <Section title="Image Stabilisation">
          <div className="sub" style={{ fontSize: 11, color: "var(--text-2)" }}>
            Requires per-frame motion analysis (future feature) — see docs/LIMITATIONS.md.
          </div>
        </Section>
      )}
    </>
  );
}

function ColorTab({ clip }: { clip: Clip }) {
  const commit = useStore((s) => s.commit);
  const luts = useStore((s) => s.luts);
  const setDock = useStore((s) => s.setDockTab);
  const set = (fn: (c: Clip) => void) => commit((p) => { fn(p.clips[clip.id]); });
  const g = clip.color;
  const on = (fn: (c: Clip) => void) => set((c) => { c.color.enable = true; fn(c); });

  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <ToggleBtn on={g.enable} onClick={() => set((c) => { c.color.enable = !c.color.enable; })} tip="Enable basic grade">Grade {g.enable ? "ON" : "OFF"}</ToggleBtn>
        <button className="ghost" onClick={() => setDock("color")} data-tip="Open the full colour workspace">◈ Open Color workspace</button>
      </div>
      <Section title="Basic Correction">
        <NumRow label="Exposure" min={-3} max={3} step={0.05} value={g.exposure} onChange={(v) => on((c) => { c.color.exposure = v; })} tip="Stops of exposure" />
        <NumRow label="Brightness" min={-1} max={1} step={0.01} value={g.brightness} onChange={(v) => on((c) => { c.color.brightness = v; })} />
        <NumRow label="Contrast" min={-1} max={1} step={0.01} value={g.contrast} onChange={(v) => on((c) => { c.color.contrast = v; })} />
        <NumRow label="Highlights" min={-1} max={1} step={0.01} value={g.highlights} onChange={(v) => on((c) => { c.color.highlights = v; })} />
        <NumRow label="Shadows" min={-1} max={1} step={0.01} value={g.shadows} onChange={(v) => on((c) => { c.color.shadows = v; })} />
        <NumRow label="Whites" min={-1} max={1} step={0.01} value={g.whites} onChange={(v) => on((c) => { c.color.whites = v; })} />
        <NumRow label="Blacks" min={-1} max={1} step={0.01} value={g.blacks} onChange={(v) => on((c) => { c.color.blacks = v; })} />
        <NumRow label="Temperature" min={-1} max={1} step={0.01} value={g.temperature} onChange={(v) => on((c) => { c.color.temperature = v; })} />
        <NumRow label="Tint" min={-1} max={1} step={0.01} value={g.tint} onChange={(v) => on((c) => { c.color.tint = v; })} />
        <NumRow label="Saturation" min={-1} max={1} step={0.01} value={g.saturation} onChange={(v) => on((c) => { c.color.saturation = v; })} />
        <NumRow label="Vibrance" min={-1} max={1} step={0.01} value={g.vibrance} onChange={(v) => on((c) => { c.color.vibrance = v; })} />
        <NumRow label="Hue" min={0} max={360} step={1} fmt={(v) => v.toFixed(0) + "°"} value={g.hue} onChange={(v) => on((c) => { c.color.hue = v; })} />
        <NumRow label="Fade" min={0} max={1} step={0.01} value={g.fade} onChange={(v) => on((c) => { c.color.fade = v; })} />
        <NumRow label="Vignette" min={0} max={1} step={0.01} value={g.vignette} onChange={(v) => on((c) => { c.color.vignette = v; })} />
        <NumRow label="Grain" min={0} max={1} step={0.01} value={g.grain} onChange={(v) => on((c) => { c.color.grain = v; })} />
        <NumRow label="Sharpen" min={0} max={1} step={0.01} value={g.sharpen} onChange={(v) => on((c) => { c.color.sharpen = v; })} />
      </Section>
      <Section title="LUT">
        <div className="row">
          <label style={{ fontSize: 11, color: "var(--text-2)", cursor: "pointer" }}>
            ＋ Import .cube
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
        </div>
        {luts.map((l) => (
          <div key={l.name} className="lut-row">
            <input type="radio" checked={clip.lut?.name === l.name} onChange={() => set((c) => { c.lut = { name: l.name, intensity: c.lut?.intensity ?? 1, enabled: true }; })} />
            <span style={{ flex: 1, fontSize: 12 }}>{l.name} <span style={{ color: "var(--text-2)" }}>({l.size}³)</span></span>
            {clip.lut?.name === l.name && (
              <>
                <NumRow label="" min={0} max={1} step={0.01} value={clip.lut.intensity} onChange={(v) => set((c) => { if (c.lut) c.lut.intensity = v; })} />
                <ToggleBtn on={clip.lut.enabled} onClick={() => set((c) => { if (c.lut) c.lut.enabled = !c.lut.enabled; })} tip="Toggle LUT preview">ON</ToggleBtn>
              </>
            )}
          </div>
        ))}
        {clip.lut && (
          <button className="ghost" style={{ color: "var(--danger)" }} onClick={() => set((c) => { c.lut = undefined; })}>Remove LUT from clip</button>
        )}
      </Section>
      <Section title="Curves" right={<button className="mini-btn" onClick={() => set((c) => { c.curves = defaultCurve(); })} data-tip="Reset curves">↺</button>}>
        <div className="sub" style={{ fontSize: 11, color: "var(--text-2)" }}>
          Open the <b>Color</b> workspace (dock) for the full curve editor, wheels and scopes.
        </div>
      </Section>
    </>
  );
}

function TextTab({ clip }: { clip: Clip }) {
  const commit = useStore((s) => s.commit);
  const fonts = useStore((s) => s.project.customFonts);
  const set = (fn: (c: Clip) => void) => commit((p) => { fn(p.clips[clip.id]); });
  const t = clip.text ?? defaultText();
  const setT = (fn: (x: any) => void) => set((c) => { if (c.text) fn(c.text); });

  return (
    <>
      <Section title="Content">
        <textarea
          className="wide" rows={3} style={{ width: "100%" }} value={t.content}
          onChange={(e) => setT((x) => { x.content = e.target.value; })}
          data-tip="Edit text — this is what renders in the preview"
        />
        <div className="row" style={{ gap: 6 }}>
          <select className="wide" value={t.fontFamily} onChange={(e) => setT((x) => { x.fontFamily = e.target.value; })}>
            {["Inter", "Arial", "Georgia", "Impact", "Courier New", "Times New Roman", "Trebuchet MS", "Verdana", ...fonts.map((f) => f.name)].map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <select className="wide" value={t.fontWeight} onChange={(e) => setT((x) => { x.fontWeight = parseInt(e.target.value); })}>
            {[300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <ToggleBtn on={t.italic} onClick={() => setT((x) => { x.italic = !x.italic; })}>Italic</ToggleBtn>
        </div>
      </Section>
      <Section title="Typography">
        <NumRow label="Size" min={0.02} max={0.4} step={0.005} fmt={(v) => (v * 100).toFixed(1) + "%"} value={t.fontSize} onChange={(v) => setT((x) => { x.fontSize = v; })} tip="Fraction of frame height" />
        <NumRow label="Spacing" min={-0.1} max={0.5} step={0.005} value={t.letterSpacing} onChange={(v) => setT((x) => { x.letterSpacing = v; })} tip="Letter-spacing (em)" />
        <NumRow label="Line height" min={0.8} max={2.4} step={0.05} value={t.lineHeight} onChange={(v) => setT((x) => { x.lineHeight = v; })} />
        <div className="row">
          <span className="lbl">Align</span>
          {(["left", "center", "right"] as const).map((a) => (
            <ToggleBtn key={a} on={t.align === a} onClick={() => setT((x) => { x.align = a; })}>{a}</ToggleBtn>
          ))}
        </div>
        <div className="row"><span className="lbl">Colour</span><input type="color" value={t.color} onChange={(e) => setT((x) => { x.color = e.target.value; })} />
          <span className="lbl" style={{ width: 60 }}>Background</span>
          {t.bg === "none" ? <button className="mini-btn" onClick={() => setT((x) => { x.bg = "#000000cc"; })} data-tip="Enable background box">BG</button>
            : <><input type="color" value={"#000000"} onChange={(e) => setT((x) => { x.bg = e.target.value + "cc"; })} />
                <button className="mini-btn" onClick={() => setT((x) => { x.bg = "none"; })}>✕</button></>}
        </div>
        <div className="row"><span className="lbl">Stroke</span><input type="color" value={t.strokeColor} onChange={(e) => setT((x) => { x.strokeColor = e.target.value; })} />
          <NumRow label="" min={0} max={0.2} step={0.005} value={t.strokeWidth} onChange={(v) => setT((x) => { x.strokeWidth = v; })} />
        </div>
        <div className="row"><span className="lbl">Shadow</span>
          <input type="color" value={t.shadowColor} onChange={(e) => setT((x) => { x.shadowColor = e.target.value; })} />
          <NumRow label="" min={0} max={40} step={1} value={t.shadowBlur} onChange={(v) => setT((x) => { x.shadowBlur = v; })} />
          <NumRow label="" min={0} max={20} step={1} value={t.shadowXY} onChange={(v) => setT((x) => { x.shadowXY = v; })} />
        </div>
      </Section>
      <Section title="Animation">
        <div className="row">
          <span className="lbl">In</span>
          <select className="wide" value={t.inAnim} onChange={(e) => setT((x) => { x.inAnim = e.target.value; })}>
            {["none", "fade", "slideUp", "slideDown", "slideLeft", "slideRight", "typewriter", "tracking", "scaleUp", "pop"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="row">
          <span className="lbl">Out</span>
          <select className="wide" value={t.outAnim} onChange={(e) => setT((x) => { x.outAnim = e.target.value; })}>
            {["none", "fade", "slideUp", "slideDown", "slideLeft", "slideRight", "typewriter", "tracking", "scaleUp", "pop"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="row">
          <span className="lbl">Scope</span>
          {(["whole", "word", "char"] as const).map((m) => (
            <ToggleBtn key={m} on={t.animMode === m} onClick={() => setT((x) => { x.animMode = m; })} tip={`Animate ${m === "whole" ? "whole block" : "per " + m}`}>{m}</ToggleBtn>
          ))}
        </div>
        <NumRow label="Anim time" min={0.1} max={3} step={0.05} fmt={(v) => v.toFixed(2) + "s"} value={t.animDuration} onChange={(v) => setT((x) => { x.animDuration = v; })} />
      </Section>
      <Section title="Transform">
        <NumRow label="Position X" min={-1} max={1} step={0.005} value={clip.transform.x} onChange={(v) => set((c) => { c.transform.x = v; })} />
        <NumRow label="Position Y" min={-1} max={1} step={0.005} value={clip.transform.y} onChange={(v) => set((c) => { c.transform.y = v; })} />
        <NumRow label="Scale" min={0.1} max={4} step={0.05} value={clip.transform.scale} onChange={(v) => set((c) => { c.transform.scale = v; })} />
        <NumRow label="Rotation" min={-180} max={180} step={1} fmt={(v) => v.toFixed(0) + "°"} value={clip.transform.rotation} onChange={(v) => set((c) => { c.transform.rotation = v; })} />
        <NumRow label="Opacity" min={0} max={1} step={0.01} value={clip.transform.opacity} onChange={(v) => set((c) => { c.transform.opacity = v; })} />
      </Section>
      <Section title="Custom Fonts">
        <label style={{ fontSize: 11, color: "var(--text-2)", cursor: "pointer" }}>
          ＋ Load .ttf / .otf / .woff
          <input type="file" accept=".ttf,.otf,.woff,.woff2" multiple style={{ display: "none" }}
            onChange={async (e) => {
              for (const f of Array.from(e.target.files ?? [])) {
                const name = f.name.replace(/\.[^.]+$/, "");
                const buf = await f.arrayBuffer();
                const font = new FontFace(name, buf);
                await font.load();
                (document.fonts as any).add(font);
                const blob = new Blob([buf]);
                const blobId = "font_" + name;
                await putBlob(blobId, blob);
                commit((p) => { p.customFonts.push({ name, blobId }); });
              }
              toast("Fonts loaded");
            }} />
        </label>
      </Section>
    </>
  );
}

function AudioTab({ clip }: { clip: Clip }) {
  const commit = useStore((s) => s.commit);
  const set = (fn: (c: Clip) => void) => commit((p) => { fn(p.clips[clip.id]); });
  const a = clip.audio;
  return (
    <Section title="Audio">
      <NumRow label="Volume" min={0} max={2} step={0.01} value={a.volume} onChange={(v) => set((c) => { c.audio.volume = v; })} />
      <NumRow label="Balance" min={-1} max={1} step={0.01} value={a.pan} onChange={(v) => set((c) => { c.audio.pan = v; })} tip="Left / right pan" />
      <NumRow label="Fade in" min={0} max={10} step={0.1} fmt={(v) => v.toFixed(1) + "s"} value={a.fadeIn} onChange={(v) => set((c) => { c.audio.fadeIn = v; })} />
      <NumRow label="Fade out" min={0} max={10} step={0.1} fmt={(v) => v.toFixed(1) + "s"} value={a.fadeOut} onChange={(v) => set((c) => { c.audio.fadeOut = v; })} />
      <NumRow label="Ducking" min={0} max={1} step={0.05} value={a.duck} onChange={(v) => set((c) => { c.audio.duck = v; })} tip="Lower this clip's volume while other audio plays (e.g. music under dialogue)" />
      <div className="row">
        <span className="lbl">Mute clip</span>
        <ToggleBtn on={a.muted} onClick={() => set((c) => { c.audio.muted = !c.audio.muted; })}>{a.muted ? "MUTED" : "ON"}</ToggleBtn>
      </div>
    </Section>
  );
}

function EffectsTab({ clip }: { clip: Clip }) {
  const commit = useStore((s) => s.commit);
  const set = (fn: (c: Clip) => void) => commit((p) => { fn(p.clips[clip.id]); });
  const move = (idx: number, dir: number) => set((c) => {
    const j = idx + dir;
    const tmp = c.effects[idx];
    c.effects[idx] = c.effects[j];
    c.effects[j] = tmp;
  });
  return (
    <Section title="Effect Stack (top renders first)">
      {clip.effects.length === 0 ? <div className="sub" style={{ color: "var(--text-2)", fontSize: 11 }}>No effects — add from the Effects library tab.</div> : null}
      {clip.effects.map((e, idx) => {
        const def = EFFECTS.find((d) => d.type === e.type);
        return (
          <div key={e.id} style={{ border: "1px solid var(--border)", borderRadius: 5, padding: "6px 8px", marginBottom: 4, background: "var(--panel)" }}>
            <div className="row" style={{ marginBottom: 2 }}>
              <input type="checkbox" checked={e.enabled} onChange={() => set((c) => { c.effects[idx].enabled = !c.effects[idx].enabled; })} data-tip="Toggle effect" />
              <span style={{ flex: 1, fontSize: 12 }}>{def?.label ?? e.type}</span>
              <button className="mini-btn" onClick={() => move(idx, -1)} disabled={idx === 0} data-tip="Move up">↑</button>
              <button className="mini-btn" onClick={() => move(idx, 1)} disabled={idx === clip.effects.length - 1} data-tip="Move down">↓</button>
              <button className="mini-btn" style={{ color: "var(--danger)" }} onClick={() => set((c) => { c.effects.splice(idx, 1); })} data-tip="Remove effect">✕</button>
            </div>
            {def?.params.map((p) => (
              <NumRow key={p.key} label={p.label} min={p.min} max={p.max} step={p.step}
                value={e.params[p.key] ?? p.def}
                onChange={(v) => commit((pp) => { const c = pp.clips[clip.id]; c.effects[idx].params[p.key] = v; })} />
            ))}
          </div>
        );
      })}
    </Section>
  );
}

function KeysTab({ clip }: { clip: Clip }) {
  const commit = useStore((s) => s.commit);
  const playhead = useStore((s) => s.playhead);
  const fps = useStore((s) => s.project.settings.fps);
  const localT = Math.max(0, playhead - clip.start);
  const jump = (t: number) => useStore.getState().setPlayhead(clip.start + t);

  return (
    <Section title={`Keyframes · clip time ${timecode(localT, fps)}`}>
      {KEYFRAME_PROPS.map(({ key, label }) => {
        const kt = clip.keyframes.find((k) => k.prop === key);
        const current = getPropValue(clip, key);
        return (
          <div key={key} style={{ borderBottom: "1px solid var(--border-soft)", paddingBottom: 6 }}>
            <div className="row">
              <span className="lbl">{label}</span>
              <span className="val" style={{ width: 54 }}>{current.toFixed(2)}</span>
              <button className="mini-btn" onClick={() => commit((p) => {
                const c = p.clips[clip.id];
                c.keyframes = upsertKey(c.keyframes, key, localT, current);
              })} data-tip="Add / update keyframe at playhead">◆+</button>
              <button className="mini-btn" disabled={!kt} onClick={() => commit((p) => {
                const c = p.clips[clip.id];
                c.keyframes = removeKeyAt(c.keyframes, key, localT);
              })} data-tip="Remove keyframe at playhead">✕</button>
              <button className="mini-btn" disabled={!kt} onClick={() => commit((p) => {
                const c = p.clips[clip.id];
                c.keyframes = c.keyframes.filter((k) => k.prop !== key);
              })} data-tip="Clear all keys for this property">CLR</button>
            </div>
            {kt && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                {kt.keys.map((k, i) => (
                  <span key={i} style={{ fontSize: 10, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 3, padding: "1px 5px", cursor: "pointer" }}
                    onClick={() => jump(k.t)} title={`${k.value.toFixed(2)} @ ${k.t.toFixed(2)}s`}>
                    {k.t.toFixed(2)}s·{k.value.toFixed(1)}
                    <select style={{ fontSize: 9, background: "transparent", border: "none", color: "var(--text-2)", width: 44 }}
                      value={k.ease}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => commit((p) => {
                        const c = p.clips[clip.id];
                        const kk = c.keyframes.find((x) => x.prop === key)!.keys[i];
                        kk.ease = e.target.value as any;
                      })}>
                      {["linear", "easeIn", "easeOut", "easeInOut", "bezier"].map((o) => <option key={o} value={o}>{o.replace("ease", "")}</option>)}
                    </select>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="sub" style={{ fontSize: 10.5, color: "var(--text-2)" }}>
        Move the playhead, change a value in Transform, then press <b>◆+</b> to key it. Animate position, scale, rotation, opacity.
      </div>
    </Section>
  );
}

function getPropValue(clip: Clip, prop: string): number {
  const [a, b] = prop.split(".");
  const o = (clip as any)[a];
  if (b) return o?.[b] ?? 0;
  if (a === "transform.opacity") return clip.transform.opacity;
  return 0;
}

function toast(msg: string) {
  window.dispatchEvent(new CustomEvent("fc-toast"));
  (window as any).__fc_toast = msg;
}
