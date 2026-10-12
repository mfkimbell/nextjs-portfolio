/**
 * Every sound file the campsite scenes play, with the lab's per-sound tuning.
 *
 * Each sound gets six config keys, `sfx_<id>_<field>` (vol, rate, delay,
 * start, end, pan), read by lib/campsiteSounds at play time - so any one-shot
 * or loop made with useCampsiteOneShot / useCampsiteAudioLoop for one of these
 * URLs picks its tuning up with no change at the call site. A key missing from
 * the config falls back to the default here.
 *
 * `vol` multiplies the sound's existing volume (master x its own slider); it
 * goes above 1 to boost a quiet file. `start` skips silence at the head of a
 * file, `end` cuts the tail (0 = play to the end) - for a loop, the stretch
 * between them is what repeats.
 */
import { setSoundTune, type SoundTune } from "@/lib/campsiteSounds";

export type SoundField = keyof SoundTune;
export type SoundEntry = {
  id: string;
  label: string;
  url: string;
  loop?: boolean;
  /** where it plays, for the lab grouping */
  where: string;
  defaults?: Partial<SoundTune>;
};

export const SOUND_LIST: readonly SoundEntry[] = [
  // scene 1 - campfire
  { id: "fireCrackle", label: "Fire crackling (loop)", url: "/sound/fire_crackling.mp3", loop: true, where: "Campfire" },
  { id: "banjo", label: "Banjo (loop)", url: "/sound/banjo.mp3", loop: true, where: "Campfire" },
  { id: "fireWhoosh", label: "Fire whoosh (fish / click the fire)", url: "/sound/fire whoosh.mp3", where: "Campfire" },
  { id: "fishFlop", label: "Fish flop", url: "/sound/fish_flop.wav", where: "Campfire" },
  { id: "leftBag", label: "Left bag falls", url: "/sound/left-bag-fall.mp3", where: "Campfire", defaults: { pan: -0.6 } },
  { id: "rightBag", label: "Right bag falls", url: "/sound/right-bag-fall.mp3", where: "Campfire", defaults: { pan: 0.6 } },
  { id: "rodFall", label: "Fishing rod falls / log knock", url: "/sound/fishing-rod-fall-sound.mp3", where: "Campfire", defaults: { pan: 0.6 } },
  // the spin file is 2.7 s of silence, a 0.6 s whoosh, then silence again
  { id: "axeSpin", label: "Axe spinning in the air", url: "/sound2/axe-spinning-in-air-sound.mp3", where: "Campfire", defaults: { start: 2.62, vol: 2.5, pan: -0.6 } },
  { id: "axeHit", label: "Axe hits the block", url: "/sound2/axehitwood.mp3", where: "Campfire", defaults: { start: 0.24, pan: -0.6 } },
  { id: "woodRoll", label: "Log rolling (loop)", url: "/sound2/wood-rolling-needs-to-be-looped.mp3", loop: true, where: "Campfire", defaults: { start: 0.29, end: 1.06, vol: 1.5 } },
  // scene 2 - arcade
  { id: "crtMusic", label: "Arcade music (loop)", url: "/sound/CRT music.mp3", loop: true, where: "Arcade" },
  { id: "crtZoomIn", label: "Zoom into the CRT", url: "/CRT/zoom into CRT.wav", where: "Arcade" },
  { id: "crtZoomOut", label: "Zoom out of the CRT", url: "/CRT/zoom out of crt.wav", where: "Arcade" },
  { id: "select", label: "CRT select", url: "/sound/select.wav", where: "Arcade" },
  // scene 3 - cabin
  { id: "rockingChair", label: "Rocking chair (loop)", url: "/sound/rocking-chair.mp3", loop: true, where: "Cabin" },
  { id: "gramophone", label: "Gramophone song (loop)", url: "/sound2/gramaphone_song.mp3", loop: true, where: "Cabin", defaults: { pan: 0.65 } },
  { id: "pcGlideIn", label: "Glide into the computer", url: "/sound/Go into computer.mp3", where: "Cabin" },
  { id: "pcGlideOut", label: "Glide out of the computer", url: "/sound/switch-between-scenes.wav", where: "Cabin" },
  { id: "pcStartup", label: "Computer startup jingle", url: "/sound2/scene3computerstart.mp3", where: "Cabin" },
  // everywhere
  { id: "click", label: "Click", url: "/sound/click.wav", where: "Everywhere" },
  { id: "hover", label: "Hover", url: "/sound/hover.wav", where: "Everywhere" },
  { id: "back", label: "Back", url: "/sound/back.wav", where: "Everywhere" },
];

