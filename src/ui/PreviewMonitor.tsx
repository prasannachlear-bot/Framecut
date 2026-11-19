import React, { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { renderFrame } from "../render/renderer";
import { sequenceEnd } from "../state/types";
import { drawScopes, scopeTargets } from "../render/scopes";
import { audioEngine } from "../audio/engine";
import { timecode } from "../state/ops";

export function PreviewMonitor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playing = useStore((s) => s.playing);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  const projectW = useStore((s) => s.project.settings.width);
  const projectH = useStore((s) => s.project.settings.height);
  const fps = useStore((s) => s.project.settings.fps);
  const compare = useStore((s) => s.compare);
  const setCompare = useStore((s) => s.setCompare);
  const dockTab = useStore((s) => s.dockTab);
  const loop = useStore((s) => s.loopPreview);
  const setLoop = useStore((s) => s.setLoop);
  const togglePlay = useStore((s) => s.togglePlay);
  const [masterVol, setMasterVol] = React.useState(1);

  useEffect(() => { audioEngine.setMasterVolume(masterVol); }, [masterVol]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    let raf = 0;
    let last = performance.now();
    let frameIdx = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const st = useStore.getState();

      if (st.playing) {
        const dur = sequenceEnd(st.project.clips);
        let t = st.playhead + dt;
        if (t >= dur - 1e-4) {
          if (st.loopPreview && dur > 0) t = 0;
          else {
            t = 0;
            useStore.setState({ playing: false, playhead: 0 });
            pokePause();
          }
        }
        useStore.setState({ playhead: t });
      }

      if (canvas.width !== st.project.settings.width || canvas.height !== st.project.settings.height) {
        canvas.width = st.project.settings.width;
        canvas.height = st.project.settings.height;
      }
      const ctx = canvas.getContext("2d")!;

      const splitOn = st.compare && st.dockTab === "color";
      renderFrame(st.project, st.assets, st.playhead, st.playing, ctx, {
        compareSplit: splitOn ? 0.5 : 0,
      });

      frameIdx++;
      if (st.dockTab === "color" && frameIdx % 3 === 0) {
        try { drawScopes(canvas, scopeTargets); } catch {}
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const dur = useStore.getState().project ? undefined : undefined;
  void dur;

  return (
    <div className="preview-area">
      <div className="preview-stage">
        <canvas ref={canvasRef} className="preview-canvas" />
        <div className="preview-hud">
          {projectW}×{projectH} · {fps} fps
        </div>
      </div>
      <div className="transport">
        <button className="ghost" onClick={() => useStore.getState().setPlayhead(0)} data-tip="Go to start (Home)">⏮</button>
        <button className="ghost" onClick={() => { const st = useStore.getState(); st.setPlayhead(Math.max(0, st.playhead - 1 / fps)); }} data-tip="Previous frame (←)">◂◂</button>
        <button className="primary" style={{ minWidth: 64 }} onClick={() => { audioEngine.ensure(); togglePlay(); }} data-tip="Play / Pause (Space)">
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button className="ghost" onClick={() => { const st = useStore.getState(); st.setPlayhead(st.playhead + 1 / fps); }} data-tip="Next frame (→)">▸▸</button>
        <button className="ghost" onClick={() => useStore.getState().setPlayhead(sequenceEnd(useStore.getState().project.clips))} data-tip="Go to end (End)">⏭</button>
        <TimeDisplay />
        <button className={loop ? "active" : "ghost"} onClick={() => setLoop(!loop)} data-tip="Loop playback">↻ Loop</button>
        <div className="spacer" style={{ flex: 1 }} />
        <span className="tlabel" data-tip="Master volume">VOL</span>
        <input
          type="range" min={0} max={1.5} step={0.01} value={masterVol} style={{ width: 90 }}
          onChange={(e) => setMasterVol(parseFloat(e.target.value))}
        />
        <button
          className={compare ? "active" : "ghost"}
          onClick={() => setCompare(!compare)}
          data-tip="Colour compare: original (left) vs graded (right)"
        >
          ◧ Compare
        </button>
      </div>
    </div>
  );
}

function pokePause() {
  // pause all media elements via the renderer's registry
  import("../render/renderer").then(({ pauseAllMedia }) => pauseAllMedia());
}

function TimeDisplay() {
  const playhead = useStore((s) => s.playhead);
  const fps = useStore((s) => s.project.settings.fps);
  const dur = sequenceEnd(useStore((s) => s.project.clips));
  return (
    <span className="time">
      {timecode(playhead, fps)} <span style={{ color: "var(--text-2)" }}>/ {timecode(dur, fps)}</span>
    </span>
  );
}
