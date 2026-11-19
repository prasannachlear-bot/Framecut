import { create } from "zustand";
import {
  Project, Asset, Clip, cloneClip, newProject, uid, clipsOnTrack,
} from "./types";
import { defaultColor, defaultCurve } from "./types";

export interface LutEntry {
  id: string;
  name: string;
  size: number;
  data: Float32Array;
}

export type LeftTab = "media" | "transitions" | "effects";
export type DockTab = "timeline" | "color" | "audio";

interface FramecutState {
  project: Project;
  assets: Record<string, Asset>;
  luts: LutEntry[];

  selection: string[];
  selectedAssetId: string | null;

  playhead: number;
  playing: boolean;
  loopPreview: boolean;

  zoom: number;          // px per second
  snap: boolean;
  magnetic: boolean;
  showWaveforms: boolean;

  leftTab: LeftTab;
  dockTab: DockTab;
  inspectorTab: string;

  compare: boolean;      // color compare (bypass grade preview)

  clipboard: Clip[];
  exportOpen: boolean;

  past: Project[];
  future: Project[];

  // ---- actions ----
  commit: (fn: (p: Project) => void, tag?: string) => void;
  undo: () => void;
  redo: () => void;

  setPlayhead: (t: number) => void;
  setPlaying: (v: boolean) => void;
  togglePlay: () => void;
  setLoop: (v: boolean) => void;

  setZoom: (z: number) => void;
  setSnap: (v: boolean) => void;
  setMagnetic: (v: boolean) => void;

  select: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  selectAsset: (id: string | null) => void;

  addAsset: (a: Asset) => void;
  removeAsset: (id: string) => void;
  renameAsset: (id: string, name: string) => void;
  duplicateAsset: (id: string) => Promise<void>;
  moveAssetToBin: (id: string, binId: string) => void;
  addBin: (name: string) => void;
  removeBin: (id: string) => void;

  addClip: (clip: Clip) => void;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  updateClipFn: (id: string, fn: (c: Clip) => void) => void;
  removeClips: (ids: string[], ripple: boolean) => void;

  setClipboard: (clips: Clip[]) => void;

  setLeftTab: (t: LeftTab) => void;
  setDockTab: (t: DockTab) => void;
  setInspectorTab: (t: string) => void;

  addLut: (e: LutEntry) => void;

  setCompare: (v: boolean) => void;
  setExportOpen: (v: boolean) => void;

  newProjectAction: () => void;
  loadProject: (p: Project, assets: Record<string, Asset>, luts: LutEntry[]) => void;

  addTrack: (kind: "video" | "audio" | "text") => void;
  removeTrack: (id: string) => void;

  normalizeTrack: (trackId: string) => void;
}

let historyTag = "";

