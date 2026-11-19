import { Asset, uid } from "../state/types";
import { putBlob } from "../storage/db";
import { getAssetUrl } from "./urls";

const ACCEPT: Record<string, Asset["kind"]> = {
  "video/mp4": "video", "video/webm": "video", "video/quicktime": "video",
  "video/x-matroska": "video", "video/ogg": "video", "video/x-msvideo": "video",
  "audio/mpeg": "audio", "audio/mp3": "audio", "audio/wav": "audio",
  "audio/x-wav": "audio", "audio/wave": "audio", "audio/aac": "audio",
  "audio/x-m4a": "audio", "audio/mp4": "audio", "audio/ogg": "audio",
  "audio/flac": "audio", "audio/x-flac": "audio",
  "image/png": "image", "image/jpeg": "image", "image/gif": "image",
  "image/webp": "image", "image/svg+xml": "image", "image/avif": "image",
};

export function kindForFile(file: File): Asset["kind"] | null {
  if (ACCEPT[file.type]) return ACCEPT[file.type];
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mov", "webm", "mkv", "avi", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "aac", "m4a", "ogg", "flac", "aiff"].includes(ext)) return "audio";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) return "image";
  return null;
}

async function probeVideo(url: string): Promise<{
  duration: number; width: number; height: number; fps: number; hasAudio: boolean;
  thumbnail: string;
}> {
  const v = document.createElement("video");
  v.preload = "auto";
  v.muted = true;
  v.src = url;

  await new Promise<void>((res, rej) => {
    v.onloadedmetadata = () => res();
    v.onerror = () => rej(new Error("Cannot decode video"));
    setTimeout(() => rej(new Error("Video probe timeout")), 15000);
  });

  // fps estimation: request frames and count via video.requestVideoFrameCallback
  let fps = 30;
  const anyV = v as any;
  if (anyV.requestVideoFrameCallback) {
    fps = await new Promise<number>((res) => {
      let frames = 0;
      let first: number | null = null;
      const tick = (_: number, meta: any) => {
        if (first === null) first = meta.mediaTime;
        frames++;
        if (frames >= 30) {
          const dt = meta.mediaTime - first;
          res(Math.round(frames / Math.max(dt, 1e-3)));
          return;
        }
        anyV.requestVideoFrameCallback(tick);
      };
      anyV.requestVideoFrameCallback(tick);
      v.play().catch(() => res(30));
      setTimeout(() => res(30), 2000);
    });
    v.pause();
  }

  // thumbnail at ~1s
  const seekT = Math.min(1, (v.duration || 1) / 2);
  await new Promise<void>((res) => {
    v.onseeked = () => res();
    v.currentTime = seekT;
    setTimeout(res, 3000);
  });
  const tcv = document.createElement("canvas");
  tcv.width = 192; tcv.height = Math.max(1, Math.round((v.videoHeight / (v.videoWidth || 1)) * 192));
  tcv.getContext("2d")!.drawImage(v, 0, 0, tcv.width, tcv.height);

  // audio detection
  let hasAudio = true;
  try {
    const ac = new AudioContext();
    const buf = await fetch(url).then((r) => r.arrayBuffer());
    const decoded = await ac.decodeAudioData(buf);
    hasAudio = decoded.numberOfChannels > 0;
    ac.close();
  } catch { hasAudio = false; }

  return {
    duration: v.duration || 0,
    width: v.videoWidth,
    height: v.videoHeight,
    fps: Math.min(120, Math.max(1, fps)),
    hasAudio,
    thumbnail: tcv.toDataURL("image/jpeg", 0.7),
  };
}

async function probeImage(url: string, file: File): Promise<{ width: number; height: number; thumbnail: string }> {
  const img = new Image();
  img.src = url;
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
  let width = img.naturalWidth, height = img.naturalHeight;
  if (file.type === "image/gif" || width === 0) { /* keep natural */ }
  const tcv = document.createElement("canvas");
  const scale = Math.min(1, 192 / Math.max(width, height, 1));
  tcv.width = Math.max(1, Math.round(width * scale));
  tcv.height = Math.max(1, Math.round(height * scale));
  tcv.getContext("2d")!.drawImage(img, 0, 0, tcv.width, tcv.height);
  return {
    width, height,
    thumbnail: tcv.width * tcv.height > 4 ? tcv.toDataURL("image/png") : "",
  };
}

export async function extractPeaks(url: string, buckets = 1200): Promise<{ peaks: number[]; duration: number }> {
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  const ac = new AudioContext();
  const audio = await ac.decodeAudioData(buf);
  const ch = audio.getChannelData(0);
  const perBucket = Math.floor(ch.length / buckets) || 1;
  const peaks: number[] = new Array(buckets).fill(0);
  for (let i = 0; i < buckets; i++) {
    let max = 0;
    const startIdx = i * perBucket;
    for (let j = 0; j < perBucket; j += Math.max(1, Math.floor(perBucket / 300))) {
      const v = Math.abs(ch[startIdx + j] || 0);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  ac.close();
  return { peaks, duration: audio.duration };
}

export async function importFile(file: File, binId?: string): Promise<Asset> {
  const kind = kindForFile(file);
  if (!kind) throw new Error(`Unsupported file type: ${file.name}`);

  const id = uid();
  const asset: Asset = {
    id, name: file.name, kind, mimeType: file.type,
    blobId: id, duration: 0, width: 0, height: 0, fps: 0,
    binId: binId ?? "bin-root", hasAudio: false,
  };

  const url = getAssetUrl(id, file);
  await putBlob(id, file);

  if (kind === "video") {
    try {
      const probe = await probeVideo(url);
      asset.duration = probe.duration;
      asset.width = probe.width;
      asset.height = probe.height;
      asset.fps = probe.fps;
      asset.thumbnail = probe.thumbnail;
      asset.hasAudio = probe.hasAudio;
    } catch (e) {
      console.warn("Video probe failed for", file.name, e);
    }
  } else if (kind === "image") {
    const probe = await probeImage(url, file);
    asset.width = probe.width;
    asset.height = probe.height;
    asset.thumbnail = probe.thumbnail;
    asset.duration = 5; // default still duration
  } else {
    const { peaks, duration } = await extractPeaks(url);
    asset.peaks = peaks;
    asset.duration = duration;
    asset.hasAudio = true;
  }

  return asset;
}
