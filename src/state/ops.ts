// Editing operations shared by timeline UI + keyboard shortcuts.
import { useStore } from "./store";
import {
  Asset, Clip, clipsOnTrack, cloneClip, defaultAudio, defaultColor, defaultCurve,
  defaultText, defaultTransform, uid,
} from "./types";
import { putBlob } from "../storage/db";
import { getAssetUrl } from "../media/urls";

export function snapCandidates(excludeIds: string[] = []): number[] {
  const st = useStore.getState();
  const out = [0, st.playhead];
  for (const m of st.project.markers) out.push(m.t);
  for (const c of Object.values(st.project.clips)) {
    if (excludeIds.includes(c.id)) continue;
    out.push(c.start, c.start + c.duration);
  }
  return out;
}

export function applySnap(t: number, candidates: number[], zoom: number, enabled: boolean): number {
  if (!enabled) return t;
  const thresh = 8 / zoom;
  let best = t;
  let bestDist = thresh;
  for (const c of candidates) {
    const d = Math.abs(c - t);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

export function trackDuration(clips: Clip[]): number {
  return clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
}

export function addClipFromAsset(asset: Asset, trackId: string, start: number): Clip | null {
  const st = useStore.getState();
  const track = st.project.tracks.find((tr) => tr.id === trackId);
  if (!track || track.kind === "text") return null;
  const wantsTrackKind = asset.kind === "audio" ? "audio" : "video";
  if (track.kind !== wantsTrackKind) return null;

  const clip: Clip = {
    id: uid(),
    trackId,
    type: asset.kind === "audio" ? "audio" : asset.kind === "image" ? "image" : "video",
    name: asset.name,
    assetId: asset.id,
    start,
    duration: Math.max(0.1, asset.duration || 5),
    inPoint: 0,
    speed: 1,
    extractedAudio: false,
    transform: defaultTransform(),
    crop: { l: 0, r: 0, t: 0, b: 0 },
    blendMode: "source-over",
    color: defaultColor(),
    curves: defaultCurve(),
    effects: [],
    audio: defaultAudio(),
    keyframes: [],
  };
  st.addClip(clip);
  st.select([clip.id]);
  return clip;
}

export function addTextClip() {
  const st = useStore.getState();
  const track = st.project.tracks.find((t) => t.kind === "text");
  if (!track) return;
  const clip: Clip = {
    id: uid(),
    trackId: track.id,
    type: "text",
    name: "Text",
    start: st.playhead,
    duration: 5,
    inPoint: 0,
    speed: 1,
    extractedAudio: false,
    transform: defaultTransform(),
    crop: { l: 0, r: 0, t: 0, b: 0 },
    blendMode: "source-over",
    color: defaultColor(),
    curves: defaultCurve(),
    effects: [],
    audio: defaultAudio(),
    text: defaultText(),
    keyframes: [],
  };
  st.addClip(clip);
  st.select([clip.id]);
  st.setInspectorTab("text");
}

function inRange(c: Clip | undefined, t: number): boolean {
  return !!c && t > c.start + 0.02 && t < c.start + c.duration - 0.02;
}

function isLocked(project: any, c: Clip): boolean {
  const tr = project.tracks.find((t: any) => t.id === c.trackId);
  return !!tr?.locked;
}

export function splitAtPlayhead() {
  const st = useStore.getState();
  const t = st.playhead;
  const targetIds = st.selection.length
    ? st.selection.filter((id) => inRange(st.project.clips[id], t))
    : Object.values(st.project.clips)
        .filter((c) => !isLocked(st.project, c) && inRange(c, t))
        .map((c) => c.id);
  if (!targetIds.length) return;
  st.commit((p) => {
    for (const id of targetIds) {
      const c = p.clips[id];
      if (!c) continue;
      if (t <= c.start + 0.02 || t >= c.start + c.duration - 0.02) continue;
      const offset = t - c.start;
      const right: Clip = cloneClip(c);
      right.id = uid();
      right.start = t;
      right.duration = c.duration - offset;
      right.inPoint = c.inPoint + offset * c.speed;
      right.transitionIn = undefined;
      c.duration = offset;
      p.clips[right.id] = right;
    }
  });
}

export function deleteSelected(ripple: boolean) {
  const st = useStore.getState();
  if (!st.selection.length) return;
  st.removeClips([...st.selection], ripple);
  useStore.setState({ selection: [] });
}

export function copySelected() {
  const st = useStore.getState();
  const clips = st.selection
    .map((id) => st.project.clips[id])
    .filter(Boolean)
    .map(cloneClip);
  st.setClipboard(clips);
}

export function pasteClipboard() {
  const st = useStore.getState();
  if (!st.clipboard.length) return;
  const first = Math.min(...st.clipboard.map((c) => c.start));
  const dt = st.playhead - first;
  const newIds: string[] = [];
  st.commit((p) => {
    for (const src of st.clipboard) {
      const c = cloneClip(src);
      c.id = uid();
      c.start = Math.max(0, src.start + dt);
      p.clips[c.id] = c;
      newIds.push(c.id);
    }
  });
  useStore.setState({ selection: newIds });
}

export function duplicateSelected() {
  const st = useStore.getState();
  if (!st.selection.length) return;
  const newIds: string[] = [];
  st.commit((p) => {
    for (const id of st.selection) {
      const src = p.clips[id];
      if (!src) continue;
      const c = cloneClip(src);
      c.id = uid();
      c.start = src.start + src.duration;
      delete c.transitionIn;
      p.clips[c.id] = c;
      newIds.push(c.id);
    }
  });
  useStore.setState({ selection: newIds });
}

export function groupSelected() {
  const st = useStore.getState();
  if (!st.selection.length) return;
  const gid = uid();
  st.commit((p) => {
    for (const id of st.selection) {
      const c = p.clips[id];
      if (c) c.groupId = gid;
    }
  });
}

export function unlinkSelected() {
  const st = useStore.getState();
  if (!st.selection.length) return;
  st.commit((p) => {
    for (const id of st.selection) {
      const c = p.clips[id];
      if (c) {
        delete c.groupId;
        if (c.type === "video") c.extractedAudio = true;
      }
    }
  });
}

export function extractAudioSelected() {
  const st = useStore.getState();
  const id = st.selection[0];
  const c = st.project.clips[id];
  if (!c || c.type !== "video" || c.extractedAudio) return;
  const asset = st.assets[c.assetId!];
  if (!asset || !asset.hasAudio) return;
  const audioTrack = st.project.tracks.find((t) => t.kind === "audio");
  if (!audioTrack) return;
  const gid = c.groupId ?? uid();
  st.commit((p) => {
    p.clips[id].extractedAudio = true;
    p.clips[id].groupId = gid;
    const audioClip: Clip = cloneClip(c);
    audioClip.id = uid();
    audioClip.trackId = audioTrack.id;
    audioClip.type = "audio";
    audioClip.extractedAudio = false;
    audioClip.groupId = gid;
    audioClip.name = asset.name.replace(/\.[^.]+$/, "") + " audio";
    audioClip.lut = undefined;
    audioClip.effects = [];
    p.clips[audioClip.id] = audioClip;
  });
}

export async function freezeFrameSelected() {
  const st = useStore.getState();
  const id = st.selection[0];
  const clip = st.project.clips[id];
  if (!clip || clip.type !== "video") return;
  const t = st.playhead;
  const srcT = clip.inPoint + Math.max(0, Math.min(t - clip.start, clip.duration)) * clip.speed;
  const { getMediaEl } = await import("../render/renderer");
  const el = getMediaEl(clip.id) as HTMLVideoElement;
  if (!el || el.readyState < 2) return;
  const canvas = document.createElement("canvas");
  canvas.width = el.videoWidth;
  canvas.height = el.videoHeight;
  canvas.getContext("2d")!.drawImage(el, 0, 0);
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));

  const aid = uid();
  await putBlob(aid, blob);
  getAssetUrl(aid, blob);
  const tcv = document.createElement("canvas");
  tcv.width = 192;
  tcv.height = Math.max(1, Math.round((canvas.height / (canvas.width || 1)) * 192));
  tcv.getContext("2d")!.drawImage(canvas, 0, 0, tcv.width, tcv.height);

  const newAsset: Asset = {
    id: aid,
    name: `${clip.name} freeze ${timeStr(srcT)}`,
    kind: "image",
    mimeType: "image/png",
    blobId: aid,
    duration: 5,
    width: canvas.width,
    height: canvas.height,
    fps: 0,
    thumbnail: tcv.toDataURL("image/jpeg", 0.7),
    binId: "bin-root",
    hasAudio: false,
  };
  st.addAsset(newAsset);

  const imageClip: Clip = {
    id: uid(),
    trackId: clip.trackId,
    type: "image",
    name: newAsset.name,
    assetId: aid,
    start: clip.start + clip.duration,
    duration: 2,
    inPoint: 0,
    speed: 1,
    extractedAudio: false,
    transform: cloneClip(clip).transform,
    crop: { l: 0, r: 0, t: 0, b: 0 },
    blendMode: "source-over",
    color: cloneClip(clip).color,
    curves: cloneClip(clip).curves,
    effects: [],
    audio: defaultAudio(),
    keyframes: [],
  };
  st.addClip(imageClip);
  useStore.setState({ selection: [imageClip.id] });
}

export function timeStr(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 100);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export function timecode(t: number, fps: number): string {
  const hh = Math.floor(t / 3600);
  const mm = Math.floor((t % 3600) / 60);
  const ss = Math.floor(t % 60);
  const ff = Math.floor((t % 1) * fps);
  return [hh, mm, ss, ff].map((n, i) => String(n).padStart(i === 0 ? 1 : 2, "0")).join(":");
}

export function addMarkerAtPlayhead() {
  const st = useStore.getState();
  st.commit((p) => {
    p.markers.push({ id: uid(), t: st.playhead, label: `M${p.markers.length + 1}` });
  });
}

export function snapClipsToMarkers() {
  const st = useStore.getState();
  const sel = st.selection.length ? st.selection : Object.keys(st.project.clips);
  st.commit((p) => {
    for (const id of sel) {
      const c = p.clips[id];
      if (!c) continue;
      let best = c.start;
      let bd = Infinity;
      for (const m of p.markers) {
        const d = Math.abs(m.t - c.start);
        if (d < bd) { bd = d; best = m.t; }
      }
      if (bd < 5) c.start = best;
    }
  });
}