export const useStore = create<FramecutState>((set, get) => ({
  project: newProject(),
  assets: {},
  luts: [],

  selection: [],
  selectedAssetId: null,

  playhead: 0,
  playing: false,
  loopPreview: false,

  zoom: 60,
  snap: true,
  magnetic: false,
  showWaveforms: true,

  leftTab: "media",
  dockTab: "timeline",
  inspectorTab: "video",

  compare: false,
  clipboard: [],
  exportOpen: false,

  past: [],
  future: [],

  commit: (fn) => {
    const { project, past } = get();
    const snapshot = structuredClone(project);
    const next = structuredClone(project);
    fn(next);
    next.updatedAt = Date.now();
    set({ project: next, past: [...past.slice(-99), snapshot], future: [] });
  },

  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({
      project: prev,
      past: past.slice(0, -1),
      future: [structuredClone(project), ...future].slice(0, 100),
    });
  },

  redo: () => {
    const { future, project, past } = get();
    if (!future.length) return;
    const next = future[0];
    set({
      project: next,
      future: future.slice(1),
      past: [...past, structuredClone(project)],
    });
  },

  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (v) => set({ playing: v }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setLoop: (v) => set({ loopPreview: v }),

  setZoom: (z) => set({ zoom: Math.min(600, Math.max(4, z)) }),
  setSnap: (v) => set({ snap: v }),
  setMagnetic: (v) => set({ magnetic: v }),

  select: (ids) => set({ selection: ids }),
  toggleSelect: (id) =>
    set((s) => ({
      selection: s.selection.includes(id)
        ? s.selection.filter((x) => x !== id)
        : [...s.selection, id],
    })),
  selectAsset: (id) => set({ selectedAssetId: id }),

  addAsset: (a) => set((s) => ({ assets: { ...s.assets, [a.id]: a } })),

  removeAsset: (id) =>
    get().commit((p) => {
      // remove dependent clips too
      for (const c of Object.values(p.clips)) {
        if (c.assetId === id) delete p.clips[c.id];
      }
      set((s) => {
        const assets = { ...s.assets };
        delete assets[id];
        return { assets };
      });
    }),

  renameAsset: (id, name) =>
    set((s) => ({ assets: { ...s.assets, [id]: { ...s.assets[id], name } } })),

  duplicateAsset: async (_id) => {
    // implemented in media layer (needs blob copy)
  },

  moveAssetToBin: (id, binId) =>
    set((s) => ({ assets: { ...s.assets, [id]: { ...s.assets[id], binId } } })),

  addBin: (name) => get().commit((p) => { p.bins.push({ id: uid(), name }); }),

  removeBin: (id) =>
    get().commit((p) => {
      if (id === "bin-root") return;
      p.bins = p.bins.filter((b) => b.id !== id);
    }),

  addClip: (clip) => get().commit((p) => { p.clips[clip.id] = clip; }),

  updateClip: (id, patch) =>
    set((s) => {
      const c = s.project.clips[id];
      if (!c) return {};
      // shallow reference update without history (live drag)
      const clips = { ...s.project.clips, [id]: { ...c, ...patch } };
      return { project: { ...s.project, clips } };
    }),

  updateClipFn: (id, fn) =>
    set((s) => {
      const c = s.project.clips[id];
      if (!c) return {};
      const clone = cloneClip(c);
      fn(clone);
      return { project: { ...s.project, clips: { ...s.project.clips, [id]: clone } } };
    }),

  removeClips: (ids, ripple) =>
    get().commit((p) => {
      for (const id of ids) {
        const clip = p.clips[id];
        if (!clip) continue;
        const siblings = clipsOnTrack(p.clips, clip.trackId).filter(
          (c) => !ids.includes(c.id)
        );
        if (ripple) {
          for (const c of siblings) {
            if (c.start >= clip.start) c.start -= clip.duration;
          }
        }
        delete p.clips[id];
      }
    }),

  setClipboard: (clips) => set({ clipboard: clips }),

  setLeftTab: (t) => set({ leftTab: t }),
  setDockTab: (t) => set({ dockTab: t }),
  setInspectorTab: (t) => set({ inspectorTab: t }),

  addLut: (e) => set((s) => ({ luts: [...s.luts.filter((l) => l.name !== e.name), e] })),

  setCompare: (v) => set({ compare: v }),
  setExportOpen: (v) => set({ exportOpen: v }),

  newProjectAction: () => {
    set({
      project: newProject(),
      assets: {},
      selection: [],
      playhead: 0,
      past: [],
      future: [],
    });
  },

  loadProject: (p, assets, luts) =>
    set({
      project: p,
      assets: assets ?? {},
      luts: luts ?? [],
      selection: [],
      playhead: 0,
      past: [],
      future: [],
    }),

  addTrack: (kind) =>
    get().commit((p) => {
      const prefix = kind === "video" ? "V" : kind === "audio" ? "A" : "T";
      const existing = p.tracks.filter((t) => t.kind === kind).length + 1;
      const track = {
        id: `${prefix}${uid()}`,
        kind,
        name: `${prefix}${existing}`,
        visible: true, muted: false, solo: false, locked: false, volume: 1, pan: 0,
      };
      if (kind === "text") p.tracks.unshift(track);
      else if (kind === "video") {
        const idx = p.tracks.findIndex((t) => t.kind === "audio");
        p.tracks.splice(idx === -1 ? p.tracks.length : idx, 0, track);
      } else p.tracks.push(track);
    }),

  removeTrack: (id) =>
    get().commit((p) => {
      if (p.tracks.length <= 1) return;
      for (const c of Object.values(p.clips)) {
        if (c.trackId === id) delete p.clips[c.id];
      }
      p.tracks = p.tracks.filter((t) => t.id !== id);
    }),

  normalizeTrack: (trackId) =>
    get().commit((p) => {
      const list = clipsOnTrack(p.clips, trackId);
      let cursor = 0;
      for (const c of list) {
        c.start = cursor;
        cursor += c.duration;
      }
    }),
}));

export { defaultColor, defaultCurve };
