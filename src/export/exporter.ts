// Export pipeline — realtime canvas capture through MediaRecorder with codec
// probing. Renders the full project through the shared renderFrame path.
import { useStore } from "../state/store";
import { renderFrame } from "../render/renderer";
import { sequenceEnd } from "../state/types";
import { audioEngine } from "../audio/engine";
import type { Project, Asset } from "../state/types";

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  container: "mp4" | "webm" | "mov";
  codec: "h264" | "h265";
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  quality: "low" | "medium" | "high";
  filename: string;
}

export interface ExportHandle {
  cancel: () => void;
  promise: Promise<{ blob: Blob; mime: string; size: number } | null>;
}

const CANDIDATES: Record<string, string[]> = {
  "mp4:h264": [
    "video/mp4;codecs=avc1.640028,mp4a.40.2",
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1",
    "video/mp4",
  ],
  "mp4:h265": ["video/mp4;codecs=hvc1.1.6.L93.B0", "video/mp4;codecs=hev1", "video/mp4"],
  "mov:h264": ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4"],
  "webm:h264": ["video/webm;codecs=h264,opus", "video/webm;codecs=h264"],
  "webm:h265": ["video/webm;codecs=vp9,opus", "video/webm"],
};

export function pickMime(container: string, codec: string): string | null {
  const key = `${container}:${codec}`;
  const list = CANDIDATES[key] ?? CANDIDATES["webm:h264"];
  for (const m of list) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm"))
    return "video/webm";
  return null;
}

export function isCodecAvailable(container: string, codec: string) {
  return pickMime(container, codec) !== null;
}

export function runExport(
  project: Project,
  assets: Record<string, Asset>,
  settings: ExportSettings,
  onProgress: (p: number, sizeEstimate: number) => void
): ExportHandle {
  let cancelled = false;
  const promise = new Promise<{ blob: Blob; mime: string; size: number } | null>((resolve) => {
    (async () => {
      const mime = pickMime(settings.container, settings.codec);
      const canvas = document.createElement("canvas");
      canvas.width = settings.width;
      canvas.height = settings.height;
      const ctx = canvas.getContext("2d", { alpha: false })!;
      if (!mime) {
        alert("No supported recording format in this browser. Try Chrome or Edge.");
        resolve(null);
        return;
      }

      const duration = sequenceEnd(project.clips);
      if (duration <= 0.05) {
        alert("Timeline is empty — add clips before exporting.");
        resolve(null);
        return;
      }

      audioEngine.ensure();
      const stream = canvas.captureStream(settings.fps);
      const aStream = audioEngine.streamDest?.stream;
      for (const track of aStream?.getAudioTracks() ?? []) stream.addTrack(track);

      const q = settings.quality;
      const rec = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: Math.round(
          settings.videoBitrateKbps * 1000 * (q === "high" ? 1.5 : q === "low" ? 0.6 : 1)
        ),
        audioBitsPerSecond: Math.round(settings.audioBitrateKbps * 1000),
      });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

      const done = new Promise<void>((res) => { rec.onstop = () => res(); });
      rec.start(500);

      const store = useStore.getState();
      const wasPlaying = store.playing;
      store.setPlaying(false);
      store.setPlayhead(0);

      const start = performance.now();
      await new Promise<void>((res) => {
        const loop = () => {
          const t = (performance.now() - start) / 1000;
          if (cancelled || t >= duration) {
            res();
            return;
          }
          renderFrame(project, assets, t, true, ctx);
          store.setPlayhead(t);
          const bytes = chunks.reduce((s, c) => s + c.size, 0);
          const est = (bytes / Math.max(t, 0.25)) * duration;
          onProgress(t / duration, est);
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });

      try { rec.stop(); } catch {}
      await done;
      if (!cancelled) {
        store.setPlayhead(0);
        store.setPlaying(wasPlaying && false);
        const blob = new Blob(chunks, { type: mime });
        resolve({ blob, mime, size: blob.size });
      } else {
        resolve(null);
      }
    })();
  });

  return {
    cancel: () => { cancelled = true; },
    promise,
  };
}
