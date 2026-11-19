import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { Asset, Clip, clipsOnTrack, sequenceEnd } from "../state/types";
import {
  addClipFromAsset, addTextClip, applySnap, copySelected, deleteSelected,
  duplicateSelected, extractAudioSelected, freezeFrameSelected, groupSelected,
  pasteClipboard, snapCandidates, splitAtPlayhead, timecode, unlinkSelected,
} from "../state/ops";
import { urlFor } from "../media/urls";

const TRACK_H: Record<string, number> = { video: 58, audio: 48, text: 34 };

export function Timeline() {
  const project = useStore((s) => s.project);
  const zoom = useStore((s) => s.zoom);
  const snap = useStore((s) => s.snap);
  const magnetic = useStore((s) => s.magnetic);
  const playhead = useStore((s) => s.playhead);
  const selection = useStore((s) => s.selection);
  const assets = useStore((s) => s.assets);
  const commit = useStore((s) => s.commit);
  const addTrack = useStore((s) => s.addTrack);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headsRef = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);

  const seqDur = sequenceEnd(project.clips);
  const contentW = Math.max(seqDur + 30, 40) * zoom + 400;

  // auto-scroll during playback
  useEffect(() => {
    if (!playingRef()) return;
    const el = scrollRef.current;
    if (!el) return;
    const x = playhead * zoom;
    if (x < el.scrollLeft + 60 || x > el.scrollLeft + el.clientWidth - 120) {
      el.scrollLeft = Math.max(0, x - el.clientWidth / 2);
    }
  }, [playhead, zoom]);

  const playingRef = () => useStore.getState().playing;

  const scrubTo = (e: React.MouseEvent | MouseEvent) => {
    const el = scrollRef.current!;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left + el.scrollLeft - 0.5;
    useStore.getState().setPlayhead(Math.max(0, x / zoom));
  };

  const startScrub = (e: React.MouseEvent) => {
    scrubTo(e);
    const mv = (ev: MouseEvent) => scrubTo(ev);
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  };

  const ticks = useMemo(() => {
    const intervals = [1 / 12, 1 / 4, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600];
    const major = intervals.find((i) => i * zoom >= 90) ?? 600;
    const out: { t: number; major: boolean }[] = [];
    const minor = major / 5;
    for (let t = 0; t <= (seqDur + 30) + major; t += minor) {
      out.push({ t: Math.round(t * 1000) / 1000, major: Math.abs((t / major) % 1) < 1e-6 || Math.abs((t / major) % 1 - 1) < 1e-6 || t % major < 1e-6 });
    }
    return out;
  }, [zoom, seqDur]);

  const anyTrack = project.tracks.length > 0;

  return (
    <div className="timeline-wrap">
      <div className="timeline-toolbar">
        <button onClick={splitAtPlayhead} data-tip="Split clip at playhead (S)">✂ Split</button>
        <button onClick={() => deleteSelected(true)} data-tip="Ripple delete: close the gap (Shift+Del)">⇤ Ripple Del</button>
        <button onClick={() => deleteSelected(false)} data-tip="Delete selected (Del)">Delete</button>
        <div className="vsep" />
        <button onClick={copySelected} data-tip="Copy (Ctrl+C)">Copy</button>
        <button onClick={pasteClipboard} data-tip="Paste at playhead (Ctrl+V)">Paste</button>
        <button onClick={duplicateSelected} data-tip="Duplicate after clip (Ctrl+D)">Duplicate</button>
        <div className="vsep" />
        <button onClick={groupSelected} data-tip="Group selected clips (move together)">Group</button>
        <button onClick={unlinkSelected} data-tip="Unlink A/V or ungroup">Unlink</button>
        <button onClick={extractAudioSelected} data-tip="Extract audio of selected video clip to A-track">Extract Audio</button>
        <button onClick={freezeFrameSelected} data-tip="Grab freeze frame at playhead as still image">Freeze Frame</button>
        <div className="vsep" />
        <button className={snap ? "active" : ""} onClick={() => useStore.getState().setSnap(!snap)} data-tip="Snap to clip edges, playhead, markers">🧲 Snap</button>
        <button className={magnetic ? "active" : ""} onClick={() => useStore.getState().setMagnetic(!magnetic)} data-tip="Magnetic timeline: blocks snap into gaps on move">Magnetic</button>
        <button className="ghost" onClick={addMarkerAtPlayheadSafe} data-tip="Add marker at playhead (M)">⚑ Marker</button>
        <div className="spacer" style={{ flex: 1 }} />
        <span className="tlabel">{timecode(playhead, project.settings.fps)}</span>
        <span className="tlabel">Zoom</span>
        <input type="range" min={4} max={400} step={1} value={zoom}
          onChange={(e) => useStore.getState().setZoom(parseFloat(e.target.value))} style={{ width: 110 }} />
        <button className="ghost" onClick={() => {
          const st = useStore.getState();
          const w = scrollRef.current?.clientWidth ?? 1000;
          st.setZoom(Math.max(4, (w - 160) / Math.max(seqDur, 1)));
        }} data-tip="Zoom to fit">Fit</button>
        <div className="vsep" />
        <button className="ghost" onClick={() => addTrack("video")} data-tip="Add video track">＋V</button>
        <button className="ghost" onClick={() => addTrack("audio")} data-tip="Add audio track">＋A</button>
        <button className="ghost" onClick={() => addTextClip} data-tip="Add text (T)">＋T</button>
      </div>

      <div className="timeline-split">
        <div className="track-heads">
          <div className="ruler-head">TRACKS</div>
          <div className="track-heads-scroll" ref={headsRef}>
            {anyTrack && project.tracks.map((tr) => (
              <TrackHead key={tr.id} id={tr.id} />
            ))}
          </div>
        </div>

        <div
          className="timeline-scroll"
          ref={scrollRef}
          onScroll={() => { if (headsRef.current) headsRef.current.scrollTop = scrollRef.current!.scrollTop; force((x) => x + 1); }}
          onMouseDown={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("track-row")) { scrubTo(e); } }}
        >
          <div style={{ width: contentW, position: "relative" }}>
            <div className="ruler" onMouseDown={startScrub}>
              {ticks.map((tk, i) => {
                if (!tk.major) return <div key={i} style={{ position: "absolute", left: tk.t * zoom, bottom: 0, width: 1, height: 6, background: "#3a3d44" }} />;
                return (
                  <div key={i} style={{ position: "absolute", left: tk.t * zoom, bottom: 0, top: 0, borderLeft: "1px solid #3a3d44", paddingLeft: 4 }}>
                    <span style={{ fontSize: 9.5, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                      {shortTime(tk.t)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="tracks-canvas" style={{ position: "relative" }}>
              {project.tracks.map((tr) => (
                <TrackRow
                  key={tr.id} trackId={tr.id} zoom={zoom}
                  onScrub={(e) => scrubTo(e)}
                  onDropAsset={(assetId, t) => addClipFromAsset(assets[assetId], tr.id, t)}
                  onDropTransition={(type, d, t) => {
                    const candidates = clipsOnTrack(project.clips, tr.id);
                    if (!candidates.length) return;
                    let bestClip: Clip | null = null;
                    let bd = 16 / zoom;
                    for (const c of candidates) {
                      if (c.start <= 0.01) continue;
                      const dist = Math.abs(c.start - t);
                      if (dist < bd) { bd = dist; bestClip = c; }
                    }
                    if (!bestClip) return;
                    const prev = candidates.find((c) => Math.abs(c.start + c.duration - bestClip!.start) < 0.03);
                    if (!prev) { toast("Drops need two adjacent clips"); return; }
                    commit((p) => {
                      const c = p.clips[bestClip!.id];
                      c.transitionIn = {
                        id: "tr_" + c.id, type: type as any,
                        duration: Math.min(d, (c.duration + prev.duration) / 2 - 0.05),
                        direction: 1, intensity: 1, ease: "easeInOut",
                      };
                    });
                    useStore.getState().setInspectorTab("transition");
                  }}
                  onDropEffect={(effType, atT) => {
                    const candidates = clipsOnTrack(project.clips, tr.id);
                    const c = candidates.find((x) => atT >= x.start && atT <= x.start + x.duration);
                    if (!c) { toast("Drop the effect onto a clip"); return; }
                    applyEffectToClip(c.id, effType);
                  }}
                />
              ))}
              <div className="playhead" style={{ left: playhead * zoom }} />
            </div>
          </div>
        </div>
      </div>
      <div className="timeline-hint">
        <span className="kbd">SPACE</span> play · <span className="kbd">S</span> split · <span className="kbd">DEL</span> delete · <span className="kbd">⇧DEL</span> ripple · <span className="kbd">, / .</span> nudge · drag edges to trim · drag transitions onto clip boundaries
      </div>
    </div>
  );
}

function addMarkerAtPlayheadSafe() {
  import("../state/ops").then((m) => m.addMarkerAtPlayhead());
}
function applyEffectToClip(clipId: string, type: string) {
  import("../render/effectsDefs").then(({ EFFECTS }) => {
    const def = EFFECTS.find((d) => d.type === type);
    if (!def) return;
    const st = useStore.getState();
    st.updateClipFn(clipId, (c) => {
      c.effects.push({ id: Math.random().toString(36).slice(2), type: def.type, enabled: true, params: Object.fromEntries(def.params.map((p) => [p.key, p.def])) });
    });
    st.commit(() => {}); // ensure history entry
    st.setInspectorTab("effects");
    st.select([clipId]);
  });
}
function toast(msg: string) {
  (window as any).__fc_toast = msg;
  window.dispatchEvent(new CustomEvent("fc-toast"));
}

function shortTime(t: number): string {
  if (t >= 60) {
    const m = Math.floor(t / 60), s = t % 60;
    return `${m}m${s < 10 ? "0" : ""}${s % 1 === 0 ? s.toFixed(0) : s.toFixed(1)}s`;
  }
  return t % 1 === 0 ? `${t}s` : `${t.toFixed(1)}s`;
}

function TrackHead({ id }: { id: string }) {
  const track = useStore((s) => s.project.tracks.find((t) => t.id === id))!;
  if (!track) return null;
  const h = TRACK_H[track.kind];
  const commit = useStore((s) => s.commit);
  const set = (patch: any) => commit((p) => { const t = p.tracks.find((x) => x.id === id); if (t) Object.assign(t, patch); });
  return (
    <div className={"track-head" + (track.locked ? " track-headLocked" : "")} style={{ height: h }}>
      <div className="tname">
        <span style={{ color: track.kind === "audio" ? "#7fd88f" : track.kind === "text" ? "#c9a0f0" : "var(--text-2)" }}>
          {track.name}
        </span>
        <span className="mini-label" style={{ fontSize: 9, color: "var(--text-2)" }}>
          {track.kind === "video" ? "VID" : track.kind === "audio" ? "AUD" : "TXT"}
        </span>
      </div>
      <div className="tctrl">
        {(track.kind === "video" || track.kind === "text") && (
          <button
            className={"mini-btn" + (track.visible ? " on" : "")}
            onClick={() => set({ visible: !track.visible })}
            data-tip={track.visible ? "Hide track" : "Show track"}
          >◉</button>
        )}
        {track.kind !== "text" && (
          <button
            className={"mini-btn" + (track.muted ? " on" : "")}
            style={track.muted ? { color: "var(--danger)" } : undefined}
            onClick={() => set({ muted: !track.muted })}
            data-tip={track.muted ? "Unmute track" : "Mute track"}
          >M</button>
        )}
        {track.kind !== "text" && (
          <button
            className={"mini-btn" + (track.solo ? " on" : "")}
            onClick={() => set({ solo: !track.solo })}
            data-tip="Solo track"
          >S</button>
        )}
        <button
          className={"mini-btn" + (track.locked ? " on" : "")}
          style={track.locked ? { color: "var(--danger)" } : undefined}
          onClick={() => set({ locked: !track.locked })}
          data-tip={track.locked ? "Unlock track" : "Lock track"}
        >L</button>
        <button className="mini-btn" onClick={() => useStore.getState().removeTrack(id)} data-tip="Remove track">✕</button>
      </div>
    </div>
  );
}

function TrackRow({
  trackId, zoom, onScrub, onDropAsset, onDropTransition, onDropEffect,
}: {
  trackId: string;
  zoom: number;
  onScrub: (e: React.MouseEvent) => void;
  onDropAsset: (assetId: string, t: number) => void;
  onDropTransition: (type: string, dur: number, t: number) => void;
  onDropEffect: (type: string, t: number) => void;
}) {
  const project = useStore((s) => s.project);
  const track = project.tracks.find((t) => t.id === trackId)!;
  const clips = clipsOnTrack(project.clips, trackId);
  const [dropHover, setDropHover] = useState(false);
  const [dropT, setDropT] = useState<number | null>(null);
  if (!track) return null;
  const h = TRACK_H[track.kind];
  const busy = track.locked;

  const timeAt = (clientX: number) => {
    const el = document.getElementById("tl-" + trackId);
    void el;
    const stage = (document.querySelector(".timeline-scroll > div") as HTMLElement);
    const rect = stage.getBoundingClientRect();
    return Math.max(0, ((clientX - rect.left) / zoom));
  };

  return (
    <div
      className={"track-row" + (dropHover ? " drop-target" : "")}
      style={{ height: h }}
      onMouseDown={(e) => { if (!busy && (e.target as HTMLElement).dataset?.row === "1") onScrub(e); }}
      data-row="1"
      onDragOver={(e) => {
        const types = [...e.dataTransfer.types];
        if (types.includes("application/x-framecut-asset") || types.includes("application/x-framecut-transition") || types.includes("application/x-framecut-effect")) {
          e.preventDefault();
          setDropHover(true);
          setDropT(timeAt(e.clientX));
        }
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropHover(false);
        if (busy) return;
        const assetId = e.dataTransfer.getData("application/x-framecut-asset");
        const trans = e.dataTransfer.getData("application/x-framecut-transition");
        const eff = e.dataTransfer.getData("application/x-framecut-effect");
        const t = timeAt(e.clientX);
        if (trans) {
          onDropTransition(trans, parseFloat(e.dataTransfer.getData("application/x-framecut-transition-dur") || "1"), t);
        } else if (assetId) {
          onDropAsset(assetId, t);
        } else if (eff) {
          onDropEffect(eff, t);
        }
      }}
    >
      {dropHover && dropT != null && (
        <div style={{ position: "absolute", left: dropT * zoom - 1, top: 0, bottom: 0, width: 2, background: "var(--accent)", zIndex: 9, pointerEvents: "none" }} />
      )}
      {clips.map((c) => (
        <ClipView
          key={c.id} clip={c} zoom={zoom} height={h} track={track}
        />
      ))}
    </div>
  );
}

function ClipView({
  clip, zoom, height, track,
}: { clip: Clip; zoom: number; height: number; track: any }) {
  const st = useStore.getState();
  const selected = useStore((s) => s.selection.includes(clip.id));
  const asset: Asset | undefined = clip.assetId ? st.assets[clip.assetId] : undefined;
  const commit = useStore((s) => s.commit);
  const snap = useStore((s) => s.snap);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const width = Math.max(6, clip.duration * zoom);

  const pushHistory = () => {
    const s = useStore.getState();
    // @ts-ignore access to internal state
    s.commit(() => {});
  };

  const beginDrag = (mode: "move" | "trimL" | "trimR") => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (track.locked) return;
    const s = useStore.getState();
    let sel = s.selection.includes(clip.id) ? [...s.selection] : [clip.id];
    if (e.shiftKey) {
      sel = sel.includes(clip.id) ? sel.filter((x) => x !== clip.id) : [...sel, clip.id];
      s.select(sel);
      if (!sel.includes(clip.id)) return;
    } else if (!sel.includes(clip.id)) {
      sel = [clip.id];
      s.select(sel);
    }
    if (clip.groupId) {
      const groupIds = Object.values(useStore.getState().project.clips)
        .filter((c) => c.groupId === clip.groupId)
        .map((c) => c.id);
      sel = [...new Set([...sel, ...groupIds])];
      s.select(sel);
    }
    useStore.getState().select(sel);
    pushHistory();

    const origX = e.clientX;
    const startSnap = snapCandidates(sel);
    const startY = e.clientY;

    const orig = new Map(sel.map((id) => {
      const c = useStore.getState().project.clips[id];
      return [id, { start: c.start, duration: c.duration, inPoint: c.inPoint }];
    }));

    const mv = (ev: MouseEvent) => {
      const dz = useStore.getState().zoom;
      const dt = (ev.clientX - origX) / dz;
      const cur = useStore.getState().project;
      for (const id of sel) {
        const c = cur.clips[id];
        const o = orig.get(id)!;
        if (!c || !o) continue;
        if (mode === "move") {
          let ns = Math.max(0, o.start + dt);
          if (id === sel[0]) ns = applySnap(ns, startSnap, dz, useStore.getState().snap);
          if (useStore.getState().magnetic) ns = magnetize(cur, id, ns, o);
          useStore.getState().updateClip(id, { start: ns });
        } else if (mode === "trimL") {
          const maxShift = o.duration - 0.1;
          let ns = Math.max(0, applySnap(o.start + dt, startSnap, dz, useStore.getState().snap));
          let shift = ns - o.start;
          if (shift > o.inPoint / c.speed) shift = o.inPoint / c.speed;
          if (shift > maxShift) shift = maxShift;
          if (shift < -(o.duration)) shift = -o.duration + 0.1;
          const nd = o.duration - shift;
          const nip = o.inPoint + shift * c.speed;
          if (nd > 0.1 && nip >= -1e-6) useStore.getState().updateClip(id, { start: o.start + shift, duration: nd, inPoint: Math.max(0, nip) });
        } else {
          const maxDur = sourceRoom(c, useStore.getState().assets) ;
          let nd = o.duration + dt;
          if (c.type === "video" || c.type === "audio") nd = Math.min(nd, maxDur);
          if (nd > 0.1) useStore.getState().updateClip(id, { duration: applySnapEnd(cur, id, o.start + nd, dz, useStore.getState().snap) - o.start });
        }
      }
      void startY;
    };
    const up = () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  };

  const hasFx = clip.effects.some((e) => e.enabled) || clip.lut?.enabled || (clip.color.enable);

  return (
    <div
      className={"clip clip-" + clip.type + (selected ? " selected" : "")}
      style={{
        left: clip.start * zoom, width,
        height: height - 6, top: 3,
      }}
      onMouseDown={beginDrag("move")}
      onDoubleClick={() => {
        const s = useStore.getState();
        s.select([clip.id]);
        if (clip.type === "text") s.setInspectorTab("text");
        else if (clip.type === "audio") s.setInspectorTab("audio");
        else s.setInspectorTab("video");
      }}
      data-tip={`${clip.name} · ${clip.duration.toFixed(2)}s${clip.speed !== 1 ? ` · ${clip.speed}×` : ""}`}
    >
      {asset?.thumbnail && (clip.type === "video" || clip.type === "image") && (
        <div
          className="filmstrip"
          style={{ backgroundImage: `url(${asset.thumbnail})`, backgroundSize: "auto 100%", backgroundRepeat: "repeat-x" }}
        />
      )}
      {clip.type === "audio" && <Waveform clip={clip} asset={asset} zoom={zoom} height={height - 6} />}
      <div className="clip-label">{clip.name}</div>
      {hasFx && <div className="fx-chip" data-tip="Has effects / grade / LUT">✦</div>}
      {clip.speed !== 1 && <div className="fx-chip" style={{ right: 26 }} data-tip="Speed">{clip.speed}×</div>}
      {!track.locked && (
        <>
          <div className="handle handle-l" onMouseDown={beginDrag("trimL")} />
          <div className="handle handle-r" onMouseDown={beginDrag("trimR")} />
        </>
      )}
      {clip.transitionIn && (
        <div
          className="transition-badge"
          style={{ left: 13 }}
          title="Transition — click to edit"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            useStore.getState().select([clip.id]);
            useStore.getState().setInspectorTab("transition");
          }}
        >⇄</div>
      )}
    </div>
  );
}

function sourceRoom(c: Clip, assets: Record<string, Asset>): number {
  const a = c.assetId ? assets[c.assetId] : undefined;
  if (!a || c.type === "image" || c.type === "text") return Infinity;
  return (a.duration - c.inPoint) / c.speed;
}

function applySnapEnd(
  project: any, id: string, end: number, zoom: number, enabled: boolean
): number {
  if (!enabled) return end;
  const thresh = 8 / zoom;
  let best = end;
  let bd = thresh;
  for (const c of Object.values(project.clips) as Clip[]) {
    if (c.id === id) continue;
    for (const cand of [c.start, c.start + c.duration]) {
      const d = Math.abs(cand - end);
      if (d < bd) { bd = d; best = cand; }
    }
  }
  return best;
}

function magnetize(project: any, id: string, ns: number, orig: { start: number }): number {
  const others = clipsOnTrack(project.clips, project.clips[id].trackId).filter((c) => c.id !== id);
  const threshCandidates = others.map((c) => c.start + c.duration);
  const dir = ns > orig.start ? 1 : -1;
  let best = ns;
  let bd = 10 / (useStore.getState().zoom);
  for (const cand of threshCandidates) {
    const d = Math.abs(cand - ns);
    if (d < bd && (dir === 1 ? cand >= orig.start : cand <= orig.start + 0.5)) { bd = d; best = cand; }
  }
  return Math.max(0, best);
}

function Waveform({ clip, asset, zoom, height }: { clip: Clip; asset?: Asset; zoom: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !asset?.peaks || !asset.duration) return;
    const w = Math.max(1, Math.min(4000, Math.round(clip.duration * zoom)));
    canvas.width = w;
    canvas.height = height - 12;
    const ctx = canvas.getContext("2d")!;
    const mid = canvas.height / 2;
    ctx.clearRect(0, 0, w, canvas.height);
    ctx.fillStyle = "rgba(165,244,91,0.55)";
    const total = asset.peaks.length;
    const a = (clip.inPoint / asset.duration) * total;
    const b = ((clip.inPoint + clip.duration * clip.speed) / asset.duration) * total;
    for (let px = 0; px < w; px++) {
      const i0 = Math.floor(a + ((b - a) * px) / w);
      const i1 = Math.max(i0 + 1, Math.floor(a + ((b - a) * (px + 1)) / w));
      let m = 0;
      for (let i = i0; i < i1 && i < total; i++) m = Math.max(m, asset.peaks[i]);
      const hh = Math.max(1, m * (canvas.height / 2 - 2));
      ctx.fillRect(px, mid - hh, 1, hh * 2);
    }
  }, [asset?.peaks, clip.inPoint, clip.duration, zoom, height, clip.speed, asset?.duration]);
  if (!asset?.peaks) return null;
  return <canvas ref={ref} className="wv" />;
}
