// Project save/open/new + dialog state shared between TopBar and ProjectDialog.
import { useStore } from "../state/store";
import { saveProject, listProjects, loadProject, deleteProject, getBlob } from "../storage/db";
import { getAssetUrl } from "../media/urls";
import { Asset, newProject } from "../state/types";
import { useEffect, useState } from "react";

export const ProjectDialogOpenState = { _v: false, set(v: boolean) { this._v = v; } };

function useDialogPoll(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    const iv = setInterval(() => setV(ProjectDialogOpenState._v), 150);
    return () => clearInterval(iv);
  }, []);
  return v;
}

export async function saveCurrentProject() {
  const st = useStore.getState();
  try {
    await saveProject(st.project, {}, { assets: st.assets });
    toast("Project saved locally");
  } catch (e) {
    toast("Save failed: " + (e as Error).message);
  }
}

export function newProjectConfirm() {
  if (confirm("Start a new project? Unsaved changes will be lost.")) {
    useStore.getState().newProjectAction();
  }
}

export async function openProjectById(id: string) {
  const row: any = await loadProject(id);
  if (!row) return;
  const assets: Record<string, Asset> = row.assets ?? {};
  // rehydrate object URLs from blobs
  for (const a of Object.values(assets)) {
    try {
      const blob = await getBlob(a.blobId);
      if (blob) getAssetUrl(a.id, blob);
    } catch {}
  }
  useStore.getState().loadProject(row, assets, row.luts ?? []);
  ProjectDialogOpenState.set(false);
}

export async function removeProjectById(id: string) {
  if (!confirm("Delete this saved project?")) return;
  await deleteProject(id);
}

let toastMsg = "";
let toastAt = 0;
export function toast(msg: string) {
  toastMsg = msg;
  toastAt = Date.now();
  window.dispatchEvent(new CustomEvent("fc-toast"));
}

export function Toasts() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const h = () => {
      setMsg(toastMsg);
      setTimeout(() => {
        if (Date.now() - toastAt > 2400) setMsg("");
      }, 2500);
    };
    window.addEventListener("fc-toast", h);
    return () => window.removeEventListener("fc-toast", h);
  }, []);
  if (!msg) return null;
  return (
    <div
      style={{
        position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)",
        background: "var(--panel-2)", border: "1px solid var(--accent-dim)", color: "var(--text)",
        borderRadius: 6, padding: "7px 16px", fontSize: 12, zIndex: 300,
      }}
    >
      {msg}
    </div>
  );
}

export function savedProjects(): Promise<{ id: string; name: string; updatedAt: number }[]> {
  return listProjects();
}
