import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import { Modal, Row, Checkbox } from "./widgets";
import { ExportSettings, runExport, isCodecAvailable, pickMime } from "../export/exporter";
import { sequenceEnd } from "../state/types";
import { toast } from "./projectActions";

const RESOLUTIONS: Record<string, [number, number]> = {
  "480p": [854, 480],
  "720p": [1280, 720],
  "1080p": [1920, 1080],
  "2K": [2560, 1440],
  "4K": [3840, 2160],
  "Project": [0, 0],
};

const ASPECTS: Record<string, [number, number]> = {
  "16:9": [16, 9],
  "9:16": [9, 16],
  "1:1": [1, 1],
  "4:5": [4, 5],
  "Custom": [0, 0],
};

export function ExportDialog() {
  const open = useStore((s) => s.exportOpen);
  const setOpen = useStore((s) => s.setExportOpen);
  const project = useStore((s) => s.project);
  const assets = useStore((s) => s.assets);

  const seqDur = sequenceEnd(project.clips);
  const [resLabel, setResLabel] = useState("1080p");
  const [aspect, setAspect] = useState("16:9");
  const [customW, setCustomW] = useState(1080);
  const [customH, setCustomH] = useState(1920);
  const [fps, setFps] = useState(project.settings.fps);
  const [container, setContainer] = useState<"mp4" | "webm" | "mov">("mp4");
  const [codec, setCodec] = useState<"h264" | "h265">("h264");
  const [bitrate, setBitrate] = useState(12000);
  const [audioBitrate, setAudioBitrate] = useState(192);
  const [quality, setQuality] = useState<"low" | "medium" | "high">("high");
  const [filename, setFilename] = useState((project.name || "export").replace(/\s+/g, "_"));
  const [progress, setProgress] = useState(-1);
  const [sizeEst, setSizeEst] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState(0);
  const [busy, setBusy] = useState(false);

  const dims = useMemo<[number, number]>(() => {
    if (aspect === "Custom") return [customW, customH];
    if (resLabel === "Project") {
      const [arW, arH] = ASPECTS[aspect];
      const proj = project.settings;
      return [proj.width, proj.height];
    }
    let [w, h] = RESOLUTIONS[resLabel];
    const [arW, arH] = ASPECTS[aspect];
    if (arW !== 16 || arH !== 9) {
      if (arW / arH > 1) {
        h = Math.round(w / (arW / arH) / 2) * 2;
        w = Math.round(h * (arW / arH) / 2) * 2;
      } else if (arW / arH < 1) {
        w = Math.round(h * (arW / arH) / 2) * 2;
        h = Math.round(w / (arW / arH) / 2) * 2;
      }
    }
    void arW;
    return [w, h];
  }, [resLabel, aspect, customW, customH, project.settings]);

  useEffect(() => {
    if (!open) {
      setProgress(-1);
      setResultUrl(null);
    }
  }, [open]);

  if (!open) return null;

  const mime = pickMime(container, codec);
  const mp4Ok = isCodecAvailable("mp4", "h264");
  const webmOk = true;

  const start = () => {
    if (seqDur <= 0.05) { toast("Timeline is empty — add clips first."); return; }
    setBusy(true);
    setResultUrl(null);
    const settings: ExportSettings = {
      width: dims[0], height: dims[1], fps,
      container, codec, videoBitrateKbps: bitrate, audioBitrateKbps: audioBitrate,
      quality, filename,
    };
    const handle = runExport(project, assets, settings, (p, est) => {
      setProgress(p);
      setSizeEst(est);
    });
    handle.promise.then((res) => {
      setBusy(false);
      setProgress(-1);
      if (res) {
        const url = URL.createObjectURL(res.blob);
        setResultUrl(url);
        setResultSize(res.size);
        toast(`Export complete — ${(res.size / 1e6).toFixed(1)} MB`);
      }
    });
  };

  return (
    <Modal title="Export" onClose={() => { if (!busy) setOpen(false); }} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Row label="Resolution">
          <select className="wide" value={resLabel} onChange={(e) => setResLabel(e.target.value)}>
            {Object.keys(RESOLUTIONS).map((r) => <option key={r}>{r}</option>)}
          </select>
        </Row>
        <Row label="Aspect ratio">
          <select className="wide" value={aspect} onChange={(e) => setAspect(e.target.value)}>
            {Object.keys(ASPECTS).map((r) => <option key={r}>{r}</option>)}
          </select>
        </Row>
        {aspect === "Custom" && (
          <Row label="Dimensions">
            <input type="number" value={customW} step={2} onChange={(e) => setCustomW(parseInt(e.target.value) || 640)} />
            ×
            <input type="number" value={customH} step={2} onChange={(e) => setCustomH(parseInt(e.target.value) || 360)} />
          </Row>
        )}
        <Row label="Frame rate">
          <select className="wide" value={fps} onChange={(e) => setFps(parseInt(e.target.value))}>
            {[24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
          </select>
        </Row>
        <Row label="Format">
          <select className="wide" value={container} onChange={(e) => setContainer(e.target.value as any)}>
            <option value="mp4">MP4 {mp4Ok ? "(H.264 available)" : "(falls back to WebM)"}</option>
            <option value="webm">WebM</option>
            <option value="mov">MOV {mp4Ok ? "(H.264 in MP4 container)" : "(falls back)"}</option>
          </select>
        </Row>
        <Row label="Video codec">
          <select className="wide" value={codec} onChange={(e) => setCodec(e.target.value as any)}>
            <option value="h264">H.264</option>
            <option value="h265">H.265 {isCodecAvailable(container, "h265") ? "" : "(not in this browser)"}</option>
          </select>
        </Row>
        <Row label="Bitrate">
          <input type="range" min={2000} max={60000} step={500} value={bitrate} className="wide"
            onChange={(e) => setBitrate(parseInt(e.target.value))} />
          <span className="val">{(bitrate / 1000).toFixed(1)} Mbps</span>
        </Row>
        <Row label="Audio">
          <input type="range" min={64} max={320} step={32} value={audioBitrate} style={{ width: 80 }}
            onChange={(e) => setAudioBitrate(parseInt(e.target.value))} />
          <span className="val">{audioBitrate} kbps</span>
          <select value={quality} onChange={(e) => setQuality(e.target.value as any)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Row>
        <Row label="Filename">
          <input className="wide" value={filename} onChange={(e) => setFilename(e.target.value.replace(/[^\w.-]/g, "_"))} />
          <span className="val" style={{ width: 60 }}>
            .{(mime ?? "video/webm").includes("mp4") ? "mp4" : "webm"}
          </span>
        </Row>

        <div className="sub" style={{ fontSize: 10.5, color: "var(--text-2)", margin: "4px 0" }}>
          {dims[0]}×{dims[1]} @ {fps}fps · duration {seqDur.toFixed(1)}s · codec{" "}
          {isCodecAvailable(container, codec) ? "ready ✓" : "unavailable ✗ (WebM fallback)"}
          {seqDur > 0 ? ` · est. size ${((bitrate * 1000 * seqDur) / 8 / 1e6).toFixed(0)} MB` : ""}
        </div>

        {progress >= 0 && (
          <div>
            <div className="progressbar"><div className="fill" style={{ width: `${progress * 100}%` }} /></div>
            <div className="sub" style={{ color: "var(--text-2)", fontSize: 11, marginTop: 4 }}>
              Rendering {Math.round(progress * 100)}% · est. {(sizeEst / 1e6).toFixed(1)} MB — keep this tab visible
            </div>
          </div>
        )}

        {resultUrl && (
          <div className="insp-section">
            <div className="sec-head"><span>FINAL EXPORT — {(resultSize / 1e6).toFixed(1)} MB</span></div>
            <div className="sec-body">
              <video src={resultUrl} controls style={{ width: "100%", borderRadius: 4 }} />
              <a href={resultUrl} download={`${filename || "framecut_export"}.${mime?.includes("mp4") ? "mp4" : "webm"}`}>
                <button className="primary" style={{ width: "100%" }}>⬇ Download video</button>
              </a>
            </div>
          </div>
        )}

        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
          <button onClick={() => { if (!busy) setOpen(false); }}>Close</button>
          <button className="primary" onClick={start} disabled={busy || progress >= 0}>
            {busy || progress >= 0 ? "Rendering…" : "● Start Render"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
