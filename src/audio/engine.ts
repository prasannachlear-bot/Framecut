// Web Audio engine — element sources -> clip gain -> clip pan -> track gain -> master.
import { Clip, Project, Track } from "../state/types";

interface NodeChain {
  source: MediaElementAudioSourceNode;
  clipGain: GainNode;
  panner: StereoPannerNode;
  trackId: string;
}

class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  streamDest: MediaStreamAudioDestinationNode | null = null;
  chains = new Map<string, NodeChain>();
  trackGains = new Map<string, GainNode>();
  anyAudioActive = false;

  ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.streamDest = this.ctx.createMediaStreamDestination();
      this.master.connect(this.streamDest);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  attach(clipId: string, el: HTMLMediaElement, trackId: string) {
    const existing = this.chains.get(clipId);
    if (existing && existing.trackId === trackId) return;
    if (existing) this.detach(clipId);
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    try {
      const source = ctx.createMediaElementSource(el);
      const clipGain = ctx.createGain();
      const panner = ctx.createStereoPanner();
      source.connect(clipGain).connect(panner).connect(this.master);
      this.chains.set(clipId, { source, clipGain, panner, trackId });
    } catch {
      // element already attached elsewhere / unsupported codec: element plays raw
    }
  }

  getTrackGain(trackId: string): GainNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.master) return null;
    let g = this.trackGains.get(trackId);
    if (!g) {
      g = ctx.createGain();
      g.connect(this.master);
      this.trackGains.set(trackId, g);
    }
    return g;
  }

  detach(clipId: string) {
    const c = this.chains.get(clipId);
    if (!c) return;
    try { c.source.disconnect(); } catch {}
    this.chains.delete(clipId);
  }

  setMasterVolume(v: number) {
    if (this.master) this.master.gain.value = v;
  }

  smooth(node: AudioParam, target: number) {
    const now = this.ctx!.currentTime;
    if (Math.abs(node.value - target) > 0.001) node.setTargetAtTime(target, now, 0.05);
  }

  /** Called every frame with the current project snapshot + playhead. */
  update(project: Project, clips: Clip[], t: number, playing: boolean, anyAudioActive: boolean) {
    this.anyAudioActive = anyAudioActive;
    const ctx = this.ctx;
    if (!ctx) return;

    const soloed = project.tracks.some((tr) => tr.solo && tr.kind !== "text");
    const audible = new Set(clips.filter((c) => c.type !== "text").map((c) => c.id));
    for (const id of this.chains.keys()) {
      if (!audible.has(id)) {
        const c = this.chains.get(id)!;
        if (playing) this.detach(id); // free element nodes for removed clips lazily
        else c.clipGain.gain.value = 0;
      }
    }

    for (const clip of clips) {
      const chain = this.chains.get(clip.id);
      if (!chain) continue;
      const track = project.tracks.find((tr) => tr.id === clip.trackId);
      const trackMuted = !track || track.muted;
      const trackSoloed = track ? track.solo && soloed : false;

      let vol = 0;
      if (!trackMuted && !trackSoloed && !clip.audio.muted && !clip.extractedAudio) {
        vol = clip.audio.volume * (track?.volume ?? 1);
        // fades
        const localT = t - clip.start;
        const fadeGain = computeFadeGain(localT, clip.duration, clip.audio.fadeIn, clip.audio.fadeOut);
        vol *= fadeGain;
        // ducking
        if (clip.audio.duck > 0 && anyAudioActive) {
          vol *= 1 - clip.audio.duck * 0.8;
        }
      }
      // not active -> silence element (element handles its own pause elsewhere)
      vol *= 1;

      this.smooth(chain.clipGain.gain, vol);
      this.smooth(chain.panner.pan, Math.min(1, Math.max(-1, clip.audio.pan + (track?.pan ?? 0))));
    }
  }
}

export function computeFadeGain(
  localT: number,
  duration: number,
  fadeIn: number,
  fadeOut: number
): number {
  let g = 1;
  if (fadeIn > 0 && localT < fadeIn) g *= localT / fadeIn;
  const toEnd = duration - localT;
  if (fadeOut > 0 && toEnd < fadeOut) g *= Math.max(0, toEnd) / fadeOut;
  return Math.max(0, g);
}

export const audioEngine = new AudioEngine();