export const SOUND_FIELDS: readonly { field: SoundField; label: string; min: number; max: number; step: number; def: number }[] = [
  { field: "vol", label: "volume (x, above 1 = boost)", min: 0, max: 4, step: 0.05, def: 1 },
  { field: "rate", label: "speed", min: 0.25, max: 3, step: 0.01, def: 1 },
  { field: "delay", label: "delay (s)", min: 0, max: 3, step: 0.01, def: 0 },
  { field: "start", label: "start at (s into the file)", min: 0, max: 10, step: 0.01, def: 0 },
  { field: "end", label: "stop at (s, 0 = the end)", min: 0, max: 10, step: 0.01, def: 0 },
  { field: "pan", label: "left / right (-1 .. 1)", min: -1, max: 1, step: 0.01, def: 0 },
];

export const sfxKey = (id: string, field: SoundField) => `sfx_${id}_${field}` as const;

/** The value for one field, from the config or else the sound's default. */
export function sfxValue(config: Record<string, unknown>, s: SoundEntry, field: SoundField): number {
  const v = config[sfxKey(s.id, field)];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const d = s.defaults?.[field];
  return typeof d === "number" ? d : (SOUND_FIELDS.find((f) => f.field === field)?.def ?? 0);
}

/** Push the config's tuning into the sound library. Cheap; call on render. */
export function applySoundTuning(config: Record<string, unknown>) {
  for (const s of SOUND_LIST) {
    setSoundTune(s.url, {
      vol: sfxValue(config, s, "vol"),
      rate: sfxValue(config, s, "rate"),
      delay: sfxValue(config, s, "delay"),
      start: sfxValue(config, s, "start"),
      end: sfxValue(config, s, "end"),
      pan: sfxValue(config, s, "pan"),
    });
  }
}

/* ---------------------------------------------------------- lab preview */

let previewTimer: number | undefined;
let previewing: { a: HTMLAudioElement; stop: number[] } | null = null;

/**
 * Lab: play a sound with a given tuning so a slider change can be heard
 * straight away. Debounced (a drag plays once it settles for a moment), and
 * a new preview cuts the previous one off. Loops play a ~4 s taste, looping
 * the start..stop stretch like the scene does.
 */
export function previewSound(s: SoundEntry, tune: SoundTune, baseVolume = 0.7) {
  if (typeof window === "undefined") return;
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => {
    if (previewing) { previewing.a.pause(); previewing.stop.forEach((t) => window.clearTimeout(t)); previewing = null; }
    const a = new Audio(s.url);
    a.preservesPitch = false;
    a.playbackRate = Math.max(0.05, tune.rate);
    a.volume = Math.max(0, Math.min(1, baseVolume * Math.min(1, tune.vol)));
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor && (tune.vol > 1 || Math.abs(tune.pan) > 0.001)) {
        const ctx = previewCtx ?? (previewCtx = new Ctor());
        void ctx.resume();
        const src = ctx.createMediaElementSource(a);
        const g = ctx.createGain(); g.gain.value = Math.max(1, tune.vol);
        const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, tune.pan));
        src.connect(g); g.connect(p); p.connect(ctx.destination);
      }
    } catch { /* plain playback */ }
    const stops: number[] = [];
    const rate = a.playbackRate;
    const begin = () => {
      if (tune.start > 0) { try { a.currentTime = tune.start; } catch { /* */ } }
      void a.play().catch(() => {});
      if (s.loop) {
        const end = tune.end > tune.start ? tune.end : 0;
        if (end) {
          const wrap = window.setInterval(() => { if (a.currentTime >= end) a.currentTime = tune.start; }, 20);
          stops.push(wrap as unknown as number);
        }
        stops.push(window.setTimeout(() => { a.pause(); stops.forEach((t) => window.clearInterval(t)); }, 4000));
      } else if (tune.end > tune.start) {
        stops.push(window.setTimeout(() => a.pause(), ((tune.end - tune.start) / rate) * 1000));
      }
    };
    stops.push(window.setTimeout(() => {
      if (a.readyState >= 1) begin(); else a.addEventListener("loadedmetadata", begin, { once: true });
    }, tune.delay * 1000));
    previewing = { a, stop: stops };
  }, 220);
}
let previewCtx: AudioContext | null = null;
