import React, { useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { Asset, uid } from "../state/types";
import { importFile } from "../media/importer";
import { toast as appToast } from "./projectActions";
import { putBlob, getBlob } from "../storage/db";
import { addClipFromAsset, addTextClip, timeStr } from "../state/ops";
import { TRANSITIONS } from "../render/transitions";
import { EFFECTS } from "../render/effectsDefs";
import { getAssetUrl } from "../media/urls";

export function fmtDur(d: number) {
  if (!d) return "—";
  return timeStr(d);
}

export function MediaPanel() {
  const assets = useStore((s) => s.assets);
  const bins = useStore((s) => s.project.bins);
  const addAsset = useStore((s) => s.addAsset);
  const removeAsset = useStore((s) => s.removeAsset);
  const renameAsset = useStore((s) => s.renameAsset);
  const moveAssetToBin = useStore((s) => s.moveAssetToBin);
  const addBin = useStore((s) => s.addBin);
  const selected = useStore((s) => s.selectedAssetId);
  const selectAsset = useStore((s) => s.selectAsset);
  const playhead = useStore((s) => s.playhead);
  const selection = useStore((s) => s.selection);

  const [activeBin, setActiveBin] = useState("bin-root");
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = useMemo(
    () => Object.values(assets).filter((a) => (a.binId ?? "bin-root") === activeBin),
    [assets, activeBin]
  );
  const sel = selected ? assets[selected] : null;

  const onFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      setImporting(f.name);
      try {
        const asset = await importFile(f, activeBin);
        addAsset(asset);
      } catch (err) {
        toast(`${f.name}: ${(err as Error).message}`);
      }
    }
    setImporting(null);
  };

  const duplicate = async (a: Asset) => {
    const blob = await getBlob(a.blobId);
    if (!blob) return;
    const nid = uid();
    await putBlob(nid, blob);
    getAssetUrl(nid, blob);
    addAsset({ ...a, id: nid, blobId: nid, name: a.name.replace(/(\.[^.]+)?$/, " copy$1") });
  };

  const addSelectedToTimeline = (a: Asset) => {
    const st = useStore.getState();
    const kind = a.kind === "audio" ? "audio" : "video";
    const track = st.project.tracks.find((t) => t.kind === kind);
    if (!track) return;
    const end = Math.max(0, ...Object.values(st.project.clips)
      .filter((c) => c.trackId === track.id).map((c) => c.start + c.duration));
    addClipFromAsset(a, track.id, end);
  };

  return (
    <div
      className={dragOver ? "dropzone-active" : ""}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) selectAsset(null); }}
    >
      <div className="media-toolbar">
        <button className="primary" onClick={() => fileRef.current?.click()} data-tip="Import video, audio, image or font files">＋ Import</button>
        <button className="ghost" onClick={addTextClip} data-tip="Add a text overlay (T)">T+ Text</button>
        <input
          ref={fileRef} type="file" multiple style={{ display: "none" }}
          accept="video/*,audio/*,image/*,.mp4,.mov,.webm,.mp3,.wav,.aac,.png,.jpg,.gif,.cube,.ttf,.otf,.woff,.woff2"
          onChange={(e) => e.target.files && onFiles(e.target.files)}
        />
      </div>

      <div className="bins-row">
        {bins.map((b) => (
          <span
            key={b.id} className={"bin-chip" + (activeBin === b.id ? " active" : "")}
            onClick={() => setActiveBin(b.id)}
            onDoubleClick={() => { const n = prompt("Rename bin", b.name); if (n) useStore.getState().commit((p) => { const bb = p.bins.find((x) => x.id === b.id); if (bb) bb.name = n; }); }}
            data-tip="Double-click to rename"
          >
            {b.name}
          </span>
        ))}
        <span
          className="bin-chip" data-tip="New bin"
          onClick={() => { const n = prompt("Bin name", "Bin " + (bins.length + 1)); if (n) addBin(n); }}
          style={{ color: "var(--accent)" }}
        >
          ＋
        </span>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          {importing ? <>Importing <b>{importing}</b>…</> : <>Drop media files here<br />MP4 · MOV · WebM · MP3 · WAV · AAC · PNG · JPG · GIF<br />or click <b>＋ Import</b></>}
        </div>
      ) : (
        <div className="media-grid">
          {list.map((a) => (
            <MediaCard
              key={a.id} asset={a}
              selected={selected === a.id}
              onSelect={() => selectAsset(a.id)}
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-framecut-asset", a.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onDelete={() => { removeAsset(a.id); if (selected === a.id) selectAsset(null); }}
              onRename={(n) => renameAsset(a.id, n)}
              onDuplicate={() => duplicate(a)}
              onBin={(binId) => moveAssetToBin(a.id, binId)}
            />
          ))}
        </div>
      )}

      {importing && list.length > 0 && <div className="empty" style={{ marginTop: 8 }}>Importing <b>{importing}</b>…</div>}

      {sel && (
        <AssetPreview asset={sel}
          onAddToTimeline={() => addSelectedToTimeline(sel)}
          onDelete={() => { removeAsset(sel.id); selectAsset(null); }}
          onRename={(n) => renameAsset(sel.id, n)}
          onDuplicate={() => duplicate(sel)}
          selectedClips={selection.length}
        />
      )}
    </div>
  );
}

