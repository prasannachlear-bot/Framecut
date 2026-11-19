import React from "react";
import { useStore } from "../state/store";
import { NumRow, Section, ToggleBtn } from "./widgets";
import { addMarkerAtPlayhead, snapClipsToMarkers } from "../state/ops";
import { audioEngine } from "../audio/engine";
import { useState } from "react";
import { useEffect } from "react";

export function AudioWorkspace() {
  const project = useStore((s) => s.project);
  const commit = useStore((s) => s.commit);
  const clip = useStore((s) => (s.selection.length ? s.project.clips[s.selection[0]] : undefined));
  const [master, setMaster] = useState(1);
  useEffect(() => audioEngine.setMasterVolume(master), [master]);

  const audioTracks = project.tracks.filter((t) => t.kind !== "text");

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <div style={{ width: "58%", overflowY: "auto", padding: 10, borderRight: "1px solid var(--border-soft)" }}>
        <div className="media-toolbar" style={{ gap: 6 }}>
          <span className="tlabel" style={{ flex: 1 }}>MIXER — master, tracks and the selected clip</span>
          <span className="lbl">Master</span>
          <input type="range" min={0} max={1.5} step={0.01} value={master} style={{ width: 120 }}
            onChange={(e) => setMaster(parseFloat(e.target.value))} />
        </div>
        <Section title="Track Controls">
          {audioTracks.map((tr) => (
            <div key={tr.id} className="row" style={{ marginBottom: 4 }}>
              <span className="lbl" style={{ width: 40, fontWeight: 700 }}>{tr.name}</span>
              <input type="range" min={0} max={1.5} step={0.01} value={tr.volume} className="wide"
                onChange={(e) => commit((p) => { const t = p.tracks.find((x) => x.id === tr.id); if (t) t.volume = parseFloat(e.target.value); })} />
              <span className="val">{tr.volume.toFixed(2)}</span>
              <span className="lbl" style={{ width: 30 }}>Pan</span>
              <input type="range" min={-1} max={1} step={0.02} value={tr.pan} style={{ width: 80 }}
                onChange={(e) => commit((p) => { const t = p.tracks.find((x) => x.id === tr.id); if (t) t.pan = parseFloat(e.target.value); })} />
              <ToggleBtn on={tr.muted} onClick={() => commit((p) => { const t = p.tracks.find((x) => x.id === tr.id); if (t) t.muted = !t.muted; })}>M</ToggleBtn>
              <ToggleBtn on={tr.solo} onClick={() => commit((p) => {
                const t = p.tracks.find((x) => x.id === tr.id);
                if (t) t.solo = !t.solo;
              })}>S</ToggleBtn>
            </div>
          ))}
        </Section>

        {clip && clip.type !== "text" ? (
          <Section title={`Selected Clip — ${clip.name}`}>
            <NumRow label="Volume" min={0} max={2} step={0.01} value={clip.audio.volume}
              onChange={(v) => commit((p) => { p.clips[clip.id].audio.volume = v; })} />
            <NumRow label="Balance" min={-1} max={1} step={0.02} value={clip.audio.pan}
              onChange={(v) => commit((p) => { p.clips[clip.id].audio.pan = v; })} tip="Left / right" />
            <NumRow label="Fade in" min={0} max={10} step={0.1} fmt={(v) => v.toFixed(1) + "s"} value={clip.audio.fadeIn}
              onChange={(v) => commit((p) => { p.clips[clip.id].audio.fadeIn = v; })} />
            <NumRow label="Fade out" min={0} max={10} step={0.1} fmt={(v) => v.toFixed(1) + "s"} value={clip.audio.fadeOut}
              onChange={(v) => commit((p) => { p.clips[clip.id].audio.fadeOut = v; })} />
            <NumRow label="Ducking" min={0} max={1} step={0.05} value={clip.audio.duck}
              onChange={(v) => commit((p) => { p.clips[clip.id].audio.duck = v; })}
              tip="Auto-duck this clip (e.g. music) while other audio is playing" />
            <div className="row">
              <span className="lbl">Mute</span>
              <ToggleBtn on={clip.audio.muted} onClick={() => commit((p) => { p.clips[clip.id].audio.muted = !p.clips[clip.id].audio.muted; })}>
                {clip.audio.muted ? "MUTED" : "ON"}
              </ToggleBtn>
            </div>
          </Section>
        ) : (
          <div className="empty">Select an audio or video clip to adjust its gain, fades and ducking.</div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
        <Section title="Beat &amp; Sync Tools">
          <div className="sub" style={{ fontSize: 11, color: "var(--text-2)" }}>
            Play the music and tap the markers in rhythm (or add them at the playhead), then align video
            cuts to the beats.
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button onClick={addMarkerAtPlayhead} data-tip="Marker at playhead (M)">＋ Marker</button>
            <button onClick={snapClipsToMarkers} data-tip="Snap clip starts to the nearest marker">⇤ Align clips to beats</button>
            <span className="tlabel">{project.markers.length} markers</span>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
            {project.markers.map((m, i) => (
              <span key={m.id} className="bin-chip" onClick={() => useStore.getState().setPlayhead(m.t)}>
                ♪ {m.t.toFixed(2)}s
              </span>
            ))}
          </div>
          {project.markers.length > 0 && (
            <button className="ghost" style={{ color: "var(--danger)" }} onClick={() => commit((p) => { p.markers = []; })}>
              Clear all markers
            </button>
          )}
        </Section>

        <Section title="Music Library">
          <div className="sub" style={{ fontSize: 11, color: "var(--text-2)" }}>
            Imported audio lives in the <b>Media</b> tab (left). Drag a music file onto an <b>A</b> track
            below the video to build your soundtrack, then adjust volume, fades and ducking above.
          </div>
        </Section>

        <Section title="Audio Speed &amp; Pitch">
          <div className="sub" style={{ fontSize: 11, color: "var(--text-2)" }}>
            Audio speed follows the clip's <b>Speed</b> control in the Video tab; the browser time-stretches
            with pitch preservation. Artefacts may appear at extreme speeds. Dedicated pitch-shift and
            spectral noise reduction need DSP beyond element playback — see docs/LIMITATIONS.md.
          </div>
        </Section>
      </div>
    </div>
  );
}

function toast(msg: string) {
  (window as any).__fc_toast = msg;
  window.dispatchEvent(new CustomEvent("fc-toast"));
}
