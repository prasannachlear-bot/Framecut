import React, { useEffect } from "react";
import { useStore } from "./state/store";
import { TopBar } from "./ui/TopBar";
import { MediaPanel, TransitionsPanel, EffectsPanel } from "./ui/LibraryPanels";
import { PreviewMonitor } from "./ui/PreviewMonitor";
import { Timeline } from "./ui/Timeline";
import { Inspector } from "./ui/Inspector";
import { ColorWorkspace } from "./ui/ColorWorkspace";
import { AudioWorkspace } from "./ui/AudioWorkspace";
import { ExportDialog } from "./ui/ExportDialog";
import { ProjectDialog } from "./ui/ProjectDialog";
import {
  splitAtPlayhead, deleteSelected, copySelected, pasteClipboard,
  duplicateSelected, addTextClip, addMarkerAtPlayhead,
} from "./state/ops";
import { sequenceEnd } from "./state/types";

export default function App() {
  const leftTab = useStore((s) => s.leftTab);
  const setLeftTab = useStore((s) => s.setLeftTab);
  const dockTab = useStore((s) => s.dockTab);
  const setDockTab = useStore((s) => s.setDockTab);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const st = useStore.getState();
      const S = st.playing;
      const step = 1 / st.project.settings.fps;
      const seqDur = sequenceEnd(st.project.clips);

      if (e.code === "Space") { e.preventDefault(); st.togglePlay(); }
      else if (e.key === "ArrowLeft") {
        e.preventDefault();
        st.setPlayhead(e.shiftKey ? Math.max(0, st.playhead - 1) : Math.max(0, st.playhead - step));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        st.setPlayhead(Math.min(seqDur, st.playhead + (e.shiftKey ? 1 : step)));
      } else if (e.key === "Home") st.setPlayhead(0);
      else if (e.key === "End") st.setPlayhead(seqDur);
      else if ((e.key === "s" || e.key === "S") && !e.ctrlKey && !e.metaKey) splitAtPlayhead();
      else if (e.key === "Delete") {
        e.preventDefault();
        deleteSelected(e.shiftKey);
      } else if (e.key === "Backspace") deleteSelected(false);
      else if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); st.undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); st.redo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "c") copySelected();
      else if ((e.ctrlKey || e.metaKey) && e.key === "v") pasteClipboard();
      else if ((e.ctrlKey || e.metaKey) && e.key === "d") { e.preventDefault(); duplicateSelected(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "s") e.preventDefault();
      else if (e.key === "t" && !e.ctrlKey && !e.metaKey) addTextClip();
      else if (e.key === "m" && !e.ctrlKey && !e.metaKey) addMarkerAtPlayhead();
      else if (e.key === "+" || e.key === "=") st.setZoom(st.zoom * 1.3);
      else if (e.key === "-") st.setZoom(st.zoom / 1.3);
      void S;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <TopBar />
      <div className="workspace">
        <div className="left-panel">
          <div className="left-tabs">
            {(
              [
                ["media", "Media"],
                ["transitions", "Transitions"],
                ["effects", "Effects"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} className={leftTab === k ? "active" : ""} onClick={() => setLeftTab(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="left-body">
            {leftTab === "media" && <MediaPanel />}
            {leftTab === "transitions" && <TransitionsPanel />}
            {leftTab === "effects" && <EffectsPanel />}
          </div>
        </div>

        <div className="center">
          <PreviewMonitor />
          <div className="dock">
            <div className="dock-tabs">
              {(
                [
                  ["timeline", "Timeline"],
                  ["color", "Color"],
                  ["audio", "Audio"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} className={dockTab === k ? "active" : ""} onClick={() => setDockTab(k)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="dock-body" style={{ display: dockTab === "timeline" ? "flex" : "none" }}>
              <Timeline />
            </div>
            {dockTab === "color" && <ColorWorkspace />}
            {dockTab === "audio" && <AudioWorkspace />}
          </div>
        </div>

        <div className="right-panel">
          <Inspector />
        </div>
      </div>
      <ExportDialog />
      <ProjectDialog />
    </div>
  );
}