function MediaCard({
  asset, selected, onSelect, onDragStart, onDelete, onRename, onDuplicate, onBin,
}: {
  asset: Asset;
  selected: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDelete: () => void;
  onRename: (n: string) => void;
  onDuplicate: () => void;
  onBin: (b: string) => void;
}) {
  const [u, setU] = useState<string | null>(null);
  return (
    <div
      className={"media-card" + (selected ? " selected" : "")}
      draggable
      onDragStart={onDragStart}
      onClick={onSelect}
      title={asset.name}
    >
      <div className="thumb" onMouseEnter={() => setU("1")} onMouseLeave={() => setU(null)}>
        {u && asset.kind === "video" ? (
          <HoverPreview assetId={asset.id} />
        ) : asset.thumbnail ? (
          <img src={asset.thumbnail} alt="" draggable={false} />
        ) : (
          <span>{asset.kind === "audio" ? "♪ audio" : "image"}</span>
        )}
        <span className="badge">{asset.kind}</span>
      </div>
      <div className="meta">
        <div className="name">{asset.name}</div>
        <div className="sub">
          <span>{asset.kind === "image" ? `${asset.width}×${asset.height}` : fmtDur(asset.duration)}</span>
          {asset.kind !== "image" && <span>{asset.width ? `${asset.width}×${asset.height}` : ""}</span>}
          {asset.fps ? <span>{asset.fps}fps</span> : null}
        </div>
      </div>
    </div>
  );
}

