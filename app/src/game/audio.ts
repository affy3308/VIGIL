/**
 * audio.ts — hybrid sound: real CC0 samples layered with Web Audio synth tails for SFX,
 * streamed CC-BY music tracks (battle → boss crossfade), synthesized title choir and
 * low-health warp whisper. Mute toggle remembered in localStorage.
 */

export type SfxId =
  | "shot" | "plasmaShot" | "meltaShot" | "enemyHit" | "enemyDie" | "playerHurt" | "dash" | "pickup"
  | "wave" | "upgrade" | "spit" | "charge" | "bossRoar" | "ui" | "win" | "lose"
  | "chain" | "power" | "fist" | "blade" | "boom";

const MUTE_KEY = "vigil.muted";

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeMuted(v: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch {
    /* in-memory flag still works */
  }
}

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** SFX chain: soft-clip distortion → compressor → master, plus a cathedral echo send. */
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private choirNodes: OscillatorNode[] = [];
  private choirGain: GainNode | null = null;
  private whisperSrc: AudioBufferSourceNode | null = null;
  private whisperGain: GainNode | null = null;
  private whisperOn = false;
  private whisperTimer: ReturnType<typeof setInterval> | null = null;
  /** Real recorded samples (CC0) layered under the synth tails. */
  private buffers = new Map<string, AudioBuffer>();
  private samplesLoading = false;
  /** Battle/boss music tracks streamed via HTMLAudioElement (no full decode). */
  private musicEls = new Map<string, { el: HTMLAudioElement; gain: GainNode }>();
  private currentTrack: string | null = null;
  private intensity = 0;
  private disposed = false;
  muted = false;

  private readonly unlock = () => {
    this.ensureCtx();
    this.loadSamples();
    this.detachUnlock();
  };

  /** Fetch + decode every sample once; sfx() falls back to pure synth while loading. */
  private loadSamples(): void {
    if (this.samplesLoading || !this.ctx) return;
    this.samplesLoading = true;
    const files: Record<string, string> = {
      bolter: "audio/bolter.wav",
      boom1: "audio/boom1.ogg",
      boom2: "audio/boom2.ogg",
      meleeHit: "audio/melee_hit.ogg",
      punch: "audio/punch.ogg",
      hurt: "audio/hurt.ogg",
      chainsaw: "audio/chainsaw.wav",
      whoosh: "audio/whoosh.wav",
      zap: "audio/zap.wav",
      metalHit: "audio/metal_hit.ogg",
      metalHit2: "audio/metal_hit2.ogg",
    };
    for (const [key, url] of Object.entries(files)) {
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(url)))
        .then((ab) => this.ctx!.decodeAudioData(ab))
        .then((buf) => this.buffers.set(key, buf))
        .catch(() => { /* synth fallback stays */ });
    }
  }

  /** Play a recorded sample through the SFX bus (distortion + cathedral echo). */
  private playSample(key: string, gain: number, rate = 1, delay = 0): boolean {
    if (this.disposed || this.muted) return false;
    const buf = this.buffers.get(key);
    if (!buf) return false;
    const ctx = this.ensureCtx();
    const bus = this.sfxBus ?? this.master;
    if (!bus) return false;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const env = ctx.createGain();
    env.gain.value = gain;
    src.connect(env).connect(bus);
    src.start(t);
    return true;
  }

  constructor() {
    this.muted = readMuted();
    window.addEventListener("pointerdown", this.unlock);
    window.addEventListener("keydown", this.unlock);
    window.addEventListener("touchstart", this.unlock);
  }

  private detachUnlock(): void {
    window.removeEventListener("pointerdown", this.unlock);
    window.removeEventListener("keydown", this.unlock);
    window.removeEventListener("touchstart", this.unlock);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachUnlock();
    this.stopMusic();
    this.stopChoir();
    this.stopWhisper();
    this.master?.disconnect();
    this.master = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);

      // soft-clip "gunpowder" distortion
      const shaper = this.ctx.createWaveShaper();
      const curve = new Float32Array(512);
      for (let i = 0; i < 512; i++) {
        const x = (i / 255.5) - 1;
        curve[i] = Math.tanh(2.8 * x);
      }
      shaper.curve = curve;
      shaper.oversample = "2x";

      // compressor keeps stacked shots from clipping while staying loud
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 8;
      comp.ratio.value = 6;
      comp.attack.value = 0.002;
      comp.release.value = 0.12;

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 1;
      this.sfxBus.connect(shaper);
      shaper.connect(comp);
      comp.connect(this.master);

      // cathedral echo: short slap + long dark tail
      const delay = this.ctx.createDelay(1);
      delay.delayTime.value = 0.16;
      const feedback = this.ctx.createGain();
      feedback.gain.value = 0.32;
      const dampen = this.ctx.createBiquadFilter();
      dampen.type = "lowpass";
      dampen.frequency.value = 1600;
      const wet = this.ctx.createGain();
      wet.gain.value = 0.22;
      this.sfxBus.connect(delay);
      delay.connect(dampen);
      dampen.connect(feedback);
      feedback.connect(delay);
      dampen.connect(wet);
      wet.connect(this.master);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    writeMuted(this.muted);
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  /** One short synthesized blip. */
  private blip(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0): void {
    if (this.disposed || this.muted) return;
    const ctx = this.ensureCtx();
    const bus = this.sfxBus ?? this.master;
    if (!bus) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(env).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Short burst of filtered noise — explosions, gore, gunfire crack. */
  private noiseBurst(dur: number, gain: number, lowpass: number, delay = 0, highpass = 0): void {
    if (this.disposed || this.muted) return;
    const ctx = this.ensureCtx();
    const bus = this.sfxBus ?? this.master;
    if (!bus) return;
    const t = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = lowpass;
    let chain: AudioNode = filt;
    if (highpass > 0) {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = highpass;
      filt.connect(hp);
      chain = hp;
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt);
    chain.connect(env).connect(bus);
    src.start(t);
  }

  sfx(id: SfxId): void {
    switch (id) {
      case "shot": {
        // bolter: real black-powder recording, doubled for weight (one crack + one body an octave down)
        const live = this.playSample("bolter", 0.95, 0.96 + Math.random() * 0.1);
        if (live) {
          this.playSample("bolter", 0.45, 0.62 + Math.random() * 0.06, 0.012); // sub layer — the chest hit
          this.noiseBurst(0.35, 0.16, 700, 0.02);                              // room boom tail
        } else {
          const j = 1 + (Math.random() - 0.5) * 0.12;
          this.blip("sine", 150 * j, 26, 0.24, 0.85);
          this.blip("sine", 75 * j, 20, 0.3, 0.5);
          this.blip("sawtooth", 380 * j, 55, 0.14, 0.3);
          this.noiseBurst(0.05, 0.55, 8000, 0, 2000);
          this.noiseBurst(0.08, 0.35, 5000, 0.025, 1200);
          this.noiseBurst(0.45, 0.3, 600, 0.015);
        }
        break;
      }
      case "enemyHit":
        if (!this.playSample("punch", 0.32, 1.35 + Math.random() * 0.2)) {
          this.blip("sawtooth", 260, 90, 0.09, 0.3);
          this.noiseBurst(0.07, 0.22, 2200, 0, 500);           // flesh smack
        }
        break;
      case "enemyDie":
        this.playSample("boom2", 0.3, 0.75 + Math.random() * 0.25);
        this.blip("sawtooth", 200, 35, 0.3, 0.25);
        this.noiseBurst(0.3, 0.3, 700);                        // gore burst
        this.noiseBurst(0.14, 0.18, 3200, 0.02, 800);          // spray
        break;
      case "playerHurt":
        this.playSample("hurt", 0.65, 0.92 + Math.random() * 0.16);
        this.blip("sine", 90, 30, 0.3, 0.4);
        this.noiseBurst(0.25, 0.25, 500);
        break;
      case "dash":
        this.noiseBurst(0.16, 0.2, 1800);
        this.blip("sine", 200, 500, 0.12, 0.1);
        break;
      case "pickup":
        this.blip("sine", 520, 880, 0.14, 0.22);
        this.blip("sine", 780, 1320, 0.12, 0.15, 0.07);
        break;
      case "wave": // war horn
        this.blip("sawtooth", 98, 98, 1.1, 0.22);
        this.blip("sawtooth", 147, 147, 1.1, 0.14);
        this.blip("sawtooth", 196, 196, 0.9, 0.1, 0.05);
        break;
      case "upgrade":
        this.blip("sine", 392, 392, 0.3, 0.16);
        this.blip("sine", 523, 523, 0.35, 0.16, 0.1);
        this.blip("sine", 659, 659, 0.45, 0.16, 0.2);
        break;
      case "spit":
        this.noiseBurst(0.12, 0.22, 2400, 0, 400);             // wet gurgle
        this.blip("sine", 220, 480, 0.1, 0.08);
        break;
      case "charge":
        this.blip("sawtooth", 80, 240, 0.5, 0.2);
        break;
      case "bossRoar":
        this.blip("sawtooth", 60, 40, 1.4, 0.4);
        this.blip("sawtooth", 92, 55, 1.4, 0.3, 0.1);
        this.noiseBurst(1.0, 0.25, 500, 0.1);
        break;
      case "plasmaShot": {
        // "pwoomph" on fire, "POOOOM" on detonation (impact side lives in "boom")
        const j = 1 + (Math.random() - 0.5) * 0.1;
        this.noiseBurst(0.22, 0.4, 1400, 0, 250);              // low-mid whoosh of venting gas
        this.blip("sine", 320 * j, 70, 0.24, 0.5);             // pwoomph body
        this.blip("sine", 900 * j, 300, 0.12, 0.14);           // coil whine release
        this.noiseBurst(0.1, 0.2, 5500, 0.01, 1800);           // superheated air crackle
        break;
      }
      case "meltaShot": {
        // lore-accurate: nearly silent mechanism — the sound is the target vaporizing.
        // intense bassy hiss/roar
        this.noiseBurst(0.45, 0.5, 1100, 0, 200);              // long vaporization roar
        this.blip("sine", 85, 26, 0.35, 0.55);                 // deep thermal thump
        this.blip("sawtooth", 160, 45, 0.3, 0.22);
        this.noiseBurst(0.5, 0.22, 3800, 0.04, 2400);          // steam hiss tail
        break;
      }
      case "chain":
        // chainswords SCREAM — real buzzsaw rev, slowed into a growl + bat-crack as the teeth bite
        this.playSample("chainsaw", 0.9, 0.82 + Math.random() * 0.14);
        this.playSample("meleeHit", 0.6, 0.95 + Math.random() * 0.2, 0.08);
        this.blip("sawtooth", 95, 70, 0.35, 0.14);             // motor growl underneath
        this.noiseBurst(0.3, 0.18, 5200, 0.06, 1800);          // teeth on armour
        break;
      case "power":
        // disruption field: real sci-fi zap + real steel-on-steel impact + crackle tail
        this.playSample("zap", 0.8, 0.92 + Math.random() * 0.2);
        this.playSample(Math.random() < 0.5 ? "metalHit" : "metalHit2", 0.75, 0.85 + Math.random() * 0.2, 0.04);
        this.noiseBurst(0.05, 0.2, 6500, 0.06, 2500);          // crackle…
        this.noiseBurst(0.08, 0.16, 5000, 0.14, 1600);         // …crackle
        this.blip("sine", 1300, 280, 0.22, 0.12, 0.02);        // field whine release
        break;
      case "fist":
        this.playSample("punch", 0.85, 0.75 + Math.random() * 0.15);
        this.playSample("boom2", 0.4, 0.65, 0.03);
        this.playSample("metalHit2", 0.35, 0.7, 0.02);         // plate buckling
        this.blip("sine", 105, 24, 0.32, 0.5);                 // impact crater
        this.noiseBurst(0.3, 0.3, 900);
        break;
      case "blade":
        // power sword / axe: real bamboo-steel whoosh + real metal bite
        this.playSample("whoosh", 0.7, 1.1 + Math.random() * 0.25);
        this.playSample(Math.random() < 0.5 ? "metalHit" : "metalHit2", 0.7, 1.05 + Math.random() * 0.25, 0.09);
        this.noiseBurst(0.08, 0.14, 7000, 0, 3200);            // air swish tail
        break;
      case "boom":
        // plasma detonation — real blast recording + sub tail
        if (!this.playSample("boom1", 0.9, 0.92 + Math.random() * 0.16)) {
          this.noiseBurst(0.55, 0.55, 1100);
          this.noiseBurst(0.16, 0.32, 4200, 0, 1600);
        }
        this.blip("sine", 140, 22, 0.55, 0.6);
        this.blip("sine", 70, 18, 0.6, 0.4, 0.03);
        this.blip("sine", 900, 200, 0.3, 0.1, 0.02);           // steam whistle off the crater
        break;
      case "ui":
        this.blip("sine", 440, 520, 0.05, 0.12);
        break;
      case "win":
        [261, 329, 392, 523].forEach((f, i) => this.blip("sine", f, f, 0.5, 0.2, i * 0.16));
        break;
      case "lose":
        this.blip("sawtooth", 220, 55, 0.8, 0.3);
        this.blip("sawtooth", 110, 40, 1.1, 0.25, 0.2);
        break;
    }
  }

  /**
   * Battle music: real recorded tracks (Kevin MacLeod, CC-BY — see CREDITS.md)
   * streamed through MediaElementSource, crossfaded battle → boss on the final wave.
   */
  startMusic(): void {
    if (this.disposed) return;
    this.switchTrack("battle");
  }

  private ensureMusicBus(): GainNode | null {
    if (this.disposed) return null;
    const ctx = this.ensureCtx();
    if (!this.master) return null;
    if (!this.musicBus) {
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.62;
      this.musicBus.connect(this.master);
    }
    return this.musicBus;
  }

  private ensureMusicEl(name: string): { el: HTMLAudioElement; gain: GainNode } | null {
    const bus = this.ensureMusicBus();
    if (!bus || !this.ctx) return null;
    let rec = this.musicEls.get(name);
    if (!rec) {
      const el = new Audio(`audio/music_${name}.mp3`);
      el.loop = true;
      el.preload = "auto";
      const src = this.ctx.createMediaElementSource(el);
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(bus);
      rec = { el, gain };
      this.musicEls.set(name, rec);
    }
    return rec;
  }

  private musicTargetGain(): number {
    return 0.34 + this.intensity * 0.22;
  }

  private switchTrack(name: string): void {
    if (this.disposed || this.currentTrack === name) return;
    const rec = this.ensureMusicEl(name);
    if (!rec || !this.ctx) return;
    const t = this.ctx.currentTime;
    const oldName = this.currentTrack;
    if (oldName) {
      const old = this.musicEls.get(oldName);
      if (old) {
        old.gain.gain.cancelScheduledValues(t);
        old.gain.gain.setValueAtTime(old.gain.gain.value, t);
        old.gain.gain.linearRampToValueAtTime(0, t + 2);
        const oldEl = old.el;
        setTimeout(() => { if (this.currentTrack !== oldName) oldEl.pause(); }, 2100);
      }
    }
    this.currentTrack = name;
    void rec.el.play().catch(() => { /* browser may still block until next gesture */ });
    rec.gain.gain.cancelScheduledValues(t);
    rec.gain.gain.setValueAtTime(Math.max(rec.gain.gain.value, 0.0001), t);
    rec.gain.gain.linearRampToValueAtTime(this.musicTargetGain(), t + (oldName ? 2.5 : 1.5));
  }

  stopMusic(): void {
    const ctx = this.ctx;
    const t = ctx?.currentTime ?? 0;
    for (const rec of this.musicEls.values()) {
      if (ctx) {
        rec.gain.gain.cancelScheduledValues(t);
        rec.gain.gain.setValueAtTime(rec.gain.gain.value, t);
        rec.gain.gain.linearRampToValueAtTime(0, t + 0.8);
      }
      const el = rec.el;
      setTimeout(() => el.pause(), 900);
    }
    this.currentTrack = null;
  }

  /** Monastic choir for the title screen: four voices over D minor with vibrato and a formant band. */
  startChoir(): void {
    if (this.disposed || this.choirNodes.length) return;
    const ctx = this.ensureCtx();
    if (!this.master) return;
    this.choirGain = ctx.createGain();
    this.choirGain.gain.setValueAtTime(0, ctx.currentTime);
    this.choirGain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 2.5);
    const formant = ctx.createBiquadFilter();
    formant.type = "bandpass";
    formant.frequency.value = 750;
    formant.Q.value = 0.8;
    this.choirGain.connect(formant).connect(this.master);
    // D3 F3 A3 D4 — the liturgy of a dead order
    for (const [freq, gain] of [[146.8, 0.3], [174.6, 0.22], [220, 0.26], [293.7, 0.16]] as const) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      const vib = ctx.createOscillator();
      const vibGain = ctx.createGain();
      vib.type = "sine";
      vib.frequency.value = 4.5 + Math.random() * 1.5;
      vibGain.gain.value = freq * 0.006;
      vib.connect(vibGain);
      vibGain.connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(this.choirGain);
      osc.start();
      vib.start();
      this.choirNodes.push(osc, vib);
    }
  }

  stopChoir(): void {
    if (this.choirGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.choirGain.gain.cancelScheduledValues(t);
      this.choirGain.gain.setValueAtTime(this.choirGain.gain.value, t);
      this.choirGain.gain.linearRampToValueAtTime(0, t + 1.2);
    }
    const nodes = this.choirNodes;
    setTimeout(() => {
      for (const o of nodes) { try { o.stop(); } catch { /* already stopped */ } }
    }, 1400);
    this.choirNodes = [];
    const g = this.choirGain;
    this.choirGain = null;
    setTimeout(() => g?.disconnect(), 1600);
  }

  /** Warp whisper at low health: breathy filtered noise + wandering pitch. */
  startWhisper(): void {
    if (this.disposed || this.whisperOn) return;
    this.whisperOn = true;
    const ctx = this.ensureCtx();
    if (!this.master) return;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    this.whisperSrc = ctx.createBufferSource();
    this.whisperSrc.buffer = buf;
    this.whisperSrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1100;
    bp.Q.value = 2.5;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 0.4;
    lfoGain.gain.value = 700;
    lfo.connect(lfoGain);
    lfoGain.connect(bp.frequency);
    lfo.start();
    this.whisperSrc.onended = () => { try { lfo.stop(); } catch { /* already stopped */ } };
    this.whisperGain = ctx.createGain();
    this.whisperGain.gain.setValueAtTime(0, ctx.currentTime);
    this.whisperGain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 1.5);
    this.whisperSrc.connect(bp).connect(this.whisperGain).connect(this.master);
    this.whisperSrc.start();
    // warp voices: pitch-sliding half-words drifting through the whisper
    this.whisperTimer = setInterval(() => {
      if (this.disposed || this.muted || !this.whisperOn) return;
      if (Math.random() < 0.3) {
        const f = 300 + Math.random() * 700;
        this.blip("sine", f, f * (Math.random() < 0.5 ? 0.5 : 1.6), 0.5, 0.045);
      }
    }, 900);
  }

  stopWhisper(): void {
    this.whisperOn = false;
    if (this.whisperTimer) {
      clearInterval(this.whisperTimer);
      this.whisperTimer = null;
    }
    if (this.whisperGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.whisperGain.gain.cancelScheduledValues(t);
      this.whisperGain.gain.setValueAtTime(this.whisperGain.gain.value, t);
      this.whisperGain.gain.linearRampToValueAtTime(0, t + 0.8);
    }
    const src = this.whisperSrc;
    this.whisperSrc = null;
    setTimeout(() => { try { src?.stop(); } catch { /* already stopped */ } }, 900);
    const g = this.whisperGain;
    this.whisperGain = null;
    setTimeout(() => g?.disconnect(), 1000);
  }


  setIntensity(v: number): void {
    this.intensity = Math.max(0, Math.min(1, v));
    if (this.ctx && this.currentTrack) {
      const rec = this.musicEls.get(this.currentTrack);
      if (rec) rec.gain.gain.setTargetAtTime(this.musicTargetGain(), this.ctx.currentTime, 0.6);
    }
    // final wave — bring up the boss theme
    if (v >= 1 && this.currentTrack === "battle") this.switchTrack("boss");
  }
}
