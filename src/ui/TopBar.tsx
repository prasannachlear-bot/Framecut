import React, { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { ProjectDialogOpenState, saveCurrentProject, newProjectConfirm } from "./projectActions";
import { Modal } from "./widgets";
import { newProject } from "../state/types";

export function TopBar() {
  const projectName = useStore((s) => s.project.name);
  const commit = useStore((s) => s.commit);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const setExportOpen = useStore((s) => s.setExportOpen);
  const project = useStore((s) => s.project);

  return (
    <div className="topbar">
      <div className="logo">
        <div className="mark" />
        FRAMECUT
      </div>
      <div className="vsep" />
      <input
        className="projectname"
        value={projectName}
        onChange={(e) => commit((p) => { p.name = e.target.value; })}
        spellCheck={false}
        data-tip="Project name"
      />
      <div className="group">
        <button className="ghost" onClick={() => newProjectConfirm()} data-tip="New project">New</button>
        <button className="ghost" onClick={() => saveCurrentProject()} data-tip="Save project to browser (IndexedDB)">Save</button>
        <button className="ghost" onClick={() => ProjectDialogOpenState.set(true)} data-tip="Open saved project">Open</button>
      </div>
      <div className="spacer" />
      <div className="group">
        <button className="ghost" onClick={undo} disabled={!past} data-tip="Undo (Ctrl+Z)">↩ Undo</button>
        <button className="ghost" onClick={redo} disabled={!future} data-tip="Redo (Ctrl+Shift+Z)">↪ Redo</button>
        <div className="vsep" />
        <span className="tlabel">
          {project.settings.width}×{project.settings.height} · {project.settings.fps}fps
        </span>
        <button className="primary" onClick={() => setExportOpen(true)} data-tip="Export the edited sequence">
          Export
        </button>
      </div>
    </div>
  );
}

// Settings popover for resolution/fps on the project
export function ProjectSettingsModal() { return null; }