function HoverPreview({ assetId }: { assetId: string }) {
  const url = useAssetUrl(assetId);
  return (
    <video
      src={url}
      muted
      autoPlay
      loop
      playsInline
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}

import { urlFor } from "../media/urls";
function useAssetUrl(assetId: string): string | undefined {
  return urlFor(assetId);
}

function AssetPreview({
  asset, onAddToTimeline, onDelete, onRename, onDuplicate, selectedClips,
}: {
  asset: Asset;
  onAddToTimeline: () => void;
  onDelete: () => void;
  onRename: (n: string) => void;
  onDuplicate: () => void;
  selectedClips: number;
}) {
  const url = useAssetUrl(asset.id);
  return (
    <div className="insp-section" style={{ marginTop: 10, background: "var(--panel-2)" }}>
      <div className="sec-head"><span>PREVIEW · {asset.name}</span></div>
      <div className="sec-body">
        {url && asset.kind === "video" && <video src={url} controls style={{ width: "100%", borderRadius: 4 }} />}
        {url && asset.kind === "image" && <img src={url} style={{ width: "100%", borderRadius: 4 }} alt="" />}
        {url && asset.kind === "audio" && <audio src={url} controls style={{ width: "100%" }} />}
        <div className="row">
          <button className="primary wide" onClick={onAddToTimeline} data-tip="Append to the next free slot on the matching track">
            ＋ Add to timeline
          </button>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button style={{ flex: 1 }} onClick={() => { const n = prompt("Rename asset", asset.name); if (n) onRename(n); }}>Rename</button>
          <button style={{ flex: 1 }} onClick={onDuplicate}>Duplicate</button>
          <button style={{ flex: 1, color: "var(--danger)" }} onClick={onDelete}>Delete</button>
        </div>
        <div className="sub" style={{ fontSize: 10, color: "var(--text-2)" }}>
          {asset.width ? `Resolution ${asset.width}×${asset.height} · ` : ""}
          {asset.fps ? `${asset.fps} fps · ` : ""}
          {fmtDur(asset.duration)}
          {asset.hasAudio ? " · audio" : ""}
        </div>
        {selectedClips > 0 && <div className="sub" style={{ fontSize: 10, color: "var(--text-2)" }}>{selectedClips} timeline clip(s) selected</div>}
      </div>
    </div>
  );
}

// ---------------- Transitions library ----------------

export function TransitionsPanel() {
  const [duration, setDuration] = useState(1);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <div>
      <div className="media-toolbar">
        <span className="tlabel">Drag a transition onto a clip junction in the timeline</span>
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="lbl">Duration</span>
        <input type="range" min={0.2} max={3} step={0.1} value={duration}
          onChange={(e) => setDuration(parseFloat(e.target.value))} className="wide" />
        <span className="val">{duration.toFixed(1)}s</span>
      </div>
      <div className="lib-grid">
        {TRANSITIONS.map((t) => (
          <div
            key={t.type}
            className={"lib-card" + (sel === t.type ? " selected" : "")}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-framecut-transition", t.type);
              e.dataTransfer.setData("application/x-framecut-transition-dur", String(duration));
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => setSel(t.type)}
            data-tip={`${t.label}${t.dir ? " (direction-aware)" : ""} — drop on the boundary between two clips`}
          >
            {t.label}
          </div>
        ))}
      </div>
      <div className="empty" style={{ marginTop: 10 }}>
        Transitions blend the outgoing and incoming clip. Adjust duration, direction, easing and
        intensity on the transition badge (click it in the timeline) or in the Inspector → Transition tab.
      </div>
    </div>
  );
}

// ---------------- Effects library ----------------

export function EffectsPanel() {
  const groups = useMemo(() => {
    const m = new Map<string, typeof EFFECTS>();
    for (const e of EFFECTS) {
      if (!m.has(e.group)) m.set(e.group, [] as any);
      m.get(e.group)!.push(e);
    }
    return [...m.entries()];
  }, []);
  const commit = useStore((s) => s.commit);
  const selection = useStore((s) => s.selection);

  const applyToSelected = (type: string) => {
    const st = useStore.getState();
    const def = EFFECTS.find((x) => x.type === type)!;
    if (!st.selection.length) { toast("Select a clip in the timeline first"); return; }
    const clip = st.project.clips[st.selection[0]];
    if (!clip) return;
    commit((p) => {
      const c = p.clips[st.selection[0]];
      c.effects.push({
        id: uid(),
        type: def.type,
        enabled: true,
        params: Object.fromEntries(def.params.map((pm) => [pm.key, pm.def])),
      });
    });
    st.setInspectorTab("effects");
    void clip;
  };

  return (
    <div>
      <div className="media-toolbar">
        <span className="tlabel">Drag onto a clip, or double-click to apply to the selected clip</span>
      </div>
      <div className="lib-grid">
        {groups.map(([group, defs]) => (
          <React.Fragment key={group}>
            <div className="lib-cat">{group}</div>
            {defs.map((d) => (
              <div
                key={d.type}
                className="lib-card"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-framecut-effect", d.type);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onDoubleClick={() => applyToSelected(d.type)}
                data-tip={d.label + " — double-click to apply to selected clip"}
              >
                {d.label}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
      <div className="empty" style={{ marginTop: 10 }}>
        Stack effects in Inspector → Effects (reorder, toggle, adjust intensity).
      </div>
    </div>
  );
}

function toast(msg: string) { appToast(msg); }
