import React, { useEffect, useState } from "react";
import { Modal } from "./widgets";
import { ProjectDialogOpenState, openProjectById, removeProjectById, savedProjects } from "./projectActions";
import { newProjectConfirm } from "./projectActions";

export function ProjectDialog() {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string; updatedAt: number }[]>([]);

  useEffect(() => {
    const iv = setInterval(() => {
      const v = ProjectDialogOpenState._v;
      if (v !== open) {
        setOpen(v);
        if (v) savedProjects().then(setProjects);
      }
    }, 120);
    return () => clearInterval(iv);
  }, [open]);

  if (!open) return null;

  const close = () => { ProjectDialogOpenState.set(false); setOpen(false); };

  return (
    <Modal title="Projects" onClose={close}>
      <div style={{ marginBottom: 10 }}>
        <button className="primary" onClick={() => { newProjectConfirm(); close(); }}>＋ New project</button>
      </div>
      {projects.length === 0 && (
        <div className="empty">No saved projects yet.<br />Use <b>Save</b> in the top bar — projects are stored in this browser (IndexedDB).</div>
      )}
      {projects
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((p) => (
          <div key={p.id} className="proj-row" onClick={() => { openProjectById(p.id); }}>
            <span className="pname">{p.name}</span>
            <span className="pdate">{new Date(p.updatedAt).toLocaleString()}</span>
            <button onClick={(e) => { e.stopPropagation(); removeProjectById(p.id).then(() => savedProjects().then(setProjects)); }}>Delete</button>
          </div>
        ))}
    </Modal>
  );
}
