"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import CampfireScene from "@/components/scene-lab/CampfireScene";
import CampsiteTitleIntro from "@/components/scene-lab/CampsiteTitleIntro";
import OceanFloorScene from "@/components/scene-lab/OceanFloorScene";
import {
  BASE_CAMPFIRE_CONFIG,
  DEFAULT_CAMPFIRE_CONFIG,
  DEFAULT_OCEAN_CONFIG,
  DUPLICATE_PREFIX,
  defaultLocationView,
  EMPTY_DUPLICATE,
  LOCATION_VIEW_FIELDS,
  type CampfireSceneConfig,
  type LocationView,
  type ObjectDuplicate,
  type ObjectOverride,
  type OceanFloorSceneConfig,
} from "@/components/scene-lab/sceneConfig";
import { worldToLocationView } from "@/components/scene-lab/CampfireScene";

type SceneKey = "campfire" | "ocean";
type DragPlaneMode = "xz" | "xy";

const SCENE_DETAILS: Record<SceneKey, { label: string; eyebrow: string; description: string }> = {
  campfire: {
    label: "Campfire",
    eyebrow: "Warm / cozy / cinematic",
    description: "Camera rig, fire light height/reach, fog, flicker, glow, and fill lighting.",
  },
  ocean: {
    label: "Ocean Floor",
    eyebrow: "Cool / mysterious / minimal",
    description: "Camera rig, front beam height/distance/angle, blue fog, particles, and caustics.",
  },
};

/** Must stay in the same order as the locations in CampfireScene. */
const LOCATION_NAMES = ["Campfire", "Arcade", "Desk"] as const;

const isSceneKey = (value: string): value is SceneKey => value === "campfire" || value === "ocean";
const STORAGE_KEY = "scene-lab-config-v1";

type SavedSceneLabConfig = {
  activeScene?: unknown;
  campfire?: unknown;
  ocean?: unknown;
};

function mergeNumericConfig<T extends object>(defaults: T, saved: unknown): T {
  const next = { ...defaults };
  if (!saved || typeof saved !== "object") return next;

  const savedRecord = saved as Record<string, unknown>;
  (Object.keys(defaults) as Array<keyof T>).forEach((key) => {
    const value = savedRecord[String(key)];
    if (typeof value === "number" && Number.isFinite(value)) {
      next[key] = value as T[keyof T];
    } else if (
      key === ("objectOverrides" as keyof T) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const sanitized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (!v || typeof v !== "object") continue;
        const src = v as Record<string, unknown>;
        const dst: Record<string, number> = {};
        for (const field of ["dx", "dy", "dz", "rotX", "rotY", "rotZ", "scale", "hide", "noShadow"] as const) {
          const raw = src[field];
          dst[field] = typeof raw === "number" && Number.isFinite(raw) ? raw : (field === "scale" ? 1 : 0);
        }
        sanitized[k] = dst;
      }
      next[key] = sanitized as T[keyof T];
    } else if (
      key === ("objectDuplicates" as keyof T) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const sanitized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (!v || typeof v !== "object") continue;
        const src = v as Record<string, unknown>;
        const source = typeof src.source === "string" ? src.source : null;
        if (!source) continue;
        const dst: Record<string, unknown> = { source };
        for (const field of ["dx", "dy", "dz", "rotX", "rotY", "rotZ", "scale", "noShadow"] as const) {
          const raw = src[field];
          dst[field] = typeof raw === "number" && Number.isFinite(raw) ? raw : (field === "scale" ? 1 : 0);
        }
        sanitized[k] = dst;
      }
      next[key] = sanitized as T[keyof T];
    } else if (
      key === ("lockedObjects" as keyof T) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const sanitized: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof v === "boolean" && v) sanitized[k] = true;
      }
      next[key] = sanitized as T[keyof T];
    } else if (key === ("locationViews" as keyof T) && Array.isArray(value)) {
      // One camera per location. Sanitised field by field so a half-written or
      // stale saved entry falls back to the default shot rather than NaN-ing the
      // camera into nowhere.
      const fallback = (defaults as unknown as CampfireSceneConfig).locationViews ?? [];
      const views = value.map((entry, i) => {
        const base = fallback[i] ?? fallback[0];
        const src = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
        const out = {} as Record<string, number>;
        for (const field of LOCATION_VIEW_FIELDS) {
          const raw = src[field];
          out[field] = typeof raw === "number" && Number.isFinite(raw) ? raw : base?.[field] ?? 0;
        }
        return out;
      });
      if (views.length) next[key] = views as T[keyof T];
    }
  });

  return next;
}

function readSavedSceneLabConfig(): SavedSceneLabConfig | null {
  // Config lives in src/config/campfireScene.json now, so ignore any stale
  // localStorage entry and delete it on the way out — file is the single
  // source of truth for scene state.
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return null;
}

function formatValue(value: number) {
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

const SearchContext = createContext<string>("");

function matchesSearch(label: string, query: string, groupTitle?: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return label.toLowerCase().includes(q) || (groupTitle?.toLowerCase().includes(q) ?? false);
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const query = useContext(SearchContext);
  const groupTitle = useContext(GroupTitleContext);
  if (!matchesSearch(label, query, groupTitle)) return null;
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between gap-3 text-[0.68rem] uppercase tracking-[0.16em] text-white/55">
        <span>{label}</span>
        <span className="font-mono text-white/80">{formatValue(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer accent-white"
      />
    </label>
  );
}

const GroupTitleContext = createContext<string>("");

/** Turn a section title into a stable DOM id so the jump-bar can scroll to it. */
function sectionIdFromTitle(title: string) {
  return `cg-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

/** Which of the three sites a control group belongs to. Groups without a
 *  `scope` are considered `"shared"` and stay visible in every filter. */
type LocationScope = "1" | "2" | "3" | "shared";
const LocationScopeContext = createContext<LocationScope | null>(null);

/**
 * ControlGroup used to be a plain uncontrolled <details>, which was fine until
 * the autosave started rewriting src/config/campfireScene.json on every slider
 * drag - Next.js Fast Refresh would reload the module and the browser's own
 * open/closed DOM state would snap back to "closed" every ~800ms. We now
 * pin the open state in localStorage so a hot-reload during editing lands the
 * panel back where the user had it.
 */
const CONTROL_GROUP_OPEN_KEY = "campfire-lab:control-group-open:v1";

function readOpenMap(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CONTROL_GROUP_OPEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeOpenMap(map: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONTROL_GROUP_OPEN_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

function ControlGroup({ title, jumpKey, scope = "shared", children }: { title: string; jumpKey?: string; scope?: LocationScope; children: ReactNode }) {
  const filter = useContext(LocationScopeContext);
  const id = sectionIdFromTitle(jumpKey ?? title);

  // Open state is a fully React-controlled boolean, seeded synchronously from
  // localStorage on first render. The old approach let <details> use its own
  // uncontrolled DOM state, which snapped shut on every Fast Refresh reload
  // (which fires ~800ms after each slider drag, because autosave rewrites
  // campfireScene.json). Controlling the value here keeps whatever panel the
  // user is editing pinned open through those reloads.
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem(CONTROL_GROUP_OPEN_KEY);
      if (!raw) return false;
      const map = JSON.parse(raw) as Record<string, boolean>;
      return !!map[id];
    } catch {
      return false;
    }
  });

  // Persist to localStorage whenever it flips, so the next hot-reload seeds
  // from the freshly-updated map.
  useEffect(() => {
    const map = readOpenMap();
    map[id] = open;
    writeOpenMap(map);
  }, [id, open]);

  // SectionJumpBar imperatively sets `.open = true` on the DOM element - keep
  // React state in sync when that happens (or when the user clicks the
  // native summary triangle).
  const onToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    setOpen(e.currentTarget.open);
  };

  // filter === null means "show everything"; otherwise only shared + matching-scope groups.
  if (filter !== null && filter !== "shared" && scope !== "shared" && scope !== filter) return null;
  return (
    <GroupTitleContext.Provider value={title}>
      <details
        id={id}
        open={open}
        onToggle={onToggle}
        className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 [&:not(:has(label))]:hidden"
      >
        <summary className="cursor-pointer select-none py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/65 hover:text-white">
          {title}
        </summary>
        <div className="mt-3 space-y-3">{children}</div>
      </details>
    </GroupTitleContext.Provider>
  );
}

/** Sticky pill nav that opens + scrolls to the target ControlGroup. */
function SectionJumpBar({ titles }: { titles: string[] }) {
  const jump = (title: string) => {
    const id = sectionIdFromTitle(title);
    const el = document.getElementById(id) as HTMLDetailsElement | null;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className="sticky top-0 z-20 -mx-3 mb-2 border-b border-white/10 bg-black/70 px-3 py-2 backdrop-blur">
      <div className="mb-1 text-[0.62rem] uppercase tracking-[0.22em] text-white/50">Jump to</div>
      <div className="flex flex-wrap gap-1">
        {titles.map((t) => (
          <button
            key={t}
            onClick={() => jump(t)}
            className="rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[0.62rem] font-medium text-white/80 hover:border-white/40 hover:bg-white/15"
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function normalizeCampfireConfig(config: CampfireSceneConfig): CampfireSceneConfig {
  const fogFar = Math.max(1.3, config.fogFar);
  const fogNear = Math.max(0.1, Math.min(config.fogNear, fogFar - 0.5));

  return { ...config, fogNear, fogFar };
}

function normalizeOceanConfig(config: OceanFloorSceneConfig): OceanFloorSceneConfig {
  const fogFar = Math.max(1, config.fogFar);
  const fogNear = Math.max(0.1, Math.min(config.fogNear, fogFar - 0.5));

  return { ...config, fogNear, fogFar };
}

export default function SceneLabClient() {
  const [activeScene, setActiveScene] = useState<SceneKey>("campfire");
  const [controlsOpen, setControlsOpen] = useState(true);
  const [lightsOpen, setLightsOpen] = useState(true);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [campfireConfig, setCampfireConfig] = useState<CampfireSceneConfig>(DEFAULT_CAMPFIRE_CONFIG);
  const [oceanConfig, setOceanConfig] = useState<OceanFloorSceneConfig>(DEFAULT_OCEAN_CONFIG);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [dragPlaneMode, setDragPlaneMode] = useState<DragPlaneMode>("xz");
  /**
   * Names the user has clicked at least once this session, plus anything that
   * shows up in an override, duplicate, or lock entry. Feeds the "Object list"
   * drawer. Progressive so we don't have to enumerate every named group at
   * mount - clicking a bear once is what puts it on the list.
   */
  const [knownObjects, setKnownObjects] = useState<string[]>([]);
  const [objectListOpen, setObjectListOpen] = useState(false);
  /**
   * Free-look camera pose the user is currently exploring. Written on every
   * OrbitControls change but NOT committed to config unless "Save camera" is
   * clicked. That way orbiting around to inspect a prop doesn't overwrite the
   * saved shot. Seeded from the config so the initial value is meaningful.
   */
  const liveCameraRef = useRef<{ pos: [number, number, number]; tgt: [number, number, number] }>({
    pos: [DEFAULT_CAMPFIRE_CONFIG.cameraX, DEFAULT_CAMPFIRE_CONFIG.cameraY, DEFAULT_CAMPFIRE_CONFIG.cameraZ],
    tgt: [DEFAULT_CAMPFIRE_CONFIG.targetX, DEFAULT_CAMPFIRE_CONFIG.targetY, DEFAULT_CAMPFIRE_CONFIG.targetZ],
  });
  /** Pending location views by panel index. Written by CampfireScene when the
   *  user orbits in panelled mode; committed to config.locationViews only when
   *  the user hits "Save camera". Keyed per location so a Save on the campfire
   *  panel doesn't drag along the arcade's edits. */
  const livePendingLocationsRef = useRef<Record<number, LocationView>>({});
  /** The camera's live world position + target, kept fresh by OrbitControls'
   *  "change" event. Save reads from this directly so a click commits whatever
   *  is on screen right now, even if the user hasn't dragged since arriving at
   *  the campsite (which was the bug: pending was empty, Save was a no-op). */
  const cameraLivePoseRef = useRef<
    { pos: [number, number, number]; tgt: [number, number, number] } | null
  >(null);
  /** Ticks up whenever "Reset camera" is pressed so CampfireScene snaps back. */
  const [cameraSnapSignal, setCameraSnapSignal] = useState(0);
  /** true while the live pose differs from the saved pose - shows "unsaved" tag. */
  const [cameraDirty, setCameraDirty] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sceneKey, setSceneKey] = useState(0);
  /**
   * null = free look. 0-2 = standing on that location with its real site camera,
   * while orbit, picking and dragging all stay live - so a shot can be framed
   * against the actual composition rather than guessed at from outside.
   */
  const [siteView, setSiteView] = useState<number | null>(null);
  /** Filter for the config sidebar: which of the three sites' sections are
   *  visible. null = show all. */
  const [locationScopeFilter, setLocationScopeFilter] = useState<LocationScope | null>(null);
  // Clear the dirty flag when the visitor jumps to a different location - the
  // LocationCamera teleport takes over and any pending pose for the previous
  // panel is now unrelated to what's on screen.
  useEffect(() => { setCameraDirty(false); }, [siteView]);
  /**
   * Per-location camera defaults, separate from the main campfire config so the
   * user can pin a "home" shot per location, adjust freely, then jump back with
   * one click. Persisted via /api/dev/camera-defaults -> src/config/cameraDefaults.json.
   * Keyed by location index (0/1/2), value is the same LocationView shape.
   */
  const [cameraDefaults, setCameraDefaults] = useState<Record<string, LocationView>>({});
  useEffect(() => {
    let cancelled = false;
    fetch("/api/dev/camera-defaults")
      .then((r) => r.json())
      .then((d: Record<string, LocationView>) => { if (!cancelled) setCameraDefaults(d ?? {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const saveCameraDefault = async (index: number) => {
    const view = campfireConfig.locationViews?.[index] ?? defaultLocationView(index, campfireConfig);
    const next = { ...cameraDefaults, [String(index)]: view };
    setCameraDefaults(next);
    try {
      const res = await fetch("/api/dev/camera-defaults", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        showSaveMessage(`Camera default save failed: ${res.status}`);
        return;
      }
      showSaveMessage(`Saved default camera for ${LOCATION_NAMES[index]}`);
    } catch (err) {
      showSaveMessage(`Camera default save error: ${(err as Error).message}`);
    }
  };
  const restoreCameraDefault = (index: number) => {
    const saved = cameraDefaults[String(index)];
    if (!saved) {
      showSaveMessage(`No saved default yet for ${LOCATION_NAMES[index]}`);
      return;
    }
    updateLocationView(index, { ...saved });
    showSaveMessage(`Restored default camera for ${LOCATION_NAMES[index]}`);
  };
  /**
   * When on, an overlay renders `<CampsiteTitleIntro>` on top of the campfire
   * scene AND the intro flight is held at its pulled-back start pose, so the
   * user can tune the title timing/camera and see it live. Clicking "Title"
   * again replays it (via titlePreviewKey), and (sound on) hands off to the
   * flight lands — same as production.
   */
  const [titlePreview, setTitlePreview] = useState(false);
  const [titlePreviewKey, setTitlePreviewKey] = useState(0);
  /**
   * Separate from titlePreview so we can release the flight (titleHeldForPreview
   * = false) the moment the visitor clicks (sound on), while the title overlay
   * keeps rendering its fade-out for another beat. Result: the flight is
   * already swooping in behind the fading letters — seamless.
   */
  const [titleHeldForPreview, setTitleHeldForPreview] = useState(false);
  const startTitlePreview = () => {
    // Match production: the site runs with panel=0 (Campfire location) so the
    // intro flight lands at that shot. Free-look would land somewhere else
    // and the preview would frame the letters over a different composition.
    setSiteView(0);
    setSelectedObject(null);
    setTitlePreview(true);
    setTitleHeldForPreview(true);
    setTitlePreviewKey((k) => k + 1);
    // Remount the campfire scene so the intro flight resets to its start pose.
    // Without this, if the intro flight has already finished, titleHeld has
    // nothing to hold.
    setSceneKey((k) => k + 1);
  };

  const updateLocationView = (index: number, view: LocationView) => {
    setCampfireConfig((previous) => {
      const views = [...(previous.locationViews ?? [])];
      while (views.length <= index) views.push(defaultLocationView(views.length, previous));
      views[index] = view;
      return normalizeCampfireConfig({ ...previous, locationViews: views });
    });
  };

  const updateLocationViewField = (index: number, field: keyof LocationView, value: number) => {
    setCampfireConfig((previous) => {
      const views = [...(previous.locationViews ?? [])];
      while (views.length <= index) views.push(defaultLocationView(views.length, previous));
      views[index] = { ...views[index], [field]: value };
      return normalizeCampfireConfig({ ...previous, locationViews: views });
    });
  };

  const updateOverride = (name: string, field: keyof ObjectOverride, value: number) => {
    setCampfireConfig((previous) => {
      const overrides = { ...(previous.objectOverrides || {}) };
      const current = overrides[name] ?? { dx: 0, dy: 0, dz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1, hide: 0, noShadow: 0 };
      overrides[name] = { ...current, [field]: value };
      const next = normalizeCampfireConfig({ ...previous, objectOverrides: overrides });
      // Boolean flags are one-off intents (a checkbox toggle) rather than
      // scrubs, so bypass the 800 ms autosave debounce - otherwise a quick
      // toggle+reload can lose the write. Fires directly with the
      // just-computed state so no stale-closure risk. `keepalive` so the
      // request finishes even if the tab reloads or the dev server is being
      // bounced right after the click. Failures used to be silently swallowed
      // (`.catch(() => {})`) which made a lost write look like the flag "reset
      // on restart"; now surface it in the save banner and the console so we
      // can see when the API refused (e.g. NODE_ENV=production returns 403).
      if (field === "hide" || field === "noShadow") {
        void (async () => {
          try {
            const res = await fetch("/api/dev/scene-config", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ campfire: next }),
              keepalive: true,
            });
            if (!res.ok) {
              const detail = await res.text().catch(() => "");
              console.error("scene-config save failed", res.status, detail);
              showSaveMessage(`Toggle didn't persist — ${res.status}${detail ? `: ${detail.slice(0, 80)}` : ""}`);
            }
          } catch (err) {
            console.error("scene-config save error", err);
            showSaveMessage(`Toggle didn't persist — ${(err as Error).message}`);
          }
        })();
      }
      return next;
    });
  };

  const updateObjectTranslation = (name: string, next: Pick<ObjectOverride, "dx" | "dy" | "dz">) => {
    setCampfireConfig((previous) => {
      if (name.startsWith(DUPLICATE_PREFIX)) {
        const dups = { ...(previous.objectDuplicates || {}) };
        const current = dups[name];
        if (!current) return previous;
        dups[name] = { ...current, ...next };
        return normalizeCampfireConfig({ ...previous, objectDuplicates: dups });
      }
      const overrides = { ...(previous.objectOverrides || {}) };
      const current = overrides[name] ?? { dx: 0, dy: 0, dz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1, hide: 0, noShadow: 0 };
      overrides[name] = { ...current, ...next };
      return normalizeCampfireConfig({ ...previous, objectOverrides: overrides });
    });
  };

  const resetOverride = (name: string) => {
    setCampfireConfig((previous) => {
      const overrides = { ...(previous.objectOverrides || {}) };
      delete overrides[name];
      return normalizeCampfireConfig({ ...previous, objectOverrides: overrides });
    });
  };

  // Monotonic id source for duplicates. Persisted alongside the config via the
  // id itself (dup:N), so we look at existing entries to pick a fresh N.
  const nextDuplicateId = (existing: Record<string, ObjectDuplicate> | undefined) => {
    let max = 0;
    for (const key of Object.keys(existing ?? {})) {
      const n = parseInt(key.slice(DUPLICATE_PREFIX.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return `${DUPLICATE_PREFIX}${max + 1}`;
  };

  const duplicateObject = (name: string): string | null => {
    if (name.startsWith(DUPLICATE_PREFIX)) {
      // Duplicating a duplicate: point the new entry at the same source, with
      // its deltas seeded to a small offset off the existing clone so the two
      // don't stack invisibly.
      let newId: string | null = null;
      setCampfireConfig((previous) => {
        const dups = { ...(previous.objectDuplicates || {}) };
        const src = dups[name];
        if (!src) return previous;
        const id = nextDuplicateId(dups);
        newId = id;
        dups[id] = { ...src, dx: src.dx + 0.3, dz: src.dz + 0.3 };
        return normalizeCampfireConfig({ ...previous, objectDuplicates: dups });
      });
      return newId;
    }
    let newId: string | null = null;
    setCampfireConfig((previous) => {
      const dups = { ...(previous.objectDuplicates || {}) };
      const id = nextDuplicateId(dups);
      newId = id;
      // Seed the duplicate on the source's applied transform (inherit its
      // override deltas so it lands where the source visually is), then
      // nudge slightly in X/Z so it isn't hidden behind the original.
      const src = previous.objectOverrides?.[name];
      dups[id] = {
        source: name,
        ...EMPTY_DUPLICATE,
        dx: (src?.dx ?? 0) + 0.3,
        dy: src?.dy ?? 0,
        dz: (src?.dz ?? 0) + 0.3,
        rotX: src?.rotX ?? 0,
        rotY: src?.rotY ?? 0,
        rotZ: src?.rotZ ?? 0,
        scale: src?.scale ?? 1,
      };
      return normalizeCampfireConfig({ ...previous, objectDuplicates: dups });
    });
    return newId;
  };

  const updateDuplicate = (
    id: string,
    field: keyof Omit<ObjectDuplicate, "source">,
    value: number
  ) => {
    setCampfireConfig((previous) => {
      const dups = { ...(previous.objectDuplicates || {}) };
      const current = dups[id];
      if (!current) return previous;
      dups[id] = { ...current, [field]: value };
      const next = normalizeCampfireConfig({ ...previous, objectDuplicates: dups });
      // Same "boolean flags save immediately" rule as updateOverride, so a
      // toggle survives a quick reload without waiting on the 800 ms debounce.
      // Uses `keepalive` + a visible error surface (see updateOverride) so the
      // write doesn't disappear silently when the dev server is being bounced.
      if (field === "noShadow") {
        void (async () => {
          try {
            const res = await fetch("/api/dev/scene-config", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ campfire: next }),
              keepalive: true,
            });
            if (!res.ok) {
              const detail = await res.text().catch(() => "");
              console.error("scene-config save failed", res.status, detail);
              showSaveMessage(`Toggle didn't persist — ${res.status}${detail ? `: ${detail.slice(0, 80)}` : ""}`);
            }
          } catch (err) {
            console.error("scene-config save error", err);
            showSaveMessage(`Toggle didn't persist — ${(err as Error).message}`);
          }
        })();
      }
      return next;
    });
  };

  const toggleLocked = (name: string) => {
    setCampfireConfig((previous) => {
      const locks = { ...(previous.lockedObjects || {}) };
      if (locks[name]) delete locks[name]; else locks[name] = true;
      return normalizeCampfireConfig({ ...previous, lockedObjects: locks });
    });
    // Add to the known list so a name locked via the drawer sticks even if it
    // was never clicked before (e.g. locked from a saved config).
    setKnownObjects((prev) => (prev.includes(name) ? prev : [...prev, name]));
  };

  const removeDuplicate = (id: string) => {
    setCampfireConfig((previous) => {
      const dups = { ...(previous.objectDuplicates || {}) };
      delete dups[id];
      return normalizeCampfireConfig({ ...previous, objectDuplicates: dups });
    });
  };

  // Anything hidden before this panel existed (the old "Hidden" slider) also counts as
  // deleted, so this list can be long from the start. It stays collapsed to a chip and
  // can be dismissed outright; deleting something new brings it back.
  const [deletedOpen, setDeletedOpen] = useState(false);
  const [deletedDismissed, setDeletedDismissed] = useState(true);

  const deleteObject = (name: string) => {
    updateOverride(name, "hide", 1);
    setDeletedDismissed(false);
    setDeletedOpen(true);
  };

  // "Delete" is really hide=1: non-destructive, saved with the config, and reversible.
  // A hidden mesh can't be raycast, so once it's gone you can't click it to get it
  // back - that's what the restore list below the panel is for.
  const deletedObjects = useMemo(
    () =>
      Object.entries(campfireConfig.objectOverrides || {})
        .filter(([, o]) => o.hide >= 0.5)
        .map(([name]) => name)
        .sort(),
    [campfireConfig.objectOverrides]
  );

  useEffect(() => {
    const saved = readSavedSceneLabConfig();
    const hash = window.location.hash.replace("#", "").trim();

    if (saved) {
      setCampfireConfig(normalizeCampfireConfig(mergeNumericConfig(DEFAULT_CAMPFIRE_CONFIG, saved.campfire)));
      setOceanConfig(normalizeOceanConfig(mergeNumericConfig(DEFAULT_OCEAN_CONFIG, saved.ocean)));

      if (!isSceneKey(hash) && typeof saved.activeScene === "string" && isSceneKey(saved.activeScene)) {
        setActiveScene(saved.activeScene);
      }
    }

    const readHash = () => {
      const nextHash = window.location.hash.replace("#", "").trim();
      if (isSceneKey(nextHash)) setActiveScene(nextHash);
    };

    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  const updateCampfire = (key: keyof CampfireSceneConfig, value: number) => {
    setCampfireConfig((previous) => normalizeCampfireConfig({ ...previous, [key]: value }));
  };

  const updateOcean = (key: keyof OceanFloorSceneConfig, value: number) => {
    setOceanConfig((previous) => normalizeOceanConfig({ ...previous, [key]: value }));
  };

  const showSaveMessage = (message: string) => {
    setSaveMessage(message);
    window.setTimeout(() => setSaveMessage(null), 1800);
  };

  /**
   * Every slider back to its default, keeping the objectOverrides.
   *
   * The two are deliberately separate: the sliders are a look that can be dialled in
   * again in a minute, whereas the overrides are where each prop was dragged, tilted
   * and scaled to, which is real work. "Clear" throws away both; this only the first.
   */
  const resetSliders = () => {
    setCampfireConfig((previous) => normalizeCampfireConfig({
      ...BASE_CAMPFIRE_CONFIG,
      locationViews: BASE_CAMPFIRE_CONFIG.locationViews.map((v) => ({ ...v })),
      objectOverrides: previous.objectOverrides,
    }));
    showSaveMessage("Sliders reset — moved props kept");
  };

  /**
   * Writes the config into src/config/campfireScene.json, in the repo.
   *
   * Everything else here only ever reaches localStorage, which never leaves this
   * browser - so it does not get committed and a deployed visitor never sees it.
   * This is the one that makes the tuning real. Dev only; the route refuses in
   * production.
   */
  const [savingToProject, setSavingToProject] = useState(false);
  const saveToProject = async () => {
    setSavingToProject(true);
    try {
      const res = await fetch("/api/dev/scene-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campfire: campfireConfig }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; objects?: number };
      if (!res.ok) {
        showSaveMessage(`Could not save to project: ${data.error ?? res.status}`);
        return;
      }
      showSaveMessage(`Saved to campfireScene.json — ${data.objects ?? 0} placed props. Commit it to ship.`);
    } catch (err) {
      showSaveMessage(`Could not reach the dev server: ${(err as Error).message}`);
    } finally {
      setSavingToProject(false);
    }
  };

  // Legacy in-browser save is retired: all scene edits now go straight to
  // src/config/campfireScene.json via saveToProject / the debounced auto-save.
  // Keeping the handler as a thin alias to saveToProject so the existing button
  // in the panel still lands them on disk.
  const saveConfig = () => {
    void saveToProject();
  };

  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = useRef(false);
  useEffect(() => {
    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
      return;
    }
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    // Try to fire ~2.5s after the last change. That single write rewrites
    // src/config/campfireScene.json, which Next.js's dev server hot-reloads
    // (JSON is not Fast-Refreshable, so the whole module graph re-evaluates).
    // If we save mid-drag the panel jitters and slider state can snap. So:
    //   - Longer quiet window than the old 800ms (fewer HMR cycles).
    //   - When the timer fires, if a control input is still focused (user is
    //     scrubbing another slider or dragging this one), re-arm and wait.
    const trySave = () => {
      const active = typeof document !== "undefined" ? document.activeElement : null;
      const tag = active?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
        autoSaveTimeoutRef.current = setTimeout(trySave, 1500);
        return;
      }
      fetch("/api/dev/scene-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campfire: campfireConfig }),
      }).catch(() => {
        // best-effort: swallow network hiccups; the next change will retry
      });
    };
    autoSaveTimeoutRef.current = setTimeout(trySave, 2500);
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, [campfireConfig, oceanConfig, activeScene]);

  const clearSavedConfig = () => {
    // Always remove any lingering localStorage entry too, so the browser can't
    // silently override the file.
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    showSaveMessage("Local cache cleared — file is the source of truth");
  };

  const detail = SCENE_DETAILS[activeScene];

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-white">
      {activeScene === "campfire" ? (
        <CampfireScene
          key={`campfire-scene-${sceneKey}`}
          config={campfireConfig}
          cameraSnapSignal={cameraSnapSignal}
          cameraLivePoseRef={cameraLivePoseRef}
          onCameraChange={(pos, tgt) => {
            // NOTE: we deliberately do NOT commit to config here. Orbiting
            // around to inspect a scene shouldn't overwrite the saved camera
            // pose. The user presses "Save camera" to commit; "Reset camera"
            // snaps back to whatever is in config.
            liveCameraRef.current = { pos, tgt };
            const saved = campfireConfig;
            const eps = 0.001;
            const dirty =
              Math.abs(pos[0] - saved.cameraX) > eps ||
              Math.abs(pos[1] - saved.cameraY) > eps ||
              Math.abs(pos[2] - saved.cameraZ) > eps ||
              Math.abs(tgt[0] - saved.targetX) > eps ||
              Math.abs(tgt[1] - saved.targetY) > eps ||
              Math.abs(tgt[2] - saved.targetZ) > eps;
            setCameraDirty(dirty);
          }}
          onSelect={(name) => {
            setSelectedObject(name || null);
            if (name) setKnownObjects((prev) => (prev.includes(name) ? prev : [...prev, name]));
          }}
          selectedObject={selectedObject}
          dragPlaneMode={dragPlaneMode}
          onObjectTranslate={updateObjectTranslation}
          panel={siteView}
          editing
          onLocationViewChange={(index, view) => {
            // Same rule as free-look: don't persist on drag - stash in a per-
            // location pending ref, flag dirty, wait for Save. Reset can snap
            // back to the saved locationViews entry via cameraSnapSignal.
            livePendingLocationsRef.current[index] = view;
            const saved = campfireConfig.locationViews?.[index];
            const eps = 0.001;
            const dirty = !saved || LOCATION_VIEW_FIELDS.some((f) => Math.abs(view[f] - saved[f]) > eps);
            setCameraDirty(dirty);
          }}
          titleHeld={titleHeldForPreview}
        />
      ) : <OceanFloorScene config={oceanConfig} />}

      {activeScene === "campfire" && titlePreview ? (
        <CampsiteTitleIntro
          key={titlePreviewKey}
          previewMode
          onUnmute={() => setTitleHeldForPreview(false)}
          onEnter={() => setTitlePreview(false)}
          timing={{
            blackHoldDuration: campfireConfig.titleBlackHoldDuration,
            fadeInDuration: campfireConfig.titleFadeInDuration,
            exitSlideDuration: campfireConfig.titleExitSlideDuration,
            exitUnmountDelay: campfireConfig.titleExitUnmountDelay,
            exitSlideDistance: campfireConfig.titleExitSlideDistance,
            exitZDistance: campfireConfig.titleExitZDistance,
            idleAmount: campfireConfig.titleLetterIdleAmount,
            waviness: campfireConfig.titleLetterWaviness,
          }}
        />
      ) : null}

      {activeScene === "campfire" && (selectedObject || (deletedObjects.length > 0 && !deletedDismissed)) && (
        <div className="pointer-events-none absolute left-3 top-3 z-30 flex w-72 flex-col gap-2">
          {selectedObject && (() => {
            const isDuplicate = selectedObject.startsWith(DUPLICATE_PREFIX);
            const dup = isDuplicate ? campfireConfig.objectDuplicates?.[selectedObject] : undefined;
            const o = isDuplicate
              ? { ...(dup ?? { source: "", ...EMPTY_DUPLICATE }), hide: 0 }
              : (campfireConfig.objectOverrides?.[selectedObject] ?? { dx: 0, dy: 0, dz: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1, hide: 0 });
            const deleted = !isDuplicate && o.hide >= 0.5;
            const title = isDuplicate && dup ? `${selectedObject} · copy of ${dup.source}` : selectedObject;
            return (
              <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/70 p-3 text-xs text-white/90 shadow-2xl backdrop-blur-md">
                <div className="mb-2 flex items-center justify-between">
                  <div className="truncate font-semibold" title={title}>{title}</div>
                  <button
                    onClick={() => setSelectedObject(null)}
                    className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[0.62rem] hover:bg-white/20"
                  >
                    close
                  </button>
                </div>
                <div className="mb-3 rounded-xl border border-sky-300/20 bg-sky-400/10 p-2">
                  <div className="mb-2 flex gap-1">
                    <button
                      type="button"
                      onClick={() => setDragPlaneMode("xz")}
                      className={`flex-1 rounded-full border px-2 py-1 text-[0.62rem] font-semibold ${
                        dragPlaneMode === "xz"
                          ? "border-sky-200/70 bg-sky-200 text-black"
                          : "border-white/15 bg-white/10 text-white/75 hover:bg-white/15"
                      }`}
                    >
                      X/Z ground
                    </button>
                    <button
                      type="button"
                      onClick={() => setDragPlaneMode("xy")}
                      className={`flex-1 rounded-full border px-2 py-1 text-[0.62rem] font-semibold ${
                        dragPlaneMode === "xy"
                          ? "border-sky-200/70 bg-sky-200 text-black"
                          : "border-white/15 bg-white/10 text-white/75 hover:bg-white/15"
                      }`}
                    >
                      X/Y vertical
                    </button>
                  </div>
                  <p className="text-[0.62rem] leading-4 text-sky-100/75">
                    Drag the selected object itself. While this panel is open, scene orbit is locked. X/Z moves left-right + forward-back. X/Y moves left-right + up-down.
                  </p>
                </div>

                <div className="space-y-1.5">
                  {(() => {
                    // Rotate Y (heading) is applied on top of each object's own
                    // authored heading (tent has c.tentRotationY baked in, bears
                    // have placement.rotationY, etc.). Slider ±π gives one full
                    // revolution; the spin buttons wrap into that range so a
                    // click keeps working even after the slider hits its edge.
                    const wrap = (v: number) => {
                      const t = Math.PI * 2;
                      let x = ((v + Math.PI) % t + t) % t - Math.PI;
                      if (Object.is(x, -0)) x = 0;
                      return x;
                    };
                    const setRotY = (v: number) => isDuplicate
                      ? updateDuplicate(selectedObject, "rotY", wrap(v))
                      : updateOverride(selectedObject, "rotY", wrap(v));
                    const setField = (field: "dx" | "dy" | "dz" | "rotX" | "rotY" | "rotZ" | "scale", v: number) =>
                      isDuplicate ? updateDuplicate(selectedObject, field, v) : updateOverride(selectedObject, field, v);
                    return (
                      <>
                        <SliderRow label="Δ X" value={o.dx} min={-20} max={20} step={0.01} onChange={(v) => setField("dx", v)} />
                        <SliderRow label="Δ Y" value={o.dy} min={-10} max={10} step={0.01} onChange={(v) => setField("dy", v)} />
                        <SliderRow label="Δ Z" value={o.dz} min={-20} max={20} step={0.01} onChange={(v) => setField("dz", v)} />
                        <SliderRow label="Tilt fwd / back (world X)" value={o.rotX} min={-Math.PI} max={Math.PI} step={0.001} onChange={(v) => setField("rotX", v)} />
                        <SliderRow label="Rotate Y (heading)" value={o.rotY} min={-Math.PI} max={Math.PI} step={0.001} onChange={(v) => setRotY(v)} />
                        <div className="flex items-center gap-1 pt-0.5">
                          <span className="mr-1 text-[0.6rem] uppercase tracking-[0.14em] text-white/40">spin</span>
                          <button type="button" onClick={() => setRotY(o.rotY - Math.PI / 12)} className="flex-1 rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[0.62rem] hover:bg-white/20">← 15°</button>
                          <button type="button" onClick={() => setRotY(o.rotY - Math.PI / 4)} className="flex-1 rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[0.62rem] hover:bg-white/20">← 45°</button>
                          <button type="button" onClick={() => setRotY(o.rotY - Math.PI / 2)} className="flex-1 rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[0.62rem] hover:bg-white/20">← 90°</button>
                          <button type="button" onClick={() => setRotY(o.rotY + Math.PI / 2)} className="flex-1 rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[0.62rem] hover:bg-white/20">90° →</button>
                          <button type="button" onClick={() => setRotY(o.rotY + Math.PI / 4)} className="flex-1 rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[0.62rem] hover:bg-white/20">45° →</button>
                          <button type="button" onClick={() => setRotY(o.rotY + Math.PI / 12)} className="flex-1 rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[0.62rem] hover:bg-white/20">15° →</button>
                        </div>
                        <SliderRow label="Tilt left / right (world Z)" value={o.rotZ} min={-Math.PI} max={Math.PI} step={0.001} onChange={(v) => setField("rotZ", v)} />
                        <SliderRow label="Scale ×" value={o.scale} min={0.001} max={10} step={0.001} onChange={(v) => setField("scale", v)} />
                        {(() => {
                          // Duplicates and overrides both store noShadow; look
                          // up whichever bucket owns the current selection so
                          // toggling routes to the right updater.
                          const noShadowValue = isDuplicate
                            ? (campfireConfig.objectDuplicates?.[selectedObject]?.noShadow ?? 0)
                            : (campfireConfig.objectOverrides?.[selectedObject]?.noShadow ?? 0);
                          const setNoShadow = (v: number) => {
                            if (isDuplicate) updateDuplicate(selectedObject, "noShadow", v);
                            else updateOverride(selectedObject, "noShadow", v);
                          };
                          return (
                            <label className="flex cursor-pointer items-center gap-2 pt-1 text-[0.65rem] font-medium text-white/80 hover:text-white">
                              <input
                                type="checkbox"
                                checked={noShadowValue >= 0.5}
                                onChange={(e) => setNoShadow(e.target.checked ? 1 : 0)}
                                className="h-3 w-3 accent-sky-300"
                              />
                              <span className="text-white/85">Don&apos;t cast shadow</span>
                              <span className="ml-auto text-[0.58rem] uppercase tracking-[0.14em] text-white/40">
                                per-object
                              </span>
                            </label>
                          );
                        })()}
                      </>
                    );
                  })()}

                  <button
                    onClick={() => {
                      const id = duplicateObject(selectedObject);
                      if (id) setSelectedObject(id);
                    }}
                    className="mt-2 w-full rounded-full border border-sky-400/30 bg-sky-400/15 px-3 py-1.5 text-[0.65rem] font-semibold text-sky-100 hover:bg-sky-400/25"
                  >
                    Duplicate this object
                  </button>

                  {isDuplicate ? (
                    <button
                      onClick={() => { removeDuplicate(selectedObject); setSelectedObject(null); }}
                      className="w-full rounded-full border border-red-400/30 bg-red-400/15 px-3 py-1.5 text-[0.65rem] font-semibold text-red-200 hover:bg-red-400/25"
                    >
                      Delete this copy
                    </button>
                  ) : deleted ? (
                    <button
                      onClick={() => updateOverride(selectedObject, "hide", 0)}
                      className="w-full rounded-full border border-emerald-400/30 bg-emerald-400/15 px-3 py-1.5 text-[0.65rem] font-semibold text-emerald-200 hover:bg-emerald-400/25"
                    >
                      Restore to scene
                    </button>
                  ) : (
                    <button
                      onClick={() => deleteObject(selectedObject)}
                      className="w-full rounded-full border border-red-400/30 bg-red-400/15 px-3 py-1.5 text-[0.65rem] font-semibold text-red-200 hover:bg-red-400/25"
                    >
                      Delete from scene
                    </button>
                  )}
                  {!isDuplicate && (
                    <button
                      onClick={() => resetOverride(selectedObject)}
                      className="w-full rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[0.65rem] font-semibold hover:bg-white/20"
                    >
                      Reset this object
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {deletedObjects.length > 0 && !deletedDismissed && (
            deletedOpen ? (
              <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/70 p-3 text-xs text-white/90 shadow-2xl backdrop-blur-md">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setDeletedOpen(false)}
                    className="font-semibold text-white/70 hover:text-white"
                  >
                    Deleted <span className="text-white/40">({deletedObjects.length})</span>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => deletedObjects.forEach((n) => updateOverride(n, "hide", 0))}
                      className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[0.62rem] hover:bg-white/20"
                    >
                      restore all
                    </button>
                    <button
                      onClick={() => setDeletedDismissed(true)}
                      title="Dismiss. Reappears when you delete something new."
                      className="rounded-full border border-white/15 bg-white/10 px-1.5 py-0.5 text-[0.62rem] hover:bg-white/20"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto pr-0.5">
                  {deletedObjects.map((name) => (
                    <div key={name} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2 py-1">
                      <button
                        onClick={() => setSelectedObject(name)}
                        className="min-w-0 flex-1 truncate text-left text-[0.65rem] text-white/60 hover:text-white/90"
                        title={name}
                      >
                        {name}
                      </button>
                      <button
                        onClick={() => updateOverride(name, "hide", 0)}
                        className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[0.6rem] font-semibold text-emerald-200 hover:bg-emerald-400/20"
                      >
                        restore
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="pointer-events-auto flex items-center gap-1 self-start">
                <button
                  onClick={() => setDeletedOpen(true)}
                  className="rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[0.62rem] text-white/60 shadow-lg backdrop-blur-md hover:text-white/90"
                >
                  {deletedObjects.length} deleted
                </button>
                <button
                  onClick={() => setDeletedDismissed(true)}
                  title="Dismiss. Reappears when you delete something new."
                  className="rounded-full border border-white/10 bg-black/60 px-1.5 py-1 text-[0.62rem] text-white/40 shadow-lg backdrop-blur-md hover:text-white/80"
                >
                  ✕
                </button>
              </div>
            )
          )}
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-20 p-3 sm:p-4">
        <section className="pointer-events-auto inline-flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border border-white/10 bg-black/25 px-2.5 py-2 shadow-2xl shadow-black/35 backdrop-blur-md">
          <span className="hidden pl-2 text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-white/45 sm:inline">
            Scene Lab
          </span>
          <button
            type="button"
            aria-pressed
            className="rounded-full border border-white/85 bg-white px-3 py-1.5 text-xs font-semibold text-black sm:px-4"
          >
            Campfire
          </button>
          <a
            href="/scene-lab/cub-head"
            className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/15 sm:px-4"
          >
            Cub Head
          </a>
          <a
            href="/scene-lab/banjo-bear"
            className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/15 sm:px-4"
          >
            Banjo Bear
          </a>
          <a
            href="/scene-lab/bear-pose"
            className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/15 sm:px-4"
          >
            Bear Pose
          </a>
          <a
            href="/scene-lab/truck-editor"
            className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/15 sm:px-4"
          >
            Truck Editor
          </a>
          <span className="hidden border-l border-white/10 pl-3 pr-2 text-xs text-white/55 md:inline">
            {detail.eyebrow}
          </span>
        </section>

        {/* Stand on a location and see exactly what the site shows there, while orbit,
            picking and dragging all stay live. Orbiting saves that location's shot. */}
        {activeScene === "campfire" && (
          <section className="pointer-events-auto mt-2 flex w-fit max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-2.5 py-2 shadow-2xl shadow-black/35 backdrop-blur-md">
            <span className="hidden pl-1 pr-1 text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-white/45 sm:inline">
              View
            </span>
            <button
              type="button"
              aria-pressed={siteView === null && !titlePreview}
              onClick={() => { setSiteView(null); setTitlePreview(false); }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                siteView === null && !titlePreview
                  ? "border-white/85 bg-white text-black"
                  : "border-white/15 bg-white/10 text-white/80 hover:border-white/40 hover:bg-white/15"
              }`}
              title="Free camera — fly anywhere"
            >
              Free
            </button>
            {LOCATION_NAMES.map((label, i) => (
              <button
                key={label}
                type="button"
                aria-pressed={siteView === i && !titlePreview}
                onClick={() => { setSiteView(i); setTitlePreview(false); }}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  siteView === i && !titlePreview
                    ? "border-white/85 bg-white text-black"
                    : "border-white/15 bg-white/10 text-white/80 hover:border-white/40 hover:bg-white/15"
                }`}
                title={`Site camera for ${label} — drag to reframe, it saves to this location`}
              >
                {label}
              </button>
            ))}
            <span className="mx-1 hidden h-4 w-px bg-white/15 md:inline-block" />
            <button
              type="button"
              aria-pressed={titlePreview}
              onClick={startTitlePreview}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                titlePreview
                  ? "border-white/85 bg-white text-black"
                  : "border-white/15 bg-white/10 text-white/80 hover:border-white/40 hover:bg-white/15"
              }`}
              title="Play the title intro over the scene. Click again to replay it after tuning."
            >
              Title {titlePreview ? "▶ replay" : ""}
            </button>
            {siteView !== null && !titlePreview && (
              <span className="hidden pl-1 pr-1 text-[0.62rem] text-white/45 md:inline">
                drag to reframe · saves to {LOCATION_NAMES[siteView]}
              </span>
            )}
            {titlePreview && (
              <span className="hidden pl-1 pr-1 text-[0.62rem] text-white/45 md:inline">
                tune sliders → click Title to replay
              </span>
            )}
          </section>
        )}

        {/* Lighting — every light in the scene, in one panel, grouped by
            location. Sections are numbered to match the locations themselves:
            1 campfire, 2 arcade, 3 desk, plus Shared for anything global.
            Replaces the old split where the same slider existed in both this
            panel and the main one on the right (47 keys were duplicated), so
            each control now has exactly one home. */}
        {activeScene === "campfire" && (
          <section className="pointer-events-auto absolute left-3 top-44 flex max-h-[calc(100vh-12rem)] w-[min(21rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-amber-300/20 bg-black/30 p-3 shadow-2xl shadow-black/40 backdrop-blur-md sm:left-4 sm:top-32">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.24em] text-amber-200/70">Lighting</p>
                <p className="mt-0.5 text-xs text-white/70">Every light, grouped 1 / 2 / 3.</p>
              </div>
              <button
                type="button"
                onClick={() => setLightsOpen((open) => !open)}
                className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-100/80 hover:bg-amber-400/20"
              >
                {lightsOpen ? "Hide" : "Show"}
              </button>
            </div>
            {lightsOpen && (
              <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                <SearchContext.Provider value={searchQuery.trim()}>
                  <LocationScopeContext.Provider value={locationScopeFilter}>
                  <ControlGroup title="Shared · atmosphere">
                    <SliderRow label="Fog start" value={campfireConfig.fogNear} min={0.1} max={200} step={0.1} onChange={(value) => updateCampfire("fogNear", value)} />
                    <SliderRow label="Fog end" value={campfireConfig.fogFar} min={0.5} max={400} step={0.1} onChange={(value) => updateCampfire("fogFar", value)} />
                    <SliderRow label="Ambient fill" value={campfireConfig.ambientIntensity} min={0} max={10} step={0.01} onChange={(value) => updateCampfire("ambientIntensity", value)} />
                    <SliderRow label="Moon fill" value={campfireConfig.moonIntensity} min={0} max={20} step={0.01} onChange={(value) => updateCampfire("moonIntensity", value)} />
                    <SliderRow label="Ground glow height" value={campfireConfig.glowY} min={-5} max={10} step={0.01} onChange={(value) => updateCampfire("glowY", value)} />
                    <SliderRow label="Spark opacity" value={campfireConfig.sparkOpacity} min={0} max={5} step={0.01} onChange={(value) => updateCampfire("sparkOpacity", value)} />
                    <SliderRow label="Spark count" value={campfireConfig.sparkCount} min={0} max={1500} step={1} onChange={(value) => updateCampfire("sparkCount", value)} />
                    <SliderRow label="Spark spread (base radius)" value={campfireConfig.sparkSpread} min={0} max={5} step={0.02} onChange={(value) => updateCampfire("sparkSpread", value)} />
                    <SliderRow label="Spark max height" value={campfireConfig.sparkMaxHeight} min={0.2} max={20} step={0.05} onChange={(value) => updateCampfire("sparkMaxHeight", value)} />
                    <SliderRow label="Spark speed" value={campfireConfig.sparkSpeed} min={0.1} max={8} step={0.02} onChange={(value) => updateCampfire("sparkSpeed", value)} />
                    <SliderRow label="Spark sway (drift out)" value={campfireConfig.sparkSway} min={0} max={4} step={0.02} onChange={(value) => updateCampfire("sparkSway", value)} />
                    <SliderRow label="Spark burst chance" value={campfireConfig.sparkBurstChance} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("sparkBurstChance", value)} />
                    <SliderRow label="Spark size" value={campfireConfig.sparkSize} min={0.005} max={0.4} step={0.002} onChange={(value) => updateCampfire("sparkSize", value)} />
                    <SliderRow label="Spark lifetime (s)" value={campfireConfig.sparkLifetime} min={0.2} max={8} step={0.05} onChange={(value) => updateCampfire("sparkLifetime", value)} />
                                        <SliderRow label="Sky brightness" value={campfireConfig.skyBrightness} min={0} max={20} step={0.05} onChange={(value) => updateCampfire("skyBrightness", value)} />
                      <SliderRow label="Star brightness" value={campfireConfig.starBrightness} min={0} max={15} step={0.05} onChange={(value) => updateCampfire("starBrightness", value)} />
                      <SliderRow label="Star count" value={campfireConfig.starCount} min={0} max={3000} step={10} onChange={(value) => updateCampfire("starCount", value)} />
                      <SliderRow label="Moon X" value={campfireConfig.moonX} min={-30} max={30} step={0.1} onChange={(value) => updateCampfire("moonX", value)} />
                      <SliderRow label="Moon Y" value={campfireConfig.moonY} min={-10} max={30} step={0.1} onChange={(value) => updateCampfire("moonY", value)} />
                      <SliderRow label="Moon Z" value={campfireConfig.moonZ} min={-30} max={30} step={0.1} onChange={(value) => updateCampfire("moonZ", value)} />
                  </ControlGroup>

                  <ControlGroup title="Shared · shadows">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      Real-time shadows for the campsite. The moon
                      (directional light) is the cheap caster - one depth pass
                      per frame. The fire (point light) is expensive - six
                      cubemap renders per frame - so it&apos;s off by default.
                    </p>
                    <SliderRow label="Shadows enabled (0/1)" value={campfireConfig.shadowsEnabled} min={0} max={1} step={1} onChange={(value) => updateCampfire("shadowsEnabled", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Moon (directional)</div>
                    <p className="mb-1 text-[0.6rem] leading-relaxed text-white/40">
                      Moon position drives the direction of long shadows.
                      Raise Y for shorter shadows straight down; slide X/Z to
                      rake them across the ring.
                    </p>
                    <p className="mb-1 mt-1 text-[0.6rem] leading-relaxed text-white/40">
                      Map size: higher = sharper edges, quadratic memory cost.
                      512 for slow devices, 2048 default, 4096 for hero shots.
                    </p>
                    <p className="mb-1 mt-1 text-[0.6rem] leading-relaxed text-white/40">
                      Bias fights shadow acne (dark stripes on lit surfaces).
                      Normal bias is usually the better knob and rarely
                      causes peter-panning.
                    </p>
                    <p className="mb-1 mt-1 text-[0.6rem] leading-relaxed text-white/40">
                      Shadow darkness. 1 = fully black, 0 = invisible. Global
                      to this light - see the note below the panel for how
                      per-object control works.
                    </p>
                    <p className="mb-1 mt-1 text-[0.6rem] leading-relaxed text-white/40">
                      Frustum: half-width of the ortho box in world units.
                      Tight = higher effective resolution, but geometry
                      outside the box gets no shadow. Campsite is ~30u
                      across, so 15-25 is the sweet spot.
                    </p>
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Fire (point light)</div>
                    <p className="mb-1 text-[0.6rem] leading-relaxed text-white/40">
                      Turn on for hero close-ups where bears throw fire
                      shadows onto benches and the ground. Watch the FPS.
                    </p>
                    <SliderRow label="Fire casts shadow (0/1)" value={campfireConfig.fireCastShadow} min={0} max={1} step={1} onChange={(value) => updateCampfire("fireCastShadow", value)} />
                    <SliderRow label="Fire shadow map size" value={campfireConfig.fireShadowMapSize} min={64} max={2048} step={64} onChange={(value) => updateCampfire("fireShadowMapSize", value)} />
                    <SliderRow label="Fire bias" value={campfireConfig.fireShadowBias} min={-0.01} max={0.01} step={0.0002} onChange={(value) => updateCampfire("fireShadowBias", value)} />
                    <SliderRow label="Fire normal bias" value={campfireConfig.fireShadowNormalBias} min={0} max={0.3} step={0.005} onChange={(value) => updateCampfire("fireShadowNormalBias", value)} />
                    <SliderRow label="Fire shadow intensity" value={campfireConfig.fireShadowIntensity} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("fireShadowIntensity", value)} />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCampfireConfig((p) => normalizeCampfireConfig({ ...p,
                          fireCastShadow: 0, fireShadowMapSize: 512,
                          fireShadowBias: -0.002, fireShadowNormalBias: 0.03,
                        }))}
                        className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[0.62rem] font-medium text-white/85 hover:bg-white/20"
                      >Reset shadows</button>
                      <button
                        type="button"
                        onClick={() => setCampfireConfig((p) => normalizeCampfireConfig({ ...p,
                          fireCastShadow: 1, fireShadowMapSize: 1024,
                        }))}
                        className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[0.62rem] font-medium text-white/85 hover:bg-white/20"
                      >Hero</button>
                      <button
                        type="button"
                        onClick={() => setCampfireConfig((p) => normalizeCampfireConfig({ ...p,
                          fireCastShadow: 0,
                        }))}
                        className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[0.62rem] font-medium text-white/85 hover:bg-white/20"
                      >Perf</button>
                      <button
                        type="button"
                        onClick={() => setCampfireConfig((p) => normalizeCampfireConfig({ ...p, shadowsEnabled: 0 }))}
                        className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[0.62rem] font-medium text-white/85 hover:bg-white/20"
                      >Off</button>
                    </div>
                  </ControlGroup>

                  <ControlGroup title="1 · Campfire — fire light" scope="1">
                    <SliderRow label="Fire intensity" value={campfireConfig.fireIntensity} min={0} max={1000} step={0.1} onChange={(value) => updateCampfire("fireIntensity", value)} />
                    <SliderRow label="Flicker amount" value={campfireConfig.flickerAmount} min={0} max={20} step={0.05} onChange={(value) => updateCampfire("flickerAmount", value)} />
                    <SliderRow label="Fire X" value={campfireConfig.fireLightX} min={-30} max={30} step={0.05} onChange={(value) => updateCampfire("fireLightX", value)} />
                    <SliderRow label="Fire height" value={campfireConfig.fireLightY} min={-10} max={30} step={0.05} onChange={(value) => updateCampfire("fireLightY", value)} />
                    <SliderRow label="Fire distance" value={campfireConfig.fireLightZ} min={-30} max={30} step={0.05} onChange={(value) => updateCampfire("fireLightZ", value)} />
                    <SliderRow label="Fire reach" value={campfireConfig.fireLightReach} min={0} max={200} step={0.1} onChange={(value) => updateCampfire("fireLightReach", value)} />
                    <SliderRow label="Fire decay (near/far contrast)" value={campfireConfig.fireDecay} min={0.1} max={4} step={0.05} onChange={(value) => updateCampfire("fireDecay", value)} />
                    <SliderRow label="Far glow intensity" value={campfireConfig.farGlowIntensity} min={0} max={20} step={0.05} onChange={(value) => updateCampfire("farGlowIntensity", value)} />
                    <SliderRow label="Far glow reach" value={campfireConfig.farGlowReach} min={0} max={200} step={0.5} onChange={(value) => updateCampfire("farGlowReach", value)} />
                    <SliderRow label="Far glow decay" value={campfireConfig.farGlowDecay} min={0.1} max={3} step={0.05} onChange={(value) => updateCampfire("farGlowDecay", value)} />
                    <SliderRow label="Shadow light X" value={campfireConfig.warmLightX} min={-30} max={30} step={0.05} onChange={(value) => updateCampfire("warmLightX", value)} />
                    <SliderRow label="Shadow height" value={campfireConfig.warmLightY} min={-10} max={30} step={0.05} onChange={(value) => updateCampfire("warmLightY", value)} />
                    <SliderRow label="Shadow distance" value={campfireConfig.warmLightZ} min={-30} max={30} step={0.05} onChange={(value) => updateCampfire("warmLightZ", value)} />
                    <SliderRow label="Shadow reach" value={campfireConfig.warmLightReach} min={0} max={200} step={0.1} onChange={(value) => updateCampfire("warmLightReach", value)} />
                    <SliderRow label="Shadow angle" value={campfireConfig.warmLightAngle} min={0.01} max={Math.PI / 2} step={0.01} onChange={(value) => updateCampfire("warmLightAngle", value)} />
                  </ControlGroup>

                  <ControlGroup title="1 · Campfire — ground glow" scope="1">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      The pool of firelight on the dirt. Width and length are
                      separate, so it can be stretched along the camp instead of
                      staying circular. Falloff is edge softness - higher pulls
                      it into a tighter hot core. Flicker and breathe are
                      multipliers; 0 holds it perfectly still.
                    </p>
                    <SliderRow label="Glow R" value={campfireConfig.glowColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("glowColorR", value)} />
                    <SliderRow label="Glow G" value={campfireConfig.glowColorG} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("glowColorG", value)} />
                    <SliderRow label="Glow B" value={campfireConfig.glowColorB} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("glowColorB", value)} />
                    <SliderRow label="Glow width (across)" value={campfireConfig.glowWidth} min={0.2} max={30} step={0.1} onChange={(value) => updateCampfire("glowWidth", value)} />
                    <SliderRow label="Glow length (along)" value={campfireConfig.glowLength} min={0.2} max={30} step={0.1} onChange={(value) => updateCampfire("glowLength", value)} />
                    <SliderRow label="Glow spin" value={campfireConfig.glowRotY} min={-3.15} max={3.15} step={0.01} onChange={(value) => updateCampfire("glowRotY", value)} />
                    <SliderRow label="Edge falloff (high = tighter)" value={campfireConfig.glowFalloff} min={0.3} max={6} step={0.05} onChange={(value) => updateCampfire("glowFalloff", value)} />
                    <SliderRow label="Glow flicker" value={campfireConfig.glowFlicker} min={0} max={3} step={0.05} onChange={(value) => updateCampfire("glowFlicker", value)} />
                    <SliderRow label="Glow breathe" value={campfireConfig.glowBreathe} min={0} max={3} step={0.05} onChange={(value) => updateCampfire("glowBreathe", value)} />
                    <SliderRow label="Glow offset X" value={campfireConfig.glowOffsetX} min={-6} max={6} step={0.01} onChange={(value) => updateCampfire("glowOffsetX", value)} />
                    <SliderRow label="Glow offset Z" value={campfireConfig.glowOffsetZ} min={-6} max={6} step={0.01} onChange={(value) => updateCampfire("glowOffsetZ", value)} />
                    <SliderRow label="Ground glow" value={campfireConfig.glowOpacity} min={0} max={5} step={0.01} onChange={(value) => updateCampfire("glowOpacity", value)} />
                    <SliderRow label="Ground glow size" value={campfireConfig.glowScale} min={0.1} max={5} step={0.02} onChange={(value) => updateCampfire("glowScale", value)} />
                  </ControlGroup>

                  <ControlGroup title="1 · Campfire — flame" scope="1">
                    <SliderRow label="Flame X" value={campfireConfig.flameX} min={-10} max={10} step={0.02} onChange={(value) => updateCampfire("flameX", value)} />
                    <SliderRow label="Flame height" value={campfireConfig.flameY} min={-5} max={10} step={0.02} onChange={(value) => updateCampfire("flameY", value)} />
                    <SliderRow label="Flame distance" value={campfireConfig.flameZ} min={-10} max={10} step={0.02} onChange={(value) => updateCampfire("flameZ", value)} />
                    <SliderRow label="Flame scale" value={campfireConfig.flameScale} min={0.05} max={5} step={0.01} onChange={(value) => updateCampfire("flameScale", value)} />
                    <div className="mt-1 text-[0.6rem] text-white/40">Per-layer size (stacked on top of Flame scale):</div>
                    <SliderRow label="Outer flame" value={campfireConfig.flameOuterScale} min={0} max={3} step={0.02} onChange={(value) => updateCampfire("flameOuterScale", value)} />
                    <SliderRow label="Inner flame" value={campfireConfig.flameInnerScale} min={0} max={3} step={0.02} onChange={(value) => updateCampfire("flameInnerScale", value)} />
                    <SliderRow label="Halo core" value={campfireConfig.flameHaloScale} min={0} max={3} step={0.02} onChange={(value) => updateCampfire("flameHaloScale", value)} />
                    <div className="mt-1 text-[0.6rem] text-white/40">Ground ring (also in Fire light group):</div>
                  </ControlGroup>

                    <ControlGroup title="1 · Campfire — laptop screen" scope="1">
                      <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                        Kenney laptop near the fire. Brightness scales both the
                        screen&apos;s emissive tint and the point light that
                        spills onto the ground in front of it.
                      </p>
                      <SliderRow label="Brightness" value={campfireConfig.laptopScreenBrightness} min={0} max={5} step={0.02} onChange={(value) => updateCampfire("laptopScreenBrightness", value)} />
                      <SliderRow label="Color R" value={campfireConfig.laptopScreenColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("laptopScreenColorR", value)} />
                      <SliderRow label="Color G" value={campfireConfig.laptopScreenColorG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("laptopScreenColorG", value)} />
                      <SliderRow label="Color B" value={campfireConfig.laptopScreenColorB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("laptopScreenColorB", value)} />
                    </ControlGroup>

                    <ControlGroup title="1 · Campfire — camping lamps" scope="1">
                      <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                        Applies to every emissive lamp in the old-bear camping
                        diorama (string-lights, lantern bulbs, etc). One knob
                        per property, applied uniformly to all lamps.
                      </p>
                      <SliderRow label="Intensity" value={campfireConfig.campingLampIntensity} min={0} max={30} step={0.05} onChange={(value) => updateCampfire("campingLampIntensity", value)} />
                      <SliderRow label="Reach" value={campfireConfig.campingLampDistance} min={0} max={60} step={0.1} onChange={(value) => updateCampfire("campingLampDistance", value)} />
                      <SliderRow label="Decay" value={campfireConfig.campingLampDecay} min={0.1} max={4} step={0.05} onChange={(value) => updateCampfire("campingLampDecay", value)} />
                      <SliderRow label="Color R" value={campfireConfig.campingLampColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("campingLampColorR", value)} />
                      <SliderRow label="Color G" value={campfireConfig.campingLampColorG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("campingLampColorG", value)} />
                      <SliderRow label="Color B" value={campfireConfig.campingLampColorB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("campingLampColorB", value)} />
                    </ControlGroup>

                  <ControlGroup title="2 · Arcade — fire & screens" scope="2">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      Second campfire in the arcade sector. Placement is
                      shared with the main-fire Group above; every visual
                      knob below is INDEPENDENT of the primary campfire.
                    </p>
                    <SliderRow label="Fire X" value={campfireConfig.arcadeCampfireX} min={-10} max={10} step={0.05} onChange={(value) => updateCampfire("arcadeCampfireX", value)} />
                    <SliderRow label="Fire Y" value={campfireConfig.arcadeCampfireY} min={-5} max={5} step={0.02} onChange={(value) => updateCampfire("arcadeCampfireY", value)} />
                    <SliderRow label="Fire Z" value={campfireConfig.arcadeCampfireZ} min={-10} max={10} step={0.05} onChange={(value) => updateCampfire("arcadeCampfireZ", value)} />
                    <SliderRow label="Fire rotate" value={campfireConfig.arcadeCampfireRotationY} min={-3.14} max={3.14} step={0.01} onChange={(value) => updateCampfire("arcadeCampfireRotationY", value)} />
                    <SliderRow label="Fire scale" value={campfireConfig.arcadeCampfireScale} min={0.1} max={5} step={0.02} onChange={(value) => updateCampfire("arcadeCampfireScale", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Fire light (arcade only)</div>
                    <SliderRow label="Intensity" value={campfireConfig.arcadeFireIntensity} min={0} max={1000} step={0.1} onChange={(value) => updateCampfire("arcadeFireIntensity", value)} />
                    <SliderRow label="Flicker" value={campfireConfig.arcadeFlickerAmount} min={0} max={20} step={0.05} onChange={(value) => updateCampfire("arcadeFlickerAmount", value)} />
                    <SliderRow label="Light X" value={campfireConfig.arcadeFireLightX} min={-10} max={10} step={0.02} onChange={(value) => updateCampfire("arcadeFireLightX", value)} />
                    <SliderRow label="Light Y" value={campfireConfig.arcadeFireLightY} min={-5} max={10} step={0.02} onChange={(value) => updateCampfire("arcadeFireLightY", value)} />
                    <SliderRow label="Light Z" value={campfireConfig.arcadeFireLightZ} min={-10} max={10} step={0.02} onChange={(value) => updateCampfire("arcadeFireLightZ", value)} />
                    <SliderRow label="Reach" value={campfireConfig.arcadeFireLightReach} min={0} max={200} step={0.1} onChange={(value) => updateCampfire("arcadeFireLightReach", value)} />
                    <SliderRow label="Decay" value={campfireConfig.arcadeFireDecay} min={0.1} max={4} step={0.05} onChange={(value) => updateCampfire("arcadeFireDecay", value)} />
                    <SliderRow label="Light R" value={campfireConfig.arcadeFireLightColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("arcadeFireLightColorR", value)} />
                    <SliderRow label="Light G" value={campfireConfig.arcadeFireLightColorG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("arcadeFireLightColorG", value)} />
                    <SliderRow label="Light B" value={campfireConfig.arcadeFireLightColorB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("arcadeFireLightColorB", value)} />
                    <SliderRow label="Far glow intensity" value={campfireConfig.arcadeFarGlowIntensity} min={0} max={20} step={0.05} onChange={(value) => updateCampfire("arcadeFarGlowIntensity", value)} />
                    <SliderRow label="Far glow reach" value={campfireConfig.arcadeFarGlowReach} min={0} max={200} step={0.5} onChange={(value) => updateCampfire("arcadeFarGlowReach", value)} />
                    <SliderRow label="Far glow decay" value={campfireConfig.arcadeFarGlowDecay} min={0.1} max={3} step={0.05} onChange={(value) => updateCampfire("arcadeFarGlowDecay", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Flame overlay (arcade only)</div>
                    <SliderRow label="Flame X" value={campfireConfig.arcadeFlameX} min={-5} max={5} step={0.01} onChange={(value) => updateCampfire("arcadeFlameX", value)} />
                    <SliderRow label="Flame Y" value={campfireConfig.arcadeFlameY} min={-2} max={5} step={0.01} onChange={(value) => updateCampfire("arcadeFlameY", value)} />
                    <SliderRow label="Flame Z" value={campfireConfig.arcadeFlameZ} min={-5} max={5} step={0.01} onChange={(value) => updateCampfire("arcadeFlameZ", value)} />
                    <SliderRow label="Flame scale" value={campfireConfig.arcadeFlameScale} min={0.05} max={5} step={0.01} onChange={(value) => updateCampfire("arcadeFlameScale", value)} />
                    <SliderRow label="Outer × " value={campfireConfig.arcadeFlameOuterScale} min={0.05} max={5} step={0.01} onChange={(value) => updateCampfire("arcadeFlameOuterScale", value)} />
                    <SliderRow label="Inner × " value={campfireConfig.arcadeFlameInnerScale} min={0.05} max={5} step={0.01} onChange={(value) => updateCampfire("arcadeFlameInnerScale", value)} />
                    <SliderRow label="Halo × " value={campfireConfig.arcadeFlameHaloScale} min={0.05} max={5} step={0.01} onChange={(value) => updateCampfire("arcadeFlameHaloScale", value)} />
                    <SliderRow label="Glow opacity" value={campfireConfig.arcadeGlowOpacity} min={0} max={5} step={0.01} onChange={(value) => updateCampfire("arcadeGlowOpacity", value)} />
                    <SliderRow label="Glow Y" value={campfireConfig.arcadeGlowY} min={-1} max={2} step={0.005} onChange={(value) => updateCampfire("arcadeGlowY", value)} />
                    <SliderRow label="Glow scale" value={campfireConfig.arcadeGlowScale} min={0.05} max={5} step={0.01} onChange={(value) => updateCampfire("arcadeGlowScale", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Sparks (arcade only)</div>
                    <SliderRow label="Opacity" value={campfireConfig.arcadeSparkOpacity} min={0} max={5} step={0.02} onChange={(value) => updateCampfire("arcadeSparkOpacity", value)} />
                    <SliderRow label="Count" value={campfireConfig.arcadeSparkCount} min={0} max={800} step={1} onChange={(value) => updateCampfire("arcadeSparkCount", value)} />
                    <SliderRow label="Spread" value={campfireConfig.arcadeSparkSpread} min={0} max={4} step={0.01} onChange={(value) => updateCampfire("arcadeSparkSpread", value)} />
                    <SliderRow label="Max height" value={campfireConfig.arcadeSparkMaxHeight} min={0} max={10} step={0.05} onChange={(value) => updateCampfire("arcadeSparkMaxHeight", value)} />
                    <SliderRow label="Speed" value={campfireConfig.arcadeSparkSpeed} min={0} max={5} step={0.02} onChange={(value) => updateCampfire("arcadeSparkSpeed", value)} />
                    <SliderRow label="Sway" value={campfireConfig.arcadeSparkSway} min={0} max={3} step={0.01} onChange={(value) => updateCampfire("arcadeSparkSway", value)} />
                    <SliderRow label="Burst chance" value={campfireConfig.arcadeSparkBurstChance} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("arcadeSparkBurstChance", value)} />
                    <SliderRow label="Spark size" value={campfireConfig.arcadeSparkSize} min={0} max={0.4} step={0.001} onChange={(value) => updateCampfire("arcadeSparkSize", value)} />
                    <SliderRow label="Spark lifetime" value={campfireConfig.arcadeSparkLifetime} min={0.1} max={6} step={0.05} onChange={(value) => updateCampfire("arcadeSparkLifetime", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Arcade TVs</div>
                    <SliderRow label="CRT glow (all 4)" value={campfireConfig.arcadeCrtGlow} min={0} max={5} step={0.02} onChange={(value) => updateCampfire("arcadeCrtGlow", value)} />
                    <SliderRow label="Spot intensity ×" value={campfireConfig.arcadeCrtLightIntensity} min={0} max={5} step={0.02} onChange={(value) => updateCampfire("arcadeCrtLightIntensity", value)} />
                    <SliderRow label="Spot cone angle" value={campfireConfig.arcadeCrtLightAngle} min={0.05} max={Math.PI / 2} step={0.01} onChange={(value) => updateCampfire("arcadeCrtLightAngle", value)} />
                    <SliderRow label="Spot penumbra" value={campfireConfig.arcadeCrtLightPenumbra} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("arcadeCrtLightPenumbra", value)} />
                    <SliderRow label="Spot distance" value={campfireConfig.arcadeCrtLightDistance} min={0.1} max={20} step={0.1} onChange={(value) => updateCampfire("arcadeCrtLightDistance", value)} />
                    <SliderRow label="Spot decay" value={campfireConfig.arcadeCrtLightDecay} min={0} max={4} step={0.05} onChange={(value) => updateCampfire("arcadeCrtLightDecay", value)} />
                    <SliderRow label="Spot forward offset" value={campfireConfig.arcadeCrtLightForwardOffset} min={-0.5} max={2} step={0.01} onChange={(value) => updateCampfire("arcadeCrtLightForwardOffset", value)} />
                    <SliderRow label="Spot offset X" value={campfireConfig.arcadeCrtLightOffsetX} min={-1} max={1} step={0.01} onChange={(value) => updateCampfire("arcadeCrtLightOffsetX", value)} />
                    <SliderRow label="Spot offset Y" value={campfireConfig.arcadeCrtLightOffsetY} min={-1} max={1} step={0.01} onChange={(value) => updateCampfire("arcadeCrtLightOffsetY", value)} />
                  </ControlGroup>

                  <ControlGroup title="2 · Arcade — cabin lamp" scope="2">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      The lantern on the wooden cabin. X/Y/Z are in the cabin
                      model&apos;s own space (it spans ~140 units before the
                      0.1 base scale), so they move in big steps; reach and
                      decay are in world units.
                    </p>
                    <SliderRow label="Lamp X (model space)" value={campfireConfig.arcadeCabinLampX} min={-140} max={140} step={0.25} onChange={(value) => updateCampfire("arcadeCabinLampX", value)} />
                    <SliderRow label="Lamp Y (model space)" value={campfireConfig.arcadeCabinLampY} min={-140} max={140} step={0.25} onChange={(value) => updateCampfire("arcadeCabinLampY", value)} />
                    <SliderRow label="Lamp Z (model space)" value={campfireConfig.arcadeCabinLampZ} min={-140} max={140} step={0.25} onChange={(value) => updateCampfire("arcadeCabinLampZ", value)} />
                    <SliderRow label="Lamp intensity" value={campfireConfig.arcadeCabinLampIntensity} min={0} max={20} step={0.05} onChange={(value) => updateCampfire("arcadeCabinLampIntensity", value)} />
                    <SliderRow label="Lamp reach (world)" value={campfireConfig.arcadeCabinLampDistance} min={0} max={15} step={0.05} onChange={(value) => updateCampfire("arcadeCabinLampDistance", value)} />
                    <SliderRow label="Lamp decay" value={campfireConfig.arcadeCabinLampDecay} min={0} max={4} step={0.05} onChange={(value) => updateCampfire("arcadeCabinLampDecay", value)} />
                    <SliderRow label="Lamp R" value={campfireConfig.arcadeCabinLampColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("arcadeCabinLampColorR", value)} />
                    <SliderRow label="Lamp G" value={campfireConfig.arcadeCabinLampColorG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("arcadeCabinLampColorG", value)} />
                    <SliderRow label="Lamp B" value={campfireConfig.arcadeCabinLampColorB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("arcadeCabinLampColorB", value)} />
                    <SliderRow label="Lantern glass brightness" value={campfireConfig.arcadeCabinLampEmissive} min={0} max={12} step={0.1} onChange={(value) => updateCampfire("arcadeCabinLampEmissive", value)} />
                  </ControlGroup>
                  <ControlGroup title="2 · Arcade — lanterns" scope="2">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      The two hanging lanterns, moved over from the desk
                      scene. Keys are still named deskLantern* - the objects
                      changed scene, the config names did not.
                    </p>
                    <SliderRow label="Lantern intensity" value={campfireConfig.deskLanternIntensity} min={0} max={20} step={0.05} onChange={(value) => updateCampfire("deskLanternIntensity", value)} />
                    <SliderRow label="Lantern distance" value={campfireConfig.deskLanternDistance} min={0} max={30} step={0.05} onChange={(value) => updateCampfire("deskLanternDistance", value)} />
                    <SliderRow label="Lantern R" value={campfireConfig.deskLanternColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLanternColorR", value)} />
                    <SliderRow label="Lantern G" value={campfireConfig.deskLanternColorG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLanternColorG", value)} />
                    <SliderRow label="Lantern B" value={campfireConfig.deskLanternColorB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLanternColorB", value)} />
                    <SliderRow label="Light X" value={campfireConfig.deskLanternLightX} min={-0.5} max={0.5} step={0.005} onChange={(value) => updateCampfire("deskLanternLightX", value)} />
                    <SliderRow label="Light Y" value={campfireConfig.deskLanternLightY} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("deskLanternLightY", value)} />
                    <SliderRow label="Light Z" value={campfireConfig.deskLanternLightZ} min={-0.5} max={0.5} step={0.005} onChange={(value) => updateCampfire("deskLanternLightZ", value)} />
                    <SliderRow label="Flame X" value={campfireConfig.deskLanternFlameX} min={-0.3} max={0.3} step={0.005} onChange={(value) => updateCampfire("deskLanternFlameX", value)} />
                    <SliderRow label="Flame Y" value={campfireConfig.deskLanternFlameY} min={0} max={0.8} step={0.005} onChange={(value) => updateCampfire("deskLanternFlameY", value)} />
                    <SliderRow label="Flame Z" value={campfireConfig.deskLanternFlameZ} min={-0.3} max={0.3} step={0.005} onChange={(value) => updateCampfire("deskLanternFlameZ", value)} />
                    <SliderRow label="Flame scale" value={campfireConfig.deskLanternFlameScale} min={0.1} max={4} step={0.01} onChange={(value) => updateCampfire("deskLanternFlameScale", value)} />
                    <SliderRow label="Flame speed" value={campfireConfig.deskLanternFlameSpeed} min={0.1} max={4} step={0.05} onChange={(value) => updateCampfire("deskLanternFlameSpeed", value)} />
                    <SliderRow label="Flame sway" value={campfireConfig.deskLanternFlameSway} min={0} max={0.4} step={0.005} onChange={(value) => updateCampfire("deskLanternFlameSway", value)} />
                    <SliderRow label="Flame pulse" value={campfireConfig.deskLanternFlamePulse} min={0} max={3} step={0.05} onChange={(value) => updateCampfire("deskLanternFlamePulse", value)} />
                    <SliderRow label="Flame brightness" value={campfireConfig.deskLanternFlameBrightness} min={0.2} max={4} step={0.05} onChange={(value) => updateCampfire("deskLanternFlameBrightness", value)} />
                    <SliderRow label="Flame R" value={campfireConfig.deskLanternFlameColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLanternFlameColorR", value)} />
                    <SliderRow label="Flame G" value={campfireConfig.deskLanternFlameColorG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLanternFlameColorG", value)} />
                    <SliderRow label="Flame B" value={campfireConfig.deskLanternFlameColorB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLanternFlameColorB", value)} />
                  </ControlGroup>


                  <ControlGroup title="2 · Arcade — ground glow" scope="2">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      Same controls for the arcade campfire&apos;s ground pool.
                    </p>
                    <SliderRow label="Glow R" value={campfireConfig.arcadeGlowColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("arcadeGlowColorR", value)} />
                    <SliderRow label="Glow G" value={campfireConfig.arcadeGlowColorG} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("arcadeGlowColorG", value)} />
                    <SliderRow label="Glow B" value={campfireConfig.arcadeGlowColorB} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("arcadeGlowColorB", value)} />
                    <SliderRow label="Glow width (across)" value={campfireConfig.arcadeGlowWidth} min={0.2} max={30} step={0.1} onChange={(value) => updateCampfire("arcadeGlowWidth", value)} />
                    <SliderRow label="Glow length (along)" value={campfireConfig.arcadeGlowLength} min={0.2} max={30} step={0.1} onChange={(value) => updateCampfire("arcadeGlowLength", value)} />
                    <SliderRow label="Glow spin" value={campfireConfig.arcadeGlowRotY} min={-3.15} max={3.15} step={0.01} onChange={(value) => updateCampfire("arcadeGlowRotY", value)} />
                    <SliderRow label="Edge falloff (high = tighter)" value={campfireConfig.arcadeGlowFalloff} min={0.3} max={6} step={0.05} onChange={(value) => updateCampfire("arcadeGlowFalloff", value)} />
                    <SliderRow label="Glow flicker" value={campfireConfig.arcadeGlowFlicker} min={0} max={3} step={0.05} onChange={(value) => updateCampfire("arcadeGlowFlicker", value)} />
                    <SliderRow label="Glow breathe" value={campfireConfig.arcadeGlowBreathe} min={0} max={3} step={0.05} onChange={(value) => updateCampfire("arcadeGlowBreathe", value)} />
                    <SliderRow label="Glow offset X" value={campfireConfig.arcadeGlowOffsetX} min={-6} max={6} step={0.01} onChange={(value) => updateCampfire("arcadeGlowOffsetX", value)} />
                    <SliderRow label="Glow offset Z" value={campfireConfig.arcadeGlowOffsetZ} min={-6} max={6} step={0.01} onChange={(value) => updateCampfire("arcadeGlowOffsetZ", value)} />
                  </ControlGroup>

                  <ControlGroup title="2 · Arcade — truck lights" scope="2">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      The actual lights. Head aim X/Y/Z is an OFFSET from each
                      headlight&apos;s own position, so leaving X and Y at 0 keeps
                      the two beams parallel instead of splayed. Colours are
                      linear, like the fire-light sliders.
                    </p>
                    <SliderRow label="Head light X" value={campfireConfig.truckHeadLightX} min={0} max={1.5} step={0.005} onChange={(value) => updateCampfire("truckHeadLightX", value)} />
                    <SliderRow label="Head light Y" value={campfireConfig.truckHeadLightY} min={0} max={2.5} step={0.005} onChange={(value) => updateCampfire("truckHeadLightY", value)} />
                    <SliderRow label="Head light Z" value={campfireConfig.truckHeadLightZ} min={-3.5} max={3.5} step={0.005} onChange={(value) => updateCampfire("truckHeadLightZ", value)} />
                    <SliderRow label="Head aim X (offset)" value={campfireConfig.truckHeadLightAimX} min={-6} max={6} step={0.01} onChange={(value) => updateCampfire("truckHeadLightAimX", value)} />
                    <SliderRow label="Head aim Y (offset)" value={campfireConfig.truckHeadLightAimY} min={-6} max={6} step={0.01} onChange={(value) => updateCampfire("truckHeadLightAimY", value)} />
                    <SliderRow label="Head aim Z (offset)" value={campfireConfig.truckHeadLightAimZ} min={-12} max={12} step={0.05} onChange={(value) => updateCampfire("truckHeadLightAimZ", value)} />
                    <SliderRow label="Head intensity" value={campfireConfig.truckHeadLightIntensity} min={0} max={30} step={0.1} onChange={(value) => updateCampfire("truckHeadLightIntensity", value)} />
                    <SliderRow label="Head reach" value={campfireConfig.truckHeadLightDistance} min={0} max={40} step={0.1} onChange={(value) => updateCampfire("truckHeadLightDistance", value)} />
                    <SliderRow label="Head decay" value={campfireConfig.truckHeadLightDecay} min={0} max={4} step={0.05} onChange={(value) => updateCampfire("truckHeadLightDecay", value)} />
                    <SliderRow label="Head cone angle" value={campfireConfig.truckHeadLightAngle} min={0.05} max={1.5} step={0.01} onChange={(value) => updateCampfire("truckHeadLightAngle", value)} />
                    <SliderRow label="Head cone softness" value={campfireConfig.truckHeadLightPenumbra} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("truckHeadLightPenumbra", value)} />
                    <SliderRow label="Head light R" value={campfireConfig.truckHeadLightColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("truckHeadLightColorR", value)} />
                    <SliderRow label="Head light G" value={campfireConfig.truckHeadLightColorG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("truckHeadLightColorG", value)} />
                    <SliderRow label="Head light B" value={campfireConfig.truckHeadLightColorB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("truckHeadLightColorB", value)} />
                    <SliderRow label="Head flicker" value={campfireConfig.truckHeadLightFlicker} min={0} max={3} step={0.05} onChange={(value) => updateCampfire("truckHeadLightFlicker", value)} />
                    <SliderRow label="Tail light X" value={campfireConfig.truckTailLightX} min={-1.5} max={1.5} step={0.005} onChange={(value) => updateCampfire("truckTailLightX", value)} />
                    <SliderRow label="Tail light Y" value={campfireConfig.truckTailLightY} min={0} max={2.5} step={0.005} onChange={(value) => updateCampfire("truckTailLightY", value)} />
                    <SliderRow label="Tail light Z" value={campfireConfig.truckTailLightZ} min={-3.5} max={3.5} step={0.005} onChange={(value) => updateCampfire("truckTailLightZ", value)} />
                    <SliderRow label="Tail intensity" value={campfireConfig.truckTailLightIntensity} min={0} max={20} step={0.1} onChange={(value) => updateCampfire("truckTailLightIntensity", value)} />
                    <SliderRow label="Tail reach" value={campfireConfig.truckTailLightDistance} min={0} max={20} step={0.1} onChange={(value) => updateCampfire("truckTailLightDistance", value)} />
                    <SliderRow label="Tail decay" value={campfireConfig.truckTailLightDecay} min={0} max={4} step={0.05} onChange={(value) => updateCampfire("truckTailLightDecay", value)} />
                    <SliderRow label="Tail light R" value={campfireConfig.truckTailLightColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("truckTailLightColorR", value)} />
                    <SliderRow label="Tail light G" value={campfireConfig.truckTailLightColorG} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("truckTailLightColorG", value)} />
                    <SliderRow label="Tail light B" value={campfireConfig.truckTailLightColorB} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("truckTailLightColorB", value)} />
                  </ControlGroup>
                  <ControlGroup title="2 · Arcade — truck headlight lens" scope="2">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      The lens is built at runtime, so its SHAPE is live here.
                      Roundness 0 = hard rectangle, 1 = full stadium oval.
                      Sideways/Height/Along-truck place it; stand-off is how far
                      the lens sits proud of its bezel.
                    </p>
                    <SliderRow label="Lens width" value={campfireConfig.truckHeadLampW} min={0.02} max={0.8} step={0.005} onChange={(value) => updateCampfire("truckHeadLampW", value)} />
                    <SliderRow label="Lens height" value={campfireConfig.truckHeadLampH} min={0.02} max={0.8} step={0.005} onChange={(value) => updateCampfire("truckHeadLampH", value)} />
                    <SliderRow label="Roundness (1 = oval)" value={campfireConfig.truckHeadLampRadius} min={0.0} max={1.0} step={0.01} onChange={(value) => updateCampfire("truckHeadLampRadius", value)} />
                    <SliderRow label="Lens depth" value={campfireConfig.truckHeadLampDepth} min={0.005} max={0.3} step={0.005} onChange={(value) => updateCampfire("truckHeadLampDepth", value)} />
                    <SliderRow label="Sideways (|X| from centre)" value={campfireConfig.truckHeadLampSpanX} min={0.0} max={1.2} step={0.005} onChange={(value) => updateCampfire("truckHeadLampSpanX", value)} />
                    <SliderRow label="Height (Y)" value={campfireConfig.truckHeadLampY} min={0.0} max={2.0} step={0.005} onChange={(value) => updateCampfire("truckHeadLampY", value)} />
                    <SliderRow label="Along truck (Z)" value={campfireConfig.truckHeadLampZ} min={-3.2} max={3.2} step={0.005} onChange={(value) => updateCampfire("truckHeadLampZ", value)} />
                    <SliderRow label="Tilt X" value={campfireConfig.truckHeadLampRotX} min={-1.6} max={1.6} step={0.005} onChange={(value) => updateCampfire("truckHeadLampRotX", value)} />
                    <SliderRow label="Tilt Y" value={campfireConfig.truckHeadLampRotY} min={-1.6} max={1.6} step={0.005} onChange={(value) => updateCampfire("truckHeadLampRotY", value)} />
                    <SliderRow label="Spin Z" value={campfireConfig.truckHeadLampRotZ} min={-3.15} max={3.15} step={0.005} onChange={(value) => updateCampfire("truckHeadLampRotZ", value)} />
                    <SliderRow label="Bezel thickness" value={campfireConfig.truckHeadLampBezelPad} min={0.0} max={0.12} step={0.002} onChange={(value) => updateCampfire("truckHeadLampBezelPad", value)} />
                    <SliderRow label="Bezel depth" value={campfireConfig.truckHeadLampBezelDepth} min={0.005} max={0.2} step={0.005} onChange={(value) => updateCampfire("truckHeadLampBezelDepth", value)} />
                    <SliderRow label="Lens stand-off" value={campfireConfig.truckHeadLampProud} min={-0.05} max={0.08} step={0.002} onChange={(value) => updateCampfire("truckHeadLampProud", value)} />
                    <SliderRow label="Lens R" value={campfireConfig.truckHeadLampColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("truckHeadLampColorR", value)} />
                    <SliderRow label="Lens G" value={campfireConfig.truckHeadLampColorG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("truckHeadLampColorG", value)} />
                    <SliderRow label="Lens B" value={campfireConfig.truckHeadLampColorB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("truckHeadLampColorB", value)} />
                    <SliderRow label="Lens brightness" value={campfireConfig.truckHeadLampEmissive} min={0} max={12} step={0.1} onChange={(value) => updateCampfire("truckHeadLampEmissive", value)} />
                    <SliderRow label="Hidden (1=off)" value={campfireConfig.truckHeadLampHide} min={0} max={1} step={1} onChange={(value) => updateCampfire("truckHeadLampHide", value)} />
                  </ControlGroup>

                  <ControlGroup title="2 · Arcade — truck taillight lens" scope="2">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      Same controls as the headlight lens. Roundness defaults to
                      1 here, which gives the oval LED look.
                    </p>
                    <SliderRow label="Lens width" value={campfireConfig.truckTailLampW} min={0.02} max={0.8} step={0.005} onChange={(value) => updateCampfire("truckTailLampW", value)} />
                    <SliderRow label="Lens height" value={campfireConfig.truckTailLampH} min={0.02} max={0.8} step={0.005} onChange={(value) => updateCampfire("truckTailLampH", value)} />
                    <SliderRow label="Roundness (1 = oval)" value={campfireConfig.truckTailLampRadius} min={0.0} max={1.0} step={0.01} onChange={(value) => updateCampfire("truckTailLampRadius", value)} />
                    <SliderRow label="Lens depth" value={campfireConfig.truckTailLampDepth} min={0.005} max={0.3} step={0.005} onChange={(value) => updateCampfire("truckTailLampDepth", value)} />
                    <SliderRow label="Sideways (|X| from centre)" value={campfireConfig.truckTailLampSpanX} min={0.0} max={1.2} step={0.005} onChange={(value) => updateCampfire("truckTailLampSpanX", value)} />
                    <SliderRow label="Height (Y)" value={campfireConfig.truckTailLampY} min={0.0} max={2.0} step={0.005} onChange={(value) => updateCampfire("truckTailLampY", value)} />
                    <SliderRow label="Along truck (Z)" value={campfireConfig.truckTailLampZ} min={-3.2} max={3.2} step={0.005} onChange={(value) => updateCampfire("truckTailLampZ", value)} />
                    <SliderRow label="Tilt X" value={campfireConfig.truckTailLampRotX} min={-1.6} max={1.6} step={0.005} onChange={(value) => updateCampfire("truckTailLampRotX", value)} />
                    <SliderRow label="Tilt Y" value={campfireConfig.truckTailLampRotY} min={-1.6} max={1.6} step={0.005} onChange={(value) => updateCampfire("truckTailLampRotY", value)} />
                    <SliderRow label="Spin Z" value={campfireConfig.truckTailLampRotZ} min={-3.15} max={3.15} step={0.005} onChange={(value) => updateCampfire("truckTailLampRotZ", value)} />
                    <SliderRow label="Bezel thickness" value={campfireConfig.truckTailLampBezelPad} min={0.0} max={0.12} step={0.002} onChange={(value) => updateCampfire("truckTailLampBezelPad", value)} />
                    <SliderRow label="Bezel depth" value={campfireConfig.truckTailLampBezelDepth} min={0.005} max={0.2} step={0.005} onChange={(value) => updateCampfire("truckTailLampBezelDepth", value)} />
                    <SliderRow label="Lens stand-off" value={campfireConfig.truckTailLampProud} min={-0.05} max={0.08} step={0.002} onChange={(value) => updateCampfire("truckTailLampProud", value)} />
                    <SliderRow label="Lens R" value={campfireConfig.truckTailLampColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("truckTailLampColorR", value)} />
                    <SliderRow label="Lens G" value={campfireConfig.truckTailLampColorG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("truckTailLampColorG", value)} />
                    <SliderRow label="Lens B" value={campfireConfig.truckTailLampColorB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("truckTailLampColorB", value)} />
                    <SliderRow label="Lens brightness" value={campfireConfig.truckTailLampEmissive} min={0} max={12} step={0.1} onChange={(value) => updateCampfire("truckTailLampEmissive", value)} />
                    <SliderRow label="Hidden (1=off)" value={campfireConfig.truckTailLampHide} min={0} max={1} step={1} onChange={(value) => updateCampfire("truckTailLampHide", value)} />
                  </ControlGroup>

                  <ControlGroup title="3 · Desk — campfire" scope="3">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      The diorama&apos;s own fire (a flat orange blob on a log,
                      ringed by 15 stones) was deleted from camping.glb. This
                      is the same procedural fire scenes 1 and 2 run - flame
                      cones, ground glow, sparks and two point lights - with
                      the rocks-and-logs pile cloned out of campfire_scene.glb.
                      Every knob is independent of the other two fires, because
                      the camping diorama is authored much larger than them.
                    </p>
                    <SliderRow label="Fire X" value={campfireConfig.deskCampfireX} min={-20} max={20} step={0.05} onChange={(value) => updateCampfire("deskCampfireX", value)} />
                    <SliderRow label="Fire Y" value={campfireConfig.deskCampfireY} min={-5} max={10} step={0.02} onChange={(value) => updateCampfire("deskCampfireY", value)} />
                    <SliderRow label="Fire Z" value={campfireConfig.deskCampfireZ} min={-20} max={20} step={0.05} onChange={(value) => updateCampfire("deskCampfireZ", value)} />
                    <SliderRow label="Fire rotate" value={campfireConfig.deskCampfireRotationY} min={-3.14} max={3.14} step={0.01} onChange={(value) => updateCampfire("deskCampfireRotationY", value)} />
                    <SliderRow label="Fire scale" value={campfireConfig.deskCampfireScale} min={0.1} max={5} step={0.02} onChange={(value) => updateCampfire("deskCampfireScale", value)} />
                    <SliderRow label="Show log pile (0/1)" value={campfireConfig.deskCampfirePileVisible} min={0} max={1} step={1} onChange={(value) => updateCampfire("deskCampfirePileVisible", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Fire light (desk only)</div>
                    <SliderRow label="Intensity" value={campfireConfig.deskFireIntensity} min={0} max={1000} step={0.1} onChange={(value) => updateCampfire("deskFireIntensity", value)} />
                    <SliderRow label="Flicker" value={campfireConfig.deskFlickerAmount} min={0} max={20} step={0.05} onChange={(value) => updateCampfire("deskFlickerAmount", value)} />
                    <SliderRow label="Light X" value={campfireConfig.deskFireLightX} min={-10} max={10} step={0.02} onChange={(value) => updateCampfire("deskFireLightX", value)} />
                    <SliderRow label="Light Y" value={campfireConfig.deskFireLightY} min={-5} max={10} step={0.02} onChange={(value) => updateCampfire("deskFireLightY", value)} />
                    <SliderRow label="Light Z" value={campfireConfig.deskFireLightZ} min={-10} max={10} step={0.02} onChange={(value) => updateCampfire("deskFireLightZ", value)} />
                    <SliderRow label="Reach" value={campfireConfig.deskFireLightReach} min={0} max={200} step={0.1} onChange={(value) => updateCampfire("deskFireLightReach", value)} />
                    <SliderRow label="Decay" value={campfireConfig.deskFireDecay} min={0.1} max={4} step={0.05} onChange={(value) => updateCampfire("deskFireDecay", value)} />
                    <SliderRow label="Light R" value={campfireConfig.deskFireLightColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskFireLightColorR", value)} />
                    <SliderRow label="Light G" value={campfireConfig.deskFireLightColorG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskFireLightColorG", value)} />
                    <SliderRow label="Light B" value={campfireConfig.deskFireLightColorB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskFireLightColorB", value)} />
                    <SliderRow label="Far glow intensity" value={campfireConfig.deskFarGlowIntensity} min={0} max={20} step={0.05} onChange={(value) => updateCampfire("deskFarGlowIntensity", value)} />
                    <SliderRow label="Far glow reach" value={campfireConfig.deskFarGlowReach} min={0} max={200} step={0.5} onChange={(value) => updateCampfire("deskFarGlowReach", value)} />
                    <SliderRow label="Far glow decay" value={campfireConfig.deskFarGlowDecay} min={0.1} max={3} step={0.05} onChange={(value) => updateCampfire("deskFarGlowDecay", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Flame cones (desk only)</div>
                    <SliderRow label="Flame X" value={campfireConfig.deskFlameX} min={-5} max={5} step={0.01} onChange={(value) => updateCampfire("deskFlameX", value)} />
                    <SliderRow label="Flame Y" value={campfireConfig.deskFlameY} min={-2} max={5} step={0.01} onChange={(value) => updateCampfire("deskFlameY", value)} />
                    <SliderRow label="Flame Z" value={campfireConfig.deskFlameZ} min={-5} max={5} step={0.01} onChange={(value) => updateCampfire("deskFlameZ", value)} />
                    <SliderRow label="Flame scale" value={campfireConfig.deskFlameScale} min={0.1} max={5} step={0.02} onChange={(value) => updateCampfire("deskFlameScale", value)} />
                    <SliderRow label="Outer cone" value={campfireConfig.deskFlameOuterScale} min={0.1} max={3} step={0.02} onChange={(value) => updateCampfire("deskFlameOuterScale", value)} />
                    <SliderRow label="Inner cone" value={campfireConfig.deskFlameInnerScale} min={0.1} max={3} step={0.02} onChange={(value) => updateCampfire("deskFlameInnerScale", value)} />
                    <SliderRow label="Halo" value={campfireConfig.deskFlameHaloScale} min={0.1} max={3} step={0.02} onChange={(value) => updateCampfire("deskFlameHaloScale", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Ground glow (desk only)</div>
                    <SliderRow label="Glow opacity" value={campfireConfig.deskGlowOpacity} min={0} max={2} step={0.01} onChange={(value) => updateCampfire("deskGlowOpacity", value)} />
                    <SliderRow label="Glow height" value={campfireConfig.deskGlowY} min={-1} max={2} step={0.005} onChange={(value) => updateCampfire("deskGlowY", value)} />
                    <SliderRow label="Glow scale" value={campfireConfig.deskGlowScale} min={0.1} max={5} step={0.02} onChange={(value) => updateCampfire("deskGlowScale", value)} />
                    <SliderRow label="Glow R" value={campfireConfig.deskGlowColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskGlowColorR", value)} />
                    <SliderRow label="Glow G" value={campfireConfig.deskGlowColorG} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("deskGlowColorG", value)} />
                    <SliderRow label="Glow B" value={campfireConfig.deskGlowColorB} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("deskGlowColorB", value)} />
                    <SliderRow label="Glow width (across)" value={campfireConfig.deskGlowWidth} min={0.2} max={30} step={0.1} onChange={(value) => updateCampfire("deskGlowWidth", value)} />
                    <SliderRow label="Glow length (along)" value={campfireConfig.deskGlowLength} min={0.2} max={30} step={0.1} onChange={(value) => updateCampfire("deskGlowLength", value)} />
                    <SliderRow label="Glow spin" value={campfireConfig.deskGlowRotY} min={-3.15} max={3.15} step={0.01} onChange={(value) => updateCampfire("deskGlowRotY", value)} />
                    <SliderRow label="Edge falloff (high = tighter)" value={campfireConfig.deskGlowFalloff} min={0.3} max={6} step={0.05} onChange={(value) => updateCampfire("deskGlowFalloff", value)} />
                    <SliderRow label="Glow flicker" value={campfireConfig.deskGlowFlicker} min={0} max={3} step={0.05} onChange={(value) => updateCampfire("deskGlowFlicker", value)} />
                    <SliderRow label="Glow breathe" value={campfireConfig.deskGlowBreathe} min={0} max={3} step={0.05} onChange={(value) => updateCampfire("deskGlowBreathe", value)} />
                    <SliderRow label="Glow offset X" value={campfireConfig.deskGlowOffsetX} min={-6} max={6} step={0.01} onChange={(value) => updateCampfire("deskGlowOffsetX", value)} />
                    <SliderRow label="Glow offset Z" value={campfireConfig.deskGlowOffsetZ} min={-6} max={6} step={0.01} onChange={(value) => updateCampfire("deskGlowOffsetZ", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Sparks (desk only)</div>
                    <SliderRow label="Spark opacity" value={campfireConfig.deskSparkOpacity} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskSparkOpacity", value)} />
                    <SliderRow label="Spark count" value={campfireConfig.deskSparkCount} min={0} max={600} step={1} onChange={(value) => updateCampfire("deskSparkCount", value)} />
                    <SliderRow label="Spark spread" value={campfireConfig.deskSparkSpread} min={0} max={4} step={0.01} onChange={(value) => updateCampfire("deskSparkSpread", value)} />
                    <SliderRow label="Spark max height" value={campfireConfig.deskSparkMaxHeight} min={0.2} max={12} step={0.05} onChange={(value) => updateCampfire("deskSparkMaxHeight", value)} />
                    <SliderRow label="Spark speed" value={campfireConfig.deskSparkSpeed} min={0.1} max={8} step={0.05} onChange={(value) => updateCampfire("deskSparkSpeed", value)} />
                    <SliderRow label="Spark sway" value={campfireConfig.deskSparkSway} min={0} max={3} step={0.01} onChange={(value) => updateCampfire("deskSparkSway", value)} />
                    <SliderRow label="Spark burst chance" value={campfireConfig.deskSparkBurstChance} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskSparkBurstChance", value)} />
                    <SliderRow label="Spark size" value={campfireConfig.deskSparkSize} min={0.005} max={0.4} step={0.005} onChange={(value) => updateCampfire("deskSparkSize", value)} />
                    <SliderRow label="Spark lifetime" value={campfireConfig.deskSparkLifetime} min={0.2} max={8} step={0.05} onChange={(value) => updateCampfire("deskSparkLifetime", value)} />
                  </ControlGroup>


                  <ControlGroup title="3 · Desk — string-light bar" scope="3">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      One rectangular area light over the run of 26 bulbs, which
                      stay emissive-only. Defaults are fitted to the bulbs
                      themselves: their centroid, their top at y 4.05, and the
                      44.9° axis through them. Position and rotation are in camp
                      units and follow the diorama; <em>width and height are world
                      units</em> — three normalises the parent scale out of a rect
                      light. Leave the bar shown while you place it.
                    </p>
                    <SliderRow label="On (0/1)" value={campfireConfig.deskStringLightOn} min={0} max={1} step={1} onChange={(value) => updateCampfire("deskStringLightOn", value)} />
                    <SliderRow label="Show the bar (0/1)" value={campfireConfig.deskStringLightShow} min={0} max={1} step={1} onChange={(value) => updateCampfire("deskStringLightShow", value)} />
                    <SliderRow label="Intensity" value={campfireConfig.deskStringLightIntensity} min={0} max={60} step={0.1} onChange={(value) => updateCampfire("deskStringLightIntensity", value)} />
                    <SliderRow label="Length (world units)" value={campfireConfig.deskStringLightWidth} min={0.05} max={12} step={0.01} onChange={(value) => updateCampfire("deskStringLightWidth", value)} />
                    <SliderRow label="Thickness (world units)" value={campfireConfig.deskStringLightHeight} min={0.01} max={3} step={0.005} onChange={(value) => updateCampfire("deskStringLightHeight", value)} />
                    <SliderRow label="X (camp units)" value={campfireConfig.deskStringLightX} min={-20} max={20} step={0.01} onChange={(value) => updateCampfire("deskStringLightX", value)} />
                    <SliderRow label="Height Y (camp units)" value={campfireConfig.deskStringLightY} min={0} max={12} step={0.01} onChange={(value) => updateCampfire("deskStringLightY", value)} />
                    <SliderRow label="Z (camp units)" value={campfireConfig.deskStringLightZ} min={-20} max={20} step={0.01} onChange={(value) => updateCampfire("deskStringLightZ", value)} />
                    <SliderRow label="Tilt X (-1.57 = face down)" value={campfireConfig.deskStringLightRotX} min={-3.15} max={3.15} step={0.005} onChange={(value) => updateCampfire("deskStringLightRotX", value)} />
                    <SliderRow label="Heading Y" value={campfireConfig.deskStringLightRotY} min={-3.15} max={3.15} step={0.005} onChange={(value) => updateCampfire("deskStringLightRotY", value)} />
                    <SliderRow label="Roll Z" value={campfireConfig.deskStringLightRotZ} min={-3.15} max={3.15} step={0.005} onChange={(value) => updateCampfire("deskStringLightRotZ", value)} />
                    <SliderRow label="R" value={campfireConfig.deskStringLightColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskStringLightColorR", value)} />
                    <SliderRow label="G" value={campfireConfig.deskStringLightColorG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskStringLightColorG", value)} />
                    <SliderRow label="B" value={campfireConfig.deskStringLightColorB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskStringLightColorB", value)} />
                  </ControlGroup>

                  <ControlGroup title="3 · Desk — camp lamps" scope="3">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      One block per fixture - five real lamps, each with its own
                      switch, brightness, reach, falloff and colour. The 26 string
                      bulbs stay emissive-only on purpose: a point light each was
                      measured at about 4x the fragment cost.
                    </p>
                    <SliderRow label="ALL camp lamps on (0/1)" value={campfireConfig.deskCampLampEnabled} min={0} max={1} step={1} onChange={(value) => updateCampfire("deskCampLampEnabled", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Camper van headlights (both)</div>
                    <SliderRow label="On (0/1)" value={campfireConfig.deskLampVanHeadsOn} min={0} max={1} step={1} onChange={(value) => updateCampfire("deskLampVanHeadsOn", value)} />
                    <SliderRow label="Intensity" value={campfireConfig.deskLampVanHeadsIntensity} min={0} max={20} step={0.05} onChange={(value) => updateCampfire("deskLampVanHeadsIntensity", value)} />
                    <SliderRow label="Reach" value={campfireConfig.deskLampVanHeadsReach} min={0} max={20} step={0.1} onChange={(value) => updateCampfire("deskLampVanHeadsReach", value)} />
                    <SliderRow label="Decay" value={campfireConfig.deskLampVanHeadsDecay} min={0} max={4} step={0.05} onChange={(value) => updateCampfire("deskLampVanHeadsDecay", value)} />
                    <SliderRow label="R" value={campfireConfig.deskLampVanHeadsR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLampVanHeadsR", value)} />
                    <SliderRow label="G" value={campfireConfig.deskLampVanHeadsG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLampVanHeadsG", value)} />
                    <SliderRow label="B" value={campfireConfig.deskLampVanHeadsB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLampVanHeadsB", value)} />
                    <SliderRow label="Glow on the lamp itself" value={campfireConfig.deskLampVanHeadsEmissive} min={0} max={12} step={0.05} onChange={(value) => updateCampfire("deskLampVanHeadsEmissive", value)} />
                    <SliderRow label="Move X" value={campfireConfig.deskLampVanHeadsOffX} min={-8} max={8} step={0.01} onChange={(value) => updateCampfire("deskLampVanHeadsOffX", value)} />
                    <SliderRow label="Move Y" value={campfireConfig.deskLampVanHeadsOffY} min={-4} max={4} step={0.01} onChange={(value) => updateCampfire("deskLampVanHeadsOffY", value)} />
                    <SliderRow label="Move Z" value={campfireConfig.deskLampVanHeadsOffZ} min={-8} max={8} step={0.01} onChange={(value) => updateCampfire("deskLampVanHeadsOffZ", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Small lamp · near the fire pit</div>
                    <SliderRow label="On (0/1)" value={campfireConfig.deskLampSmallAOn} min={0} max={1} step={1} onChange={(value) => updateCampfire("deskLampSmallAOn", value)} />
                    <SliderRow label="Intensity" value={campfireConfig.deskLampSmallAIntensity} min={0} max={20} step={0.05} onChange={(value) => updateCampfire("deskLampSmallAIntensity", value)} />
                    <SliderRow label="Reach" value={campfireConfig.deskLampSmallAReach} min={0} max={20} step={0.1} onChange={(value) => updateCampfire("deskLampSmallAReach", value)} />
                    <SliderRow label="Decay" value={campfireConfig.deskLampSmallADecay} min={0} max={4} step={0.05} onChange={(value) => updateCampfire("deskLampSmallADecay", value)} />
                    <SliderRow label="R" value={campfireConfig.deskLampSmallAR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLampSmallAR", value)} />
                    <SliderRow label="G" value={campfireConfig.deskLampSmallAG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLampSmallAG", value)} />
                    <SliderRow label="B" value={campfireConfig.deskLampSmallAB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLampSmallAB", value)} />
                    <SliderRow label="Glow on the lamp itself" value={campfireConfig.deskLampSmallAEmissive} min={0} max={12} step={0.05} onChange={(value) => updateCampfire("deskLampSmallAEmissive", value)} />
                    <SliderRow label="Move X" value={campfireConfig.deskLampSmallAOffX} min={-8} max={8} step={0.01} onChange={(value) => updateCampfire("deskLampSmallAOffX", value)} />
                    <SliderRow label="Move Y" value={campfireConfig.deskLampSmallAOffY} min={-4} max={4} step={0.01} onChange={(value) => updateCampfire("deskLampSmallAOffY", value)} />
                    <SliderRow label="Move Z" value={campfireConfig.deskLampSmallAOffZ} min={-8} max={8} step={0.01} onChange={(value) => updateCampfire("deskLampSmallAOffZ", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Lantern · on the dock</div>
                    <SliderRow label="On (0/1)" value={campfireConfig.deskLampSmallBOn} min={0} max={1} step={1} onChange={(value) => updateCampfire("deskLampSmallBOn", value)} />
                    <SliderRow label="Intensity" value={campfireConfig.deskLampSmallBIntensity} min={0} max={20} step={0.05} onChange={(value) => updateCampfire("deskLampSmallBIntensity", value)} />
                    <SliderRow label="Reach" value={campfireConfig.deskLampSmallBReach} min={0} max={20} step={0.1} onChange={(value) => updateCampfire("deskLampSmallBReach", value)} />
                    <SliderRow label="Decay" value={campfireConfig.deskLampSmallBDecay} min={0} max={4} step={0.05} onChange={(value) => updateCampfire("deskLampSmallBDecay", value)} />
                    <SliderRow label="R" value={campfireConfig.deskLampSmallBR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLampSmallBR", value)} />
                    <SliderRow label="G" value={campfireConfig.deskLampSmallBG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLampSmallBG", value)} />
                    <SliderRow label="B" value={campfireConfig.deskLampSmallBB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLampSmallBB", value)} />
                    <SliderRow label="Glow on the lamp itself" value={campfireConfig.deskLampSmallBEmissive} min={0} max={12} step={0.05} onChange={(value) => updateCampfire("deskLampSmallBEmissive", value)} />
                    <SliderRow label="Move X" value={campfireConfig.deskLampSmallBOffX} min={-8} max={8} step={0.01} onChange={(value) => updateCampfire("deskLampSmallBOffX", value)} />
                    <SliderRow label="Move Y" value={campfireConfig.deskLampSmallBOffY} min={-4} max={4} step={0.01} onChange={(value) => updateCampfire("deskLampSmallBOffY", value)} />
                    <SliderRow label="Move Z" value={campfireConfig.deskLampSmallBOffZ} min={-8} max={8} step={0.01} onChange={(value) => updateCampfire("deskLampSmallBOffZ", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Hooded lantern · on the signpost</div>
                    <SliderRow label="On (0/1)" value={campfireConfig.deskLampHoodOn} min={0} max={1} step={1} onChange={(value) => updateCampfire("deskLampHoodOn", value)} />
                    <SliderRow label="Intensity" value={campfireConfig.deskLampHoodIntensity} min={0} max={20} step={0.05} onChange={(value) => updateCampfire("deskLampHoodIntensity", value)} />
                    <SliderRow label="Reach" value={campfireConfig.deskLampHoodReach} min={0} max={20} step={0.1} onChange={(value) => updateCampfire("deskLampHoodReach", value)} />
                    <SliderRow label="Decay" value={campfireConfig.deskLampHoodDecay} min={0} max={4} step={0.05} onChange={(value) => updateCampfire("deskLampHoodDecay", value)} />
                    <SliderRow label="R" value={campfireConfig.deskLampHoodR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLampHoodR", value)} />
                    <SliderRow label="G" value={campfireConfig.deskLampHoodG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLampHoodG", value)} />
                    <SliderRow label="B" value={campfireConfig.deskLampHoodB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskLampHoodB", value)} />
                    <SliderRow label="Glow on the lamp itself" value={campfireConfig.deskLampHoodEmissive} min={0} max={12} step={0.05} onChange={(value) => updateCampfire("deskLampHoodEmissive", value)} />
                    <SliderRow label="Move X" value={campfireConfig.deskLampHoodOffX} min={-8} max={8} step={0.01} onChange={(value) => updateCampfire("deskLampHoodOffX", value)} />
                    <SliderRow label="Move Y" value={campfireConfig.deskLampHoodOffY} min={-4} max={4} step={0.01} onChange={(value) => updateCampfire("deskLampHoodOffY", value)} />
                    <SliderRow label="Move Z" value={campfireConfig.deskLampHoodOffZ} min={-8} max={8} step={0.01} onChange={(value) => updateCampfire("deskLampHoodOffZ", value)} />
                  </ControlGroup>

                  <ControlGroup title="3 · Desk — lights" scope="3">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      Light sources attached to the two lanterns and the
                      computer on the desk scene. Each moves with its prop.
                    </p>
                    <div className="text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Lanterns</div>
                    <div className="mt-1 text-[0.6rem] text-white/40">Line the point-light up with the candle wick:</div>
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Computer screen</div>
                    <SliderRow label="Computer intensity" value={campfireConfig.deskComputerIntensity} min={0} max={20} step={0.05} onChange={(value) => updateCampfire("deskComputerIntensity", value)} />
                    <SliderRow label="Computer distance" value={campfireConfig.deskComputerDistance} min={0} max={30} step={0.05} onChange={(value) => updateCampfire("deskComputerDistance", value)} />
                    <SliderRow label="Computer R" value={campfireConfig.deskComputerColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskComputerColorR", value)} />
                    <SliderRow label="Computer G" value={campfireConfig.deskComputerColorG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskComputerColorG", value)} />
                    <SliderRow label="Computer B" value={campfireConfig.deskComputerColorB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskComputerColorB", value)} />
                    <div className="mt-1 text-[0.6rem] text-white/40">Nudge onto the actual monitor face:</div>
                    <SliderRow label="Screen light X" value={campfireConfig.deskComputerLightX} min={-1} max={1} step={0.01} onChange={(value) => updateCampfire("deskComputerLightX", value)} />
                    <SliderRow label="Screen light Y" value={campfireConfig.deskComputerLightY} min={-1} max={2} step={0.01} onChange={(value) => updateCampfire("deskComputerLightY", value)} />
                    <SliderRow label="Screen light Z" value={campfireConfig.deskComputerLightZ} min={-1} max={1} step={0.01} onChange={(value) => updateCampfire("deskComputerLightZ", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Warm ambient fill</div>
                    <p className="mb-1 text-[0.6rem] leading-relaxed text-white/40">
                      HemisphereLight scoped to the desk scene - sky color is
                      the warm cast, kept dim so it never washes the lanterns.
                    </p>
                    <SliderRow label="Ambient intensity" value={campfireConfig.deskAmbientIntensity} min={0} max={5} step={0.01} onChange={(value) => updateCampfire("deskAmbientIntensity", value)} />
                    <SliderRow label="Ambient R" value={campfireConfig.deskAmbientColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskAmbientColorR", value)} />
                    <SliderRow label="Ambient G" value={campfireConfig.deskAmbientColorG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskAmbientColorG", value)} />
                    <SliderRow label="Ambient B" value={campfireConfig.deskAmbientColorB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskAmbientColorB", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Candle flame (inside lantern)</div>
                    <p className="mb-1 text-[0.6rem] leading-relaxed text-white/40">
                      Flame color follows the lantern R/G/B above; these knobs
                      place the flame on the actual wick and set its size.
                    </p>
                    <div className="mt-1 text-[0.6rem] text-white/40">Motion & brightness:</div>
                    <div className="mt-1 text-[0.6rem] text-white/40">Flame color (independent of lantern R/G/B):</div>
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Caravan windows</div>
                    <p className="mb-1 text-[0.6rem] leading-relaxed text-white/40">
                      Emissive on the two caravan side windows plus the warm
                      point-light behind them that spills onto the ground.
                      Color is shared between both so a tinted pane also
                      tints the ground glow.
                    </p>
                    <SliderRow label="Window brightness" value={campfireConfig.deskCaravanWindowIntensity} min={0} max={10} step={0.05} onChange={(value) => updateCampfire("deskCaravanWindowIntensity", value)} />
                    <SliderRow label="Window R" value={campfireConfig.deskCaravanWindowColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskCaravanWindowColorR", value)} />
                    <SliderRow label="Window G" value={campfireConfig.deskCaravanWindowColorG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskCaravanWindowColorG", value)} />
                    <SliderRow label="Window B" value={campfireConfig.deskCaravanWindowColorB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskCaravanWindowColorB", value)} />
                    <div className="mt-1 text-[0.6rem] text-white/40">Interior point-light (caravan-local, before parent scale):</div>
                    <SliderRow label="Light intensity" value={campfireConfig.deskCaravanWindowLightIntensity} min={0} max={40} step={0.1} onChange={(value) => updateCampfire("deskCaravanWindowLightIntensity", value)} />
                    <SliderRow label="Light distance" value={campfireConfig.deskCaravanWindowLightDistance} min={0} max={300} step={1} onChange={(value) => updateCampfire("deskCaravanWindowLightDistance", value)} />
                    <SliderRow label="Light decay" value={campfireConfig.deskCaravanWindowLightDecay} min={0} max={4} step={0.05} onChange={(value) => updateCampfire("deskCaravanWindowLightDecay", value)} />
                    <SliderRow label="Light X" value={campfireConfig.deskCaravanWindowLightX} min={-60} max={60} step={0.5} onChange={(value) => updateCampfire("deskCaravanWindowLightX", value)} />
                    <SliderRow label="Light Y" value={campfireConfig.deskCaravanWindowLightY} min={0} max={80} step={0.5} onChange={(value) => updateCampfire("deskCaravanWindowLightY", value)} />
                    <SliderRow label="Light Z" value={campfireConfig.deskCaravanWindowLightZ} min={-60} max={60} step={0.5} onChange={(value) => updateCampfire("deskCaravanWindowLightZ", value)} />
                  </ControlGroup>
                  </LocationScopeContext.Provider>
                </SearchContext.Provider>
              </div>
            )}
          </section>
        )}

        <section className="pointer-events-auto absolute right-3 top-16 flex max-h-[calc(100vh-5rem)] w-[min(21rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/30 p-3 shadow-2xl shadow-black/40 backdrop-blur-md sm:right-4 sm:top-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.24em] text-white/45">Controls</p>
              <p className="mt-0.5 text-xs text-white/70">{detail.description}</p>
            </div>
            <button
              type="button"
              onClick={() => setControlsOpen((open) => !open)}
              className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/75 hover:bg-white/15"
            >
              {controlsOpen ? "Hide" : "Tune"}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={saveConfig}
              className="flex-1 rounded-full border border-emerald-300/30 bg-emerald-400/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/25"
            >
              Save config
            </button>
            <button
              type="button"
              onClick={() => {
                setSceneKey((n) => n + 1);
                showSaveMessage("Scene refreshed");
              }}
              className="rounded-full border border-sky-300/30 bg-sky-400/15 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-400/25"
              title="Force remount the 3D scene without reloading the page"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={clearSavedConfig}
              className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/15"
            >
              Clear
            </button>
          </div>

          {activeScene === "campfire" && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={saveToProject}
                disabled={savingToProject}
                className="flex-1 rounded-full border border-violet-300/30 bg-violet-400/20 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-400/30 disabled:opacity-50"
                title="Write this config into src/config/campfireScene.json so it is committed and actually ships. Save config only stores it in this browser."
              >
                {savingToProject ? "Saving…" : "Save to project"}
              </button>
              <button
                type="button"
                onClick={resetSliders}
                className="rounded-full border border-amber-300/30 bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/25"
                title="Every slider back to its built-in default. Props you have moved, scaled, tilted or deleted are kept exactly as they are."
              >
                Reset sliders
              </button>
            </div>
          )}

          {/* Ambient-fill quick knob. The go-to for "can't see anything", so it
              lives outside the collapsible controls and stays reachable even
              when the tune panel is hidden. Ambient rather than the moon: it
              lifts the whole scene evenly regardless of where the moon happens
              to be pointing. Same state as Lighting -> Shared · atmosphere ->
              Ambient fill, so moving one moves the other. */}
          {activeScene === "campfire" && (
            <label className="mt-3 block rounded-2xl border border-amber-300/20 bg-amber-400/5 px-3 py-2">
              <span className="mb-1 flex items-center justify-between gap-3 text-[0.62rem] uppercase tracking-[0.18em] text-amber-100/80">
                <span>Ambient fill</span>
                <span className="font-mono text-amber-50">{formatValue(campfireConfig.ambientIntensity)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={10}
                step={0.01}
                value={campfireConfig.ambientIntensity}
                onChange={(event) => updateCampfire("ambientIntensity", Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-amber-200"
              />
            </label>
          )}
          {saveMessage && <p className="mt-2 text-xs font-medium text-emerald-100/85">{saveMessage}</p>}

          {controlsOpen && (
            <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sliders…"
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
              />
              <SearchContext.Provider value={searchQuery.trim()}>
              {activeScene === "campfire" ? (
                <>
                  <SectionJumpBar
                    titles={[
                      "Camera",
                      "Title fly-in",
                      "Locations",
                      "Atmosphere",
                      "Shadows",
                      "Ground",
                      "Fire light",
                      "Desk lights",
                      "Campfire scene GLB",
                      "Flame overlay",
                      "Benches",
                      "Trees",
                      "Bonfire",
                      "Tent",
                      "Camp items",
                      "Animals",
                      "Flopping fish",
                      "Truck tailgate offset (arcade)",
                      "Truck bed wall extension (arcade)",
                      "Banjo (held by back-left bear)",
                      "Sound",
                    ]}
                  />
                  {/* Scope filter: treat each of the three sites (Campfire /
                      Arcade / Desk) as its own "scene" in the sidebar. Shared
                      groups (Camera, Locations, Atmosphere, Ground, Sound)
                      stay visible in every filter. */}
                  <div className="mb-2 flex flex-wrap items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.035] px-2 py-1.5">
                    <span className="mr-1 text-[0.6rem] uppercase tracking-[0.22em] text-white/50">Scene</span>
                    {([
                      { key: null, label: "All" },
                      { key: "1", label: "1 · Campfire" },
                      { key: "2", label: "2 · Arcade" },
                      { key: "3", label: "3 · Desk" },
                    ] as { key: LocationScope | null; label: string }[]).map(({ key, label }) => (
                      <button
                        key={label}
                        onClick={() => setLocationScopeFilter(key)}
                        className={`rounded-full border px-2 py-0.5 text-[0.62rem] font-medium ${
                          locationScopeFilter === key
                            ? "border-emerald-400/50 bg-emerald-500/25 text-emerald-100"
                            : "border-white/15 bg-white/[0.06] text-white/80 hover:border-white/40 hover:bg-white/15"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <LocationScopeContext.Provider value={locationScopeFilter}>
                  <ControlGroup title="Camera">
                    <SliderRow
                      label="Up / Down"
                      value={campfireConfig.cameraY}
                      min={-100}
                      max={100}
                      step={0.05}
                      onChange={(value) => {
                        setCampfireConfig((previous) => normalizeCampfireConfig({
                          ...previous,
                          cameraY: value,
                          targetY: previous.targetY + (value - previous.cameraY),
                        }));
                      }}
                    />
                    <SliderRow
                      label="Left / Right"
                      value={campfireConfig.cameraX}
                      min={-100}
                      max={100}
                      step={0.05}
                      onChange={(value) => {
                        setCampfireConfig((previous) => normalizeCampfireConfig({
                          ...previous,
                          cameraX: value,
                          targetX: previous.targetX + (value - previous.cameraX),
                        }));
                      }}
                    />
                    <SliderRow
                      label="Back / Forward"
                      value={campfireConfig.cameraZ}
                      min={-100}
                      max={100}
                      step={0.05}
                      onChange={(value) => {
                        setCampfireConfig((previous) => normalizeCampfireConfig({
                          ...previous,
                          cameraZ: value,
                          targetZ: previous.targetZ + (value - previous.cameraZ),
                        }));
                      }}
                    />
                    <SliderRow
                      label="Tilt up / down"
                      value={campfireConfig.targetY - campfireConfig.cameraY}
                      min={-30}
                      max={30}
                      step={0.02}
                      onChange={(offset) => updateCampfire("targetY", campfireConfig.cameraY + offset)}
                    />
                    <SliderRow
                      label="Tilt left / right"
                      value={campfireConfig.targetX - campfireConfig.cameraX}
                      min={-30}
                      max={30}
                      step={0.02}
                      onChange={(offset) => updateCampfire("targetX", campfireConfig.cameraX + offset)}
                    />
                    <button
                      onClick={() => {
                        setCampfireConfig((previous) => normalizeCampfireConfig({
                          ...previous,
                          cameraX: DEFAULT_CAMPFIRE_CONFIG.cameraX,
                          cameraY: DEFAULT_CAMPFIRE_CONFIG.cameraY,
                          cameraZ: DEFAULT_CAMPFIRE_CONFIG.cameraZ,
                          targetX: DEFAULT_CAMPFIRE_CONFIG.targetX,
                          targetY: DEFAULT_CAMPFIRE_CONFIG.targetY,
                          targetZ: DEFAULT_CAMPFIRE_CONFIG.targetZ,
                          fov: DEFAULT_CAMPFIRE_CONFIG.fov,
                        }));
                      }}
                      className="mt-2 w-full rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[0.65rem] font-semibold text-white/85 hover:bg-white/20"
                    >
                      Reset camera
                    </button>
                    <SliderRow label="FOV" value={campfireConfig.fov} min={5} max={170} step={1} onChange={(value) => updateCampfire("fov", value)} />
                  </ControlGroup>

                  <ControlGroup title="1 · Title fly-in" scope="1">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      How pulled-back the camera sits while the title card is on
                      screen — that&apos;s the shot the visitor sees behind the letters,
                      and where the fly-in starts from.
                    </p>
                    <SliderRow
                      label="Pull back ×"
                      value={campfireConfig.titleCameraDistance}
                      min={1}
                      max={40}
                      step={0.1}
                      onChange={(value) => updateCampfire("titleCameraDistance", value)}
                    />
                    <SliderRow
                      label="Extra distance"
                      value={campfireConfig.titleFlyExtraDistance}
                      min={0}
                      max={400}
                      step={1}
                      onChange={(value) => updateCampfire("titleFlyExtraDistance", value)}
                    />
                    <SliderRow
                      label="Sky height"
                      value={campfireConfig.titleCameraHeight}
                      min={0}
                      max={120}
                      step={0.5}
                      onChange={(value) => updateCampfire("titleCameraHeight", value)}
                    />
                    <SliderRow
                      label="Camera angle °"
                      value={campfireConfig.titleFlyCameraPitch}
                      min={-90}
                      max={90}
                      step={0.5}
                      onChange={(value) => updateCampfire("titleFlyCameraPitch", value)}
                    />
                    <div className="mt-3 mb-1 text-[0.6rem] font-semibold uppercase tracking-wider text-white/40">
                      Fly-in swoop
                    </div>
                    <SliderRow
                      label="Fly duration"
                      value={campfireConfig.titleFlyDuration}
                      min={0.5}
                      max={12}
                      step={0.1}
                      onChange={(value) => updateCampfire("titleFlyDuration", value)}
                    />
                    <SliderRow
                      label="FOV boost"
                      value={campfireConfig.titleFlyFovBoost}
                      min={0}
                      max={60}
                      step={0.5}
                      onChange={(value) => updateCampfire("titleFlyFovBoost", value)}
                    />
                    <SliderRow
                      label="Fog squash"
                      value={campfireConfig.titleFlyFogSquash}
                      min={0.05}
                      max={1}
                      step={0.01}
                      onChange={(value) => updateCampfire("titleFlyFogSquash", value)}
                    />
                    <div className="mt-3 mb-1 text-[0.6rem] font-semibold uppercase tracking-wider text-white/40">
                      Fade timing
                    </div>
                    <SliderRow
                      label="Black hold"
                      value={campfireConfig.titleBlackHoldDuration}
                      min={0}
                      max={5}
                      step={0.05}
                      onChange={(value) => updateCampfire("titleBlackHoldDuration", value)}
                    />
                    <SliderRow
                      label="Fade in"
                      value={campfireConfig.titleFadeInDuration}
                      min={0.2}
                      max={6}
                      step={0.05}
                      onChange={(value) => updateCampfire("titleFadeInDuration", value)}
                    />
                    <SliderRow
                      label="Exit slide"
                      value={campfireConfig.titleExitSlideDuration}
                      min={0.1}
                      max={3}
                      step={0.05}
                      onChange={(value) => updateCampfire("titleExitSlideDuration", value)}
                    />
                    <SliderRow
                      label="Unmount delay"
                      value={campfireConfig.titleExitUnmountDelay}
                      min={0}
                      max={2}
                      step={0.05}
                      onChange={(value) => updateCampfire("titleExitUnmountDelay", value)}
                    />
                    <SliderRow
                      label="Exit slide height"
                      value={campfireConfig.titleExitSlideDistance}
                      min={0}
                      max={80}
                      step={0.5}
                      onChange={(value) => updateCampfire("titleExitSlideDistance", value)}
                    />
                    <SliderRow
                      label="Exit Z (fwd +/back -)"
                      value={campfireConfig.titleExitZDistance}
                      min={-40}
                      max={40}
                      step={0.5}
                      onChange={(value) => updateCampfire("titleExitZDistance", value)}
                    />
                    <SliderRow
                      label="Letter movement"
                      value={campfireConfig.titleLetterIdleAmount}
                      min={0}
                      max={6}
                      step={0.1}
                      onChange={(value) => updateCampfire("titleLetterIdleAmount", value)}
                    />
                    <SliderRow
                      label="Letter waviness"
                      value={campfireConfig.titleLetterWaviness}
                      min={0}
                      max={3.14}
                      step={0.02}
                      onChange={(value) => updateCampfire("titleLetterWaviness", value)}
                    />
                  </ControlGroup>

                  <ControlGroup jumpKey="Locations" title={siteView === null ? "Locations" : `Locations — ${LOCATION_NAMES[siteView]} camera`}>
                    {siteView === null ? (
                      <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                        Pick a location in the View bar to frame its camera. You can drag
                        the scene to reframe it, and still click and move props while you do.
                      </p>
                    ) : (
                      <>
                        {(() => {
                          const view = campfireConfig.locationViews?.[siteView]
                            ?? defaultLocationView(siteView, campfireConfig);
                          const rows: Array<[keyof LocationView, string]> = [
                            ["cx", "Camera left / right"],
                            ["cy", "Camera up / down"],
                            ["cz", "Camera back / forward"],
                            ["tx", "Look-at left / right"],
                            ["ty", "Look-at up / down"],
                            ["tz", "Look-at back / forward"],
                          ];
                          return rows.map(([field, label]) => (
                            <SliderRow
                              key={field}
                              label={label}
                              value={view[field]}
                              min={-30}
                              max={30}
                              step={0.05}
                              onChange={(value) => updateLocationViewField(siteView, field, value)}
                            />
                          ));
                        })()}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            onClick={() => {
                              const view = campfireConfig.locationViews?.[siteView]
                                ?? defaultLocationView(siteView, campfireConfig);
                              setCampfireConfig((previous) => normalizeCampfireConfig({
                                ...previous,
                                locationViews: LOCATION_NAMES.map(() => ({ ...view })),
                              }));
                              showSaveMessage(`Copied ${LOCATION_NAMES[siteView]} framing to all`);
                            }}
                            className="flex-1 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[0.65rem] font-semibold text-white/85 hover:bg-white/20"
                            title="Give every location this same shot"
                          >
                            Copy to all
                          </button>
                          <button
                            onClick={() => updateLocationView(siteView, defaultLocationView(siteView, campfireConfig))}
                            className="flex-1 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[0.65rem] font-semibold text-white/85 hover:bg-white/20"
                            title="Discard adjustments and use the hardcoded authored framing"
                          >
                            Reset this one
                          </button>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <button
                            onClick={() => void saveCameraDefault(siteView)}
                            className="flex-1 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 text-[0.65rem] font-semibold text-emerald-100 hover:bg-emerald-500/30"
                            title="Snapshot the current camera as this location's default, saved separately from the main scene config"
                          >
                            Save default camera
                          </button>
                          <button
                            onClick={() => restoreCameraDefault(siteView)}
                            disabled={!cameraDefaults[String(siteView)]}
                            className="flex-1 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[0.65rem] font-semibold text-white/85 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                            title="Jump back to the camera you snapshotted with Save default"
                          >
                            Go back to default
                          </button>
                        </div>
                      </>
                    )}
                    <SliderRow
                      label="Ring size"
                      value={campfireConfig.locationRadius}
                      min={3}
                      max={40}
                      step={0.1}
                      onChange={(value) => updateCampfire("locationRadius", value)}
                    />
                    <SliderRow
                      label="Spin the ring"
                      value={campfireConfig.locationAngleOffset}
                      min={-3.14}
                      max={3.14}
                      step={0.01}
                      onChange={(value) => updateCampfire("locationAngleOffset", value)}
                    />
                    <SliderRow
                      label="Turn each scene"
                      value={campfireConfig.locationSpin}
                      min={-3.14}
                      max={3.14}
                      step={0.01}
                      onChange={(value) => updateCampfire("locationSpin", value)}
                    />
                    <SliderRow
                      label="Camera pull-back"
                      value={campfireConfig.locationCameraBack}
                      min={0.5}
                      max={30}
                      step={0.05}
                      onChange={(value) => updateCampfire("locationCameraBack", value)}
                    />
                    <SliderRow
                      label="Camera height"
                      value={campfireConfig.locationCameraHeight}
                      min={-5}
                      max={20}
                      step={0.05}
                      onChange={(value) => updateCampfire("locationCameraHeight", value)}
                    />
                    <SliderRow
                      label="Look-at height"
                      value={campfireConfig.locationTargetHeight}
                      min={-5}
                      max={20}
                      step={0.05}
                      onChange={(value) => updateCampfire("locationTargetHeight", value)}
                    />
                    <SliderRow
                      label="Turn time (s)"
                      value={campfireConfig.locationTurnSpeed}
                      min={0.05}
                      max={4}
                      step={0.01}
                      onChange={(value) => updateCampfire("locationTurnSpeed", value)}
                    />
                    <button
                      onClick={() => {
                        setCampfireConfig((previous) => normalizeCampfireConfig({
                          ...previous,
                          locationRadius: DEFAULT_CAMPFIRE_CONFIG.locationRadius,
                          locationAngleOffset: DEFAULT_CAMPFIRE_CONFIG.locationAngleOffset,
                          locationSpin: DEFAULT_CAMPFIRE_CONFIG.locationSpin,
                          locationCameraBack: DEFAULT_CAMPFIRE_CONFIG.locationCameraBack,
                          locationCameraHeight: DEFAULT_CAMPFIRE_CONFIG.locationCameraHeight,
                          locationTargetHeight: DEFAULT_CAMPFIRE_CONFIG.locationTargetHeight,
                          locationTurnSpeed: DEFAULT_CAMPFIRE_CONFIG.locationTurnSpeed,
                          locationViews: DEFAULT_CAMPFIRE_CONFIG.locationViews.map((v) => ({ ...v })),
                        }));
                      }}
                      className="mt-2 w-full rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[0.65rem] font-semibold text-white/85 hover:bg-white/20"
                    >
                      Reset locations
                    </button>
                  </ControlGroup>



                  <ControlGroup title="3 · Desk — terrain" scope="3">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      Ceiling on the camping set&apos;s landscape. Any terrain or
                      rock vertex above this is pulled down to it, so the
                      mountains behind the caravan flatten while the ground under
                      the camp stays put. The range tops out around y 11.3, so
                      push this past 12 to get the mountains back.
                    </p>
                    <SliderRow label="Ground max height" value={campfireConfig.deskCampGroundMaxY} min={0.5} max={15} step={0.1} onChange={(value) => updateCampfire("deskCampGroundMaxY", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">River</div>
                    <p className="mb-1 text-[0.6rem] leading-relaxed text-white/40">
                      One slab of geometry running y -1.63 to 0.56 in the model.
                      Height is an offset, so 0 is where it was authored; below 1
                      opacity it joins the transparent pass and the riverbed shows
                      through.
                    </p>
                    <SliderRow label="Water height (offset)" value={campfireConfig.deskWaterHeight} min={-3} max={3} step={0.01} onChange={(value) => updateCampfire("deskWaterHeight", value)} />
                    <SliderRow label="Water opacity (1 = solid)" value={campfireConfig.deskWaterOpacity} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskWaterOpacity", value)} />
                  </ControlGroup>

                  <ControlGroup title="3 · Desk — fish A · under the dock" scope="3">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      Mills about beneath the deck and spills out from under it. Twist and Scatter are what keep it from reading as one carousel: Twist turns each fish&apos;s own path, Scatter moves each path&apos;s centre off the group&apos;s. They swim under a surface at y 0.561, so if you
                      can&apos;t see them raise Y or drop <em>Water opacity</em> in the
                      terrain group above.
                    </p>
                    <SliderRow label="On (0/1)" value={campfireConfig.deskFishAOn} min={0} max={1} step={1} onChange={(value) => updateCampfire("deskFishAOn", value)} />
                    <SliderRow label="How many" value={campfireConfig.deskFishACount} min={0} max={40} step={1} onChange={(value) => updateCampfire("deskFishACount", value)} />
                    <SliderRow label="X" value={campfireConfig.deskFishAX} min={-20} max={20} step={0.01} onChange={(value) => updateCampfire("deskFishAX", value)} />
                    <SliderRow label="Depth Y" value={campfireConfig.deskFishAY} min={-3} max={4} step={0.01} onChange={(value) => updateCampfire("deskFishAY", value)} />
                    <SliderRow label="Z" value={campfireConfig.deskFishAZ} min={-20} max={20} step={0.01} onChange={(value) => updateCampfire("deskFishAZ", value)} />
                    <SliderRow label="Path size X" value={campfireConfig.deskFishARadiusX} min={0} max={8} step={0.01} onChange={(value) => updateCampfire("deskFishARadiusX", value)} />
                    <SliderRow label="Path size Z" value={campfireConfig.deskFishARadiusZ} min={0} max={8} step={0.01} onChange={(value) => updateCampfire("deskFishARadiusZ", value)} />
                    <SliderRow label="Rotate the whole shoal" value={campfireConfig.deskFishARotate} min={-3.15} max={3.15} step={0.01} onChange={(value) => updateCampfire("deskFishARotate", value)} />
                    <SliderRow label="Twist each path (0 = one shared lap)" value={campfireConfig.deskFishATwist} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskFishATwist", value)} />
                    <SliderRow label="Scatter the path centres" value={campfireConfig.deskFishAScatter} min={0} max={2} step={0.01} onChange={(value) => updateCampfire("deskFishAScatter", value)} />
                    <SliderRow label="Speed" value={campfireConfig.deskFishASpeed} min={0} max={4} step={0.01} onChange={(value) => updateCampfire("deskFishASpeed", value)} />
                    <SliderRow label="Size" value={campfireConfig.deskFishAScale} min={0.005} max={0.5} step={0.001} onChange={(value) => updateCampfire("deskFishAScale", value)} />
                    <SliderRow label="Bob up/down" value={campfireConfig.deskFishABob} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("deskFishABob", value)} />
                    <SliderRow label="Figure-eights (0 = all loops)" value={campfireConfig.deskFishAEight} min={0} max={2} step={0.01} onChange={(value) => updateCampfire("deskFishAEight", value)} />
                    <SliderRow label="Wander (drifts the path)" value={campfireConfig.deskFishAWander} min={0} max={2} step={0.01} onChange={(value) => updateCampfire("deskFishAWander", value)} />
                    <SliderRow label="Depth spread" value={campfireConfig.deskFishADepthSpread} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("deskFishADepthSpread", value)} />
                    <SliderRow label="Bank into turns" value={campfireConfig.deskFishABank} min={0} max={2} step={0.01} onChange={(value) => updateCampfire("deskFishABank", value)} />
                    <SliderRow label="Spin (PI = swim the other way)" value={campfireConfig.deskFishAYawOffset} min={-3.15} max={3.15} step={0.01} onChange={(value) => updateCampfire("deskFishAYawOffset", value)} />
                  </ControlGroup>

                  <ControlGroup title="3 · Desk — fish B · loop past the lantern" scope="3">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      One long lap that passes under the dock lantern and back out along the river. Rotate lays the ellipse along the shoreline (2.64 rad) — a round loop this big runs aground. Twist 0 keeps them all on the same lap. They swim under a surface at y 0.561, so if you
                      can&apos;t see them raise Y or drop <em>Water opacity</em> in the
                      terrain group above.
                    </p>
                    <SliderRow label="On (0/1)" value={campfireConfig.deskFishBOn} min={0} max={1} step={1} onChange={(value) => updateCampfire("deskFishBOn", value)} />
                    <SliderRow label="How many" value={campfireConfig.deskFishBCount} min={0} max={40} step={1} onChange={(value) => updateCampfire("deskFishBCount", value)} />
                    <SliderRow label="X" value={campfireConfig.deskFishBX} min={-20} max={20} step={0.01} onChange={(value) => updateCampfire("deskFishBX", value)} />
                    <SliderRow label="Depth Y" value={campfireConfig.deskFishBY} min={-3} max={4} step={0.01} onChange={(value) => updateCampfire("deskFishBY", value)} />
                    <SliderRow label="Z" value={campfireConfig.deskFishBZ} min={-20} max={20} step={0.01} onChange={(value) => updateCampfire("deskFishBZ", value)} />
                    <SliderRow label="Path size X" value={campfireConfig.deskFishBRadiusX} min={0} max={8} step={0.01} onChange={(value) => updateCampfire("deskFishBRadiusX", value)} />
                    <SliderRow label="Path size Z" value={campfireConfig.deskFishBRadiusZ} min={0} max={8} step={0.01} onChange={(value) => updateCampfire("deskFishBRadiusZ", value)} />
                    <SliderRow label="Rotate the whole shoal" value={campfireConfig.deskFishBRotate} min={-3.15} max={3.15} step={0.01} onChange={(value) => updateCampfire("deskFishBRotate", value)} />
                    <SliderRow label="Twist each path (0 = one shared lap)" value={campfireConfig.deskFishBTwist} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskFishBTwist", value)} />
                    <SliderRow label="Scatter the path centres" value={campfireConfig.deskFishBScatter} min={0} max={2} step={0.01} onChange={(value) => updateCampfire("deskFishBScatter", value)} />
                    <SliderRow label="Speed" value={campfireConfig.deskFishBSpeed} min={0} max={4} step={0.01} onChange={(value) => updateCampfire("deskFishBSpeed", value)} />
                    <SliderRow label="Size" value={campfireConfig.deskFishBScale} min={0.005} max={0.5} step={0.001} onChange={(value) => updateCampfire("deskFishBScale", value)} />
                    <SliderRow label="Bob up/down" value={campfireConfig.deskFishBBob} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("deskFishBBob", value)} />
                    <SliderRow label="Figure-eights (0 = all loops)" value={campfireConfig.deskFishBEight} min={0} max={2} step={0.01} onChange={(value) => updateCampfire("deskFishBEight", value)} />
                    <SliderRow label="Wander (drifts the path)" value={campfireConfig.deskFishBWander} min={0} max={2} step={0.01} onChange={(value) => updateCampfire("deskFishBWander", value)} />
                    <SliderRow label="Depth spread" value={campfireConfig.deskFishBDepthSpread} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("deskFishBDepthSpread", value)} />
                    <SliderRow label="Bank into turns" value={campfireConfig.deskFishBBank} min={0} max={2} step={0.01} onChange={(value) => updateCampfire("deskFishBBank", value)} />
                    <SliderRow label="Spin (PI = swim the other way)" value={campfireConfig.deskFishBYawOffset} min={-3.15} max={3.15} step={0.01} onChange={(value) => updateCampfire("deskFishBYawOffset", value)} />
                  </ControlGroup>

                  <ControlGroup title="3 · Desk — fish C · spare" scope="3">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      A third shoal, off by default. Turn it on and give it a Count. They swim under a surface at y 0.561, so if you
                      can&apos;t see them raise Y or drop <em>Water opacity</em> in the
                      terrain group above.
                    </p>
                    <SliderRow label="On (0/1)" value={campfireConfig.deskFishCOn} min={0} max={1} step={1} onChange={(value) => updateCampfire("deskFishCOn", value)} />
                    <SliderRow label="How many" value={campfireConfig.deskFishCCount} min={0} max={40} step={1} onChange={(value) => updateCampfire("deskFishCCount", value)} />
                    <SliderRow label="X" value={campfireConfig.deskFishCX} min={-20} max={20} step={0.01} onChange={(value) => updateCampfire("deskFishCX", value)} />
                    <SliderRow label="Depth Y" value={campfireConfig.deskFishCY} min={-3} max={4} step={0.01} onChange={(value) => updateCampfire("deskFishCY", value)} />
                    <SliderRow label="Z" value={campfireConfig.deskFishCZ} min={-20} max={20} step={0.01} onChange={(value) => updateCampfire("deskFishCZ", value)} />
                    <SliderRow label="Path size X" value={campfireConfig.deskFishCRadiusX} min={0} max={8} step={0.01} onChange={(value) => updateCampfire("deskFishCRadiusX", value)} />
                    <SliderRow label="Path size Z" value={campfireConfig.deskFishCRadiusZ} min={0} max={8} step={0.01} onChange={(value) => updateCampfire("deskFishCRadiusZ", value)} />
                    <SliderRow label="Rotate the whole shoal" value={campfireConfig.deskFishCRotate} min={-3.15} max={3.15} step={0.01} onChange={(value) => updateCampfire("deskFishCRotate", value)} />
                    <SliderRow label="Twist each path (0 = one shared lap)" value={campfireConfig.deskFishCTwist} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("deskFishCTwist", value)} />
                    <SliderRow label="Scatter the path centres" value={campfireConfig.deskFishCScatter} min={0} max={2} step={0.01} onChange={(value) => updateCampfire("deskFishCScatter", value)} />
                    <SliderRow label="Speed" value={campfireConfig.deskFishCSpeed} min={0} max={4} step={0.01} onChange={(value) => updateCampfire("deskFishCSpeed", value)} />
                    <SliderRow label="Size" value={campfireConfig.deskFishCScale} min={0.005} max={0.5} step={0.001} onChange={(value) => updateCampfire("deskFishCScale", value)} />
                    <SliderRow label="Bob up/down" value={campfireConfig.deskFishCBob} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("deskFishCBob", value)} />
                    <SliderRow label="Figure-eights (0 = all loops)" value={campfireConfig.deskFishCEight} min={0} max={2} step={0.01} onChange={(value) => updateCampfire("deskFishCEight", value)} />
                    <SliderRow label="Wander (drifts the path)" value={campfireConfig.deskFishCWander} min={0} max={2} step={0.01} onChange={(value) => updateCampfire("deskFishCWander", value)} />
                    <SliderRow label="Depth spread" value={campfireConfig.deskFishCDepthSpread} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("deskFishCDepthSpread", value)} />
                    <SliderRow label="Bank into turns" value={campfireConfig.deskFishCBank} min={0} max={2} step={0.01} onChange={(value) => updateCampfire("deskFishCBank", value)} />
                    <SliderRow label="Spin (PI = swim the other way)" value={campfireConfig.deskFishCYawOffset} min={-3.15} max={3.15} step={0.01} onChange={(value) => updateCampfire("deskFishCYawOffset", value)} />
                  </ControlGroup>

                  <ControlGroup title="1 · Campfire — trodden ground" scope="1">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      Two flat irregular polygons laid on the ground disc — the same
                      trick camping.glb uses, where the camp dirt is its own mesh over
                      the terrain rather than a texture. <em>Jag</em> pulls each
                      boundary vertex in at random, which is what makes the edge spiky;
                      <em>Sides</em> is the vertex count, fewer being chunkier. Keep the
                      radii under about 8 — past that the fire&apos;s light has gone and
                      the ground is black.
                    </p>
                    <SliderRow label="On (0/1)" value={campfireConfig.groundPatchOn} min={0} max={1} step={1} onChange={(value) => updateCampfire("groundPatchOn", value)} />
                    <SliderRow label="Seed (reshuffles outlines)" value={campfireConfig.groundPatchSeed} min={1} max={200} step={1} onChange={(value) => updateCampfire("groundPatchSeed", value)} />
                    <SliderRow label="Nudge X" value={campfireConfig.groundPatchOffsetX} min={-25} max={25} step={0.1} onChange={(value) => updateCampfire("groundPatchOffsetX", value)} />
                    <SliderRow label="Nudge Z" value={campfireConfig.groundPatchOffsetZ} min={-25} max={25} step={0.1} onChange={(value) => updateCampfire("groundPatchOffsetZ", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Outer patch</div>
                    <SliderRow label="Radius" value={campfireConfig.groundPatchOuterRadius} min={0.2} max={20} step={0.05} onChange={(value) => updateCampfire("groundPatchOuterRadius", value)} />
                    <SliderRow label="Jag" value={campfireConfig.groundPatchOuterJag} min={0} max={0.9} step={0.01} onChange={(value) => updateCampfire("groundPatchOuterJag", value)} />
                    <SliderRow label="Sides" value={campfireConfig.groundPatchOuterSides} min={3} max={40} step={1} onChange={(value) => updateCampfire("groundPatchOuterSides", value)} />
                    <SliderRow label="Spin" value={campfireConfig.groundPatchOuterSpin} min={-3.15} max={3.15} step={0.01} onChange={(value) => updateCampfire("groundPatchOuterSpin", value)} />
                    <SliderRow label="Rounded (0 = torn, 1 = lobed)" value={campfireConfig.groundPatchOuterRound} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("groundPatchOuterRound", value)} />
                    <SliderRow label="R" value={campfireConfig.groundPatchOuterR} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("groundPatchOuterR", value)} />
                    <SliderRow label="G" value={campfireConfig.groundPatchOuterG} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("groundPatchOuterG", value)} />
                    <SliderRow label="B" value={campfireConfig.groundPatchOuterB} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("groundPatchOuterB", value)} />
                    <SliderRow label="Lift off the ground" value={campfireConfig.groundPatchOuterY} min={0} max={0.2} step={0.001} onChange={(value) => updateCampfire("groundPatchOuterY", value)} />
                    <SliderRow label="Opacity" value={campfireConfig.groundPatchOuterOpacity} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("groundPatchOuterOpacity", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Inner patch</div>
                    <SliderRow label="Radius" value={campfireConfig.groundPatchInnerRadius} min={0.2} max={20} step={0.05} onChange={(value) => updateCampfire("groundPatchInnerRadius", value)} />
                    <SliderRow label="Jag" value={campfireConfig.groundPatchInnerJag} min={0} max={0.9} step={0.01} onChange={(value) => updateCampfire("groundPatchInnerJag", value)} />
                    <SliderRow label="Sides" value={campfireConfig.groundPatchInnerSides} min={3} max={40} step={1} onChange={(value) => updateCampfire("groundPatchInnerSides", value)} />
                    <SliderRow label="Spin" value={campfireConfig.groundPatchInnerSpin} min={-3.15} max={3.15} step={0.01} onChange={(value) => updateCampfire("groundPatchInnerSpin", value)} />
                    <SliderRow label="Rounded (0 = torn, 1 = lobed)" value={campfireConfig.groundPatchInnerRound} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("groundPatchInnerRound", value)} />
                    <SliderRow label="R" value={campfireConfig.groundPatchInnerR} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("groundPatchInnerR", value)} />
                    <SliderRow label="G" value={campfireConfig.groundPatchInnerG} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("groundPatchInnerG", value)} />
                    <SliderRow label="B" value={campfireConfig.groundPatchInnerB} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("groundPatchInnerB", value)} />
                    <SliderRow label="Lift off the ground" value={campfireConfig.groundPatchInnerY} min={0} max={0.2} step={0.001} onChange={(value) => updateCampfire("groundPatchInnerY", value)} />
                    <SliderRow label="Opacity" value={campfireConfig.groundPatchInnerOpacity} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("groundPatchInnerOpacity", value)} />
                  </ControlGroup>


                  <ControlGroup title="Ground">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      Color of the circular ground under the whole campsite. Try
                      the presets or dial each channel by hand.
                    </p>
                    <SliderRow label="Red" value={campfireConfig.groundColorR} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("groundColorR", value)} />
                    <SliderRow label="Green" value={campfireConfig.groundColorG} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("groundColorG", value)} />
                    <SliderRow label="Blue" value={campfireConfig.groundColorB} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("groundColorB", value)} />
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setCampfireConfig((p) => normalizeCampfireConfig({ ...p, groundColorR: 0.13, groundColorG: 0.30, groundColorB: 0.12 }))}
                        className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[0.62rem] font-medium text-white/85 hover:bg-white/20"
                      >Moss</button>
                      <button
                        type="button"
                        onClick={() => setCampfireConfig((p) => normalizeCampfireConfig({ ...p, groundColorR: 0.08, groundColorG: 0.42, groundColorB: 0.08 }))}
                        className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[0.62rem] font-medium text-white/85 hover:bg-white/20"
                      >Grass</button>
                      <button
                        type="button"
                        onClick={() => setCampfireConfig((p) => normalizeCampfireConfig({ ...p, groundColorR: 0.35, groundColorG: 0.22, groundColorB: 0.08 }))}
                        className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[0.62rem] font-medium text-white/85 hover:bg-white/20"
                      >Dirt</button>
                      <button
                        type="button"
                        onClick={() => setCampfireConfig((p) => normalizeCampfireConfig({ ...p, groundColorR: 0.165, groundColorG: 0.11, groundColorB: 0.192 }))}
                        className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[0.62rem] font-medium text-white/85 hover:bg-white/20"
                      >Original</button>
                    </div>
                  </ControlGroup>



                  <ControlGroup title="1 · Campfire scene GLB" scope="1">
                    <SliderRow label="Scene scale" value={campfireConfig.sceneScale} min={0.05} max={10} step={0.01} onChange={(value) => updateCampfire("sceneScale", value)} />
                    <SliderRow label="Scene X" value={campfireConfig.sceneX} min={-20} max={20} step={0.05} onChange={(value) => updateCampfire("sceneX", value)} />
                    <SliderRow label="Scene height" value={campfireConfig.sceneY} min={-10} max={10} step={0.05} onChange={(value) => updateCampfire("sceneY", value)} />
                    <SliderRow label="Scene distance" value={campfireConfig.sceneZ} min={-20} max={20} step={0.05} onChange={(value) => updateCampfire("sceneZ", value)} />
                    <SliderRow label="Scene rotate" value={campfireConfig.sceneRotationY} min={-3.14} max={3.14} step={0.01} onChange={(value) => updateCampfire("sceneRotationY", value)} />
                  </ControlGroup>


                  <ControlGroup title="Benches" scope="1">
                    <SliderRow label="Bench radius" value={campfireConfig.benchRadius} min={0.5} max={10} step={0.05} onChange={(value) => updateCampfire("benchRadius", value)} />
                    <SliderRow label="Bench scale" value={campfireConfig.benchScale} min={0.1} max={4} step={0.01} onChange={(value) => updateCampfire("benchScale", value)} />
                    <SliderRow label="Bench facing" value={campfireConfig.benchAngleOffset} min={-3.14} max={3.14} step={0.01} onChange={(value) => updateCampfire("benchAngleOffset", value)} />
                  </ControlGroup>

                  <ControlGroup title="Trees" scope="1">
                    <SliderRow label="Tree scale" value={campfireConfig.treeScale} min={0.1} max={4} step={0.02} onChange={(value) => updateCampfire("treeScale", value)} />
                    <SliderRow label="Tree Y offset" value={campfireConfig.treeY} min={-5} max={5} step={0.02} onChange={(value) => updateCampfire("treeY", value)} />
                    <SliderRow label="Tree spread" value={campfireConfig.treeSpread} min={0.2} max={3} step={0.01} onChange={(value) => updateCampfire("treeSpread", value)} />
                    <SliderRow label="Tree clearing radius" value={campfireConfig.treeCloseRadius} min={0} max={30} step={0.1} onChange={(value) => updateCampfire("treeCloseRadius", value)} />
                  </ControlGroup>

                  <ControlGroup title="Forest & paths" scope="1">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      Procedural pine forest around the campsite with clear
                      corridors between each pair of camps. Toggle the paths
                      to show/hide the white ground strips.
                    </p>
                    <SliderRow label="Forest on" value={campfireConfig.forestEnabled} min={0} max={1} step={1} onChange={(value) => updateCampfire("forestEnabled", value)} />
                    <SliderRow label="Path lines on" value={campfireConfig.pathVisible} min={0} max={1} step={1} onChange={(value) => updateCampfire("pathVisible", value)} />
                    <SliderRow label="Tree height (global)" value={campfireConfig.forestTreeHeight} min={0.2} max={5} step={0.02} onChange={(value) => updateCampfire("forestTreeHeight", value)} />
                    <SliderRow label="Tree count" value={campfireConfig.forestTreeCount} min={0} max={1200} step={5} onChange={(value) => updateCampfire("forestTreeCount", value)} />
                    <SliderRow label="Clear around camps" value={campfireConfig.forestClearRadius} min={0} max={25} step={0.1} onChange={(value) => updateCampfire("forestClearRadius", value)} />
                    <SliderRow label="Path corridor ½-width" value={campfireConfig.pathCorridorHalfWidth} min={0} max={12} step={0.05} onChange={(value) => updateCampfire("pathCorridorHalfWidth", value)} />
                    <SliderRow label="Path line width" value={campfireConfig.pathWidth} min={0.02} max={3} step={0.01} onChange={(value) => updateCampfire("pathWidth", value)} />
                    <SliderRow label="Path flank spacing" value={campfireConfig.pathFlankSpacing} min={0.5} max={10} step={0.05} onChange={(value) => updateCampfire("pathFlankSpacing", value)} />
                    <SliderRow label="Forest outer radius" value={campfireConfig.forestOuterRadius} min={10} max={120} step={0.5} onChange={(value) => updateCampfire("forestOuterRadius", value)} />
                  </ControlGroup>

                  <ControlGroup title="Bonfire" scope="1">
                    <SliderRow label="Bonfire X" value={campfireConfig.bonfireX} min={-10} max={10} step={0.05} onChange={(value) => updateCampfire("bonfireX", value)} />
                    <SliderRow label="Bonfire Y" value={campfireConfig.bonfireY} min={-5} max={5} step={0.02} onChange={(value) => updateCampfire("bonfireY", value)} />
                    <SliderRow label="Bonfire Z" value={campfireConfig.bonfireZ} min={-10} max={10} step={0.05} onChange={(value) => updateCampfire("bonfireZ", value)} />
                    <SliderRow label="Bonfire rotate" value={campfireConfig.bonfireRotationY} min={-3.14} max={3.14} step={0.01} onChange={(value) => updateCampfire("bonfireRotationY", value)} />
                    <SliderRow label="Bonfire scale" value={campfireConfig.bonfireScale} min={0.1} max={5} step={0.02} onChange={(value) => updateCampfire("bonfireScale", value)} />
                  </ControlGroup>


                  <ControlGroup title="Tent" scope="1">
                    <SliderRow label="Tent X" value={campfireConfig.tentX} min={-15} max={15} step={0.05} onChange={(value) => updateCampfire("tentX", value)} />
                    <SliderRow label="Tent Y" value={campfireConfig.tentY} min={-5} max={5} step={0.02} onChange={(value) => updateCampfire("tentY", value)} />
                    <SliderRow label="Tent Z" value={campfireConfig.tentZ} min={-15} max={15} step={0.05} onChange={(value) => updateCampfire("tentZ", value)} />
                    <SliderRow label="Tent rotate" value={campfireConfig.tentRotationY} min={-3.14} max={3.14} step={0.01} onChange={(value) => updateCampfire("tentRotationY", value)} />
                    <SliderRow label="Tent scale" value={campfireConfig.tentScale} min={0.1} max={5} step={0.02} onChange={(value) => updateCampfire("tentScale", value)} />
                  </ControlGroup>

                  <ControlGroup title="Camp items" scope="1">
                    <SliderRow label="Items scale" value={campfireConfig.campItemsScale} min={0.1} max={5} step={0.02} onChange={(value) => updateCampfire("campItemsScale", value)} />
                    <SliderRow label="Items spread" value={campfireConfig.campItemsSpread} min={0.1} max={4} step={0.02} onChange={(value) => updateCampfire("campItemsSpread", value)} />
                    <SliderRow label="Items Y" value={campfireConfig.campItemsY} min={-3} max={3} step={0.02} onChange={(value) => updateCampfire("campItemsY", value)} />
                  </ControlGroup>

                  <ControlGroup title="Animals" scope="1">
                    <SliderRow label="Animal scale" value={campfireConfig.animalScale} min={0.05} max={20} step={0.02} onChange={(value) => updateCampfire("animalScale", value)} />
                    <SliderRow label="Animal spread" value={campfireConfig.animalSpread} min={0.1} max={4} step={0.02} onChange={(value) => updateCampfire("animalSpread", value)} />
                    <SliderRow label="Animal X" value={campfireConfig.animalX} min={-10} max={10} step={0.05} onChange={(value) => updateCampfire("animalX", value)} />
                    <SliderRow label="Animal Y" value={campfireConfig.animalY} min={-3} max={5} step={0.02} onChange={(value) => updateCampfire("animalY", value)} />
                    <SliderRow label="Animal Z" value={campfireConfig.animalZ} min={-10} max={10} step={0.05} onChange={(value) => updateCampfire("animalZ", value)} />
                  </ControlGroup>

                  <ControlGroup title="Flopping fish" scope="1">
                    <SliderRow label="Fish X" value={campfireConfig.fishX} min={-10} max={10} step={0.02} onChange={(value) => updateCampfire("fishX", value)} />
                    <SliderRow label="Fish Y" value={campfireConfig.fishY} min={-2} max={5} step={0.01} onChange={(value) => updateCampfire("fishY", value)} />
                    <SliderRow label="Fish Z" value={campfireConfig.fishZ} min={-10} max={10} step={0.02} onChange={(value) => updateCampfire("fishZ", value)} />
                    <SliderRow label="Fish tilt X" value={campfireConfig.fishRotationX} min={-3.14} max={3.14} step={0.01} onChange={(value) => updateCampfire("fishRotationX", value)} />
                    <SliderRow label="Fish heading Y" value={campfireConfig.fishRotationY} min={-3.14} max={3.14} step={0.01} onChange={(value) => updateCampfire("fishRotationY", value)} />
                    <SliderRow label="Fish roll Z" value={campfireConfig.fishRotationZ} min={-3.14} max={3.14} step={0.01} onChange={(value) => updateCampfire("fishRotationZ", value)} />
                    <SliderRow label="Fish scale" value={campfireConfig.fishScale} min={0.005} max={1} step={0.005} onChange={(value) => updateCampfire("fishScale", value)} />
                    <SliderRow label="Flop speed" value={campfireConfig.fishFlopSpeed} min={0} max={12} step={0.1} onChange={(value) => updateCampfire("fishFlopSpeed", value)} />
                  </ControlGroup>






                  <ControlGroup title="2 · Arcade — truck plate" scope="2">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      Size of the TWLO decal laid over the pickup&apos;s front
                      and rear plates. 1 = the baseline quad (84% of the plate
                      slab&apos;s width, 78% of its height); both plates resize
                      together so they stay matched.
                    </p>
                    <SliderRow label="Plate width" value={campfireConfig.truckPlateScaleX} min={0.2} max={3} step={0.01} onChange={(value) => updateCampfire("truckPlateScaleX", value)} />
                    <SliderRow label="Plate height" value={campfireConfig.truckPlateScaleY} min={0.2} max={3} step={0.01} onChange={(value) => updateCampfire("truckPlateScaleY", value)} />
                  </ControlGroup>

                  <ControlGroup title="2 · Arcade — truck bed walls" scope="2">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      Runtime panels rising above the bed&apos;s authored top
                      rail. Height 0 = off. Extension covers left inner wall,
                      right inner wall, and cab-side wall. Thickness sets how
                      chunky the rail reads; color tunes it to match the body.
                    </p>
                    <SliderRow label="Wall height" value={campfireConfig.truckBedWallHeight} min={0} max={1.5} step={0.005} onChange={(value) => updateCampfire("truckBedWallHeight", value)} />
                    <SliderRow label="Wall thickness" value={campfireConfig.truckBedWallThickness} min={0.005} max={0.2} step={0.001} onChange={(value) => updateCampfire("truckBedWallThickness", value)} />
                    <SliderRow label="Wall color R" value={campfireConfig.truckBedWallColorR} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("truckBedWallColorR", value)} />
                    <SliderRow label="Wall color G" value={campfireConfig.truckBedWallColorG} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("truckBedWallColorG", value)} />
                    <SliderRow label="Wall color B" value={campfireConfig.truckBedWallColorB} min={0} max={1} step={0.005} onChange={(value) => updateCampfire("truckBedWallColorB", value)} />
                  </ControlGroup>

                  <ControlGroup title="1 · Banjo (back-left bear)" scope="1">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      Offsets applied inside the paw&apos;s socket frame; scale
                      multiplies the baseline. Reload to see the sit_log
                      animation carry the banjo along with the breathing.
                    </p>
                    <SliderRow label="Banjo X" value={campfireConfig.banjoPropX} min={-0.5} max={0.5} step={0.005} onChange={(value) => updateCampfire("banjoPropX", value)} />
                    <SliderRow label="Banjo Y" value={campfireConfig.banjoPropY} min={-0.5} max={0.5} step={0.005} onChange={(value) => updateCampfire("banjoPropY", value)} />
                    <SliderRow label="Banjo Z" value={campfireConfig.banjoPropZ} min={-0.5} max={0.5} step={0.005} onChange={(value) => updateCampfire("banjoPropZ", value)} />
                    <SliderRow label="Banjo rot X" value={campfireConfig.banjoPropRotX} min={-3.14} max={3.14} step={0.01} onChange={(value) => updateCampfire("banjoPropRotX", value)} />
                    <SliderRow label="Banjo rot Y" value={campfireConfig.banjoPropRotY} min={-3.14} max={3.14} step={0.01} onChange={(value) => updateCampfire("banjoPropRotY", value)} />
                    <SliderRow label="Banjo rot Z" value={campfireConfig.banjoPropRotZ} min={-3.14} max={3.14} step={0.01} onChange={(value) => updateCampfire("banjoPropRotZ", value)} />
                    <SliderRow label="Banjo scale" value={campfireConfig.banjoPropScale} min={0.1} max={4} step={0.01} onChange={(value) => updateCampfire("banjoPropScale", value)} />
                    <div className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">Banjo bear glasses</div>
                    <p className="mb-1 text-[0.6rem] leading-relaxed text-white/40">
                      Offsets stack on top of the shared glasses fit (Animals
                      group). Zero everything to inherit the shared fit.
                    </p>
                    <SliderRow label="Glasses height" value={campfireConfig.banjoBearGlassesHeight} min={-0.1} max={0.1} step={0.001} onChange={(value) => updateCampfire("banjoBearGlassesHeight", value)} />
                    <SliderRow label="Glasses nose ride" value={campfireConfig.banjoBearGlassesNoseRide} min={-0.1} max={0.1} step={0.001} onChange={(value) => updateCampfire("banjoBearGlassesNoseRide", value)} />
                    <SliderRow label="Glasses tilt" value={campfireConfig.banjoBearGlassesTilt} min={-1} max={1} step={0.01} onChange={(value) => updateCampfire("banjoBearGlassesTilt", value)} />
                    <SliderRow label="Glasses scale" value={campfireConfig.banjoBearGlassesScale} min={0.1} max={3} step={0.01} onChange={(value) => updateCampfire("banjoBearGlassesScale", value)} />
                  </ControlGroup>

                  <ControlGroup title="Sound">
                    <p className="mb-1 text-[0.65rem] leading-relaxed text-white/45">
                      Master multiplies every track. Per-track values rebalance
                      one against another; zero mutes just that sound.
                    </p>
                    <SliderRow label="Master volume" value={campfireConfig.masterVolume} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("masterVolume", value)} />
                    <SliderRow label="Fire crackling" value={campfireConfig.fireCracklingVolume} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("fireCracklingVolume", value)} />
                    <SliderRow label="Banjo" value={campfireConfig.banjoVolume} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("banjoVolume", value)} />
                    <SliderRow label="Swoosh (panel switch)" value={campfireConfig.swooshVolume} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("swooshVolume", value)} />
                    <SliderRow label="Hover" value={campfireConfig.hoverVolume} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("hoverVolume", value)} />
                    <SliderRow label="Click" value={campfireConfig.clickVolume} min={0} max={1} step={0.01} onChange={(value) => updateCampfire("clickVolume", value)} />
                  </ControlGroup>

                  <button
                    type="button"
                    onClick={() => setCampfireConfig(DEFAULT_CAMPFIRE_CONFIG)}
                    className="w-full rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/15"
                  >
                    Reset campfire
                  </button>
                  </LocationScopeContext.Provider>
                </>
              ) : (
                <>
                  <ControlGroup title="Camera">
                    <SliderRow label="Camera X" value={oceanConfig.cameraX} min={-2.5} max={2.5} step={0.05} onChange={(value) => updateOcean("cameraX", value)} />
                    <SliderRow label="Camera height" value={oceanConfig.cameraY} min={0.15} max={3.2} step={0.05} onChange={(value) => updateOcean("cameraY", value)} />
                    <SliderRow label="Camera distance" value={oceanConfig.cameraZ} min={1} max={6} step={0.05} onChange={(value) => updateOcean("cameraZ", value)} />
                    <SliderRow label="Look X" value={oceanConfig.targetX} min={-2.5} max={2.5} step={0.05} onChange={(value) => updateOcean("targetX", value)} />
                    <SliderRow label="Look height" value={oceanConfig.targetY} min={0} max={2.5} step={0.05} onChange={(value) => updateOcean("targetY", value)} />
                    <SliderRow label="Look distance" value={oceanConfig.targetZ} min={-1} max={4.5} step={0.05} onChange={(value) => updateOcean("targetZ", value)} />
                    <SliderRow label="FOV" value={oceanConfig.fov} min={25} max={90} step={1} onChange={(value) => updateOcean("fov", value)} />
                  </ControlGroup>

                  <ControlGroup title="Water / atmosphere">
                    <SliderRow label="Fog start" value={oceanConfig.fogNear} min={0.2} max={8} step={0.1} onChange={(value) => updateOcean("fogNear", value)} />
                    <SliderRow label="Fog end" value={oceanConfig.fogFar} min={2} max={22} step={0.1} onChange={(value) => updateOcean("fogFar", value)} />
                    <SliderRow label="Ambient fill" value={oceanConfig.ambientIntensity} min={0} max={0.25} step={0.005} onChange={(value) => updateOcean("ambientIntensity", value)} />
                    <SliderRow label="Particles" value={oceanConfig.particleOpacity} min={0} max={1} step={0.01} onChange={(value) => updateOcean("particleOpacity", value)} />
                    <SliderRow label="Caustics" value={oceanConfig.causticsOpacity} min={0} max={2.5} step={0.05} onChange={(value) => updateOcean("causticsOpacity", value)} />
                  </ControlGroup>

                  <ControlGroup title="Light beams">
                    <SliderRow label="Beam intensity" value={oceanConfig.beamIntensity} min={0} max={3} step={0.05} onChange={(value) => updateOcean("beamIntensity", value)} />
                    <SliderRow label="Beam visibility" value={oceanConfig.beamOpacity} min={0} max={2.5} step={0.05} onChange={(value) => updateOcean("beamOpacity", value)} />
                    <SliderRow label="Beam width" value={oceanConfig.beamWidth} min={0.25} max={2.5} step={0.05} onChange={(value) => updateOcean("beamWidth", value)} />
                    <SliderRow label="Beam length" value={oceanConfig.beamLength} min={0.35} max={2.25} step={0.05} onChange={(value) => updateOcean("beamLength", value)} />
                    <SliderRow label="Target X" value={oceanConfig.beamTargetX} min={-2.5} max={2.5} step={0.05} onChange={(value) => updateOcean("beamTargetX", value)} />
                    <SliderRow label="Target height" value={oceanConfig.beamTargetY} min={0} max={1.2} step={0.02} onChange={(value) => updateOcean("beamTargetY", value)} />
                    <SliderRow label="Target distance" value={oceanConfig.beamTargetZ} min={-0.5} max={4} step={0.05} onChange={(value) => updateOcean("beamTargetZ", value)} />
                    <SliderRow label="Main light X" value={oceanConfig.mainLightX} min={-3} max={3} step={0.05} onChange={(value) => updateOcean("mainLightX", value)} />
                    <SliderRow label="Main height" value={oceanConfig.mainLightY} min={0.6} max={6} step={0.05} onChange={(value) => updateOcean("mainLightY", value)} />
                    <SliderRow label="Main distance" value={oceanConfig.mainLightZ} min={0.4} max={6} step={0.05} onChange={(value) => updateOcean("mainLightZ", value)} />
                    <SliderRow label="Main reach" value={oceanConfig.mainLightReach} min={1} max={14} step={0.1} onChange={(value) => updateOcean("mainLightReach", value)} />
                    <SliderRow label="Main angle" value={oceanConfig.mainLightAngle} min={0.08} max={1.2} step={0.01} onChange={(value) => updateOcean("mainLightAngle", value)} />
                    <SliderRow label="Side light X" value={oceanConfig.sideLightX} min={-4} max={4} step={0.05} onChange={(value) => updateOcean("sideLightX", value)} />
                    <SliderRow label="Side height" value={oceanConfig.sideLightY} min={0.6} max={6} step={0.05} onChange={(value) => updateOcean("sideLightY", value)} />
                    <SliderRow label="Side distance" value={oceanConfig.sideLightZ} min={0.4} max={6} step={0.05} onChange={(value) => updateOcean("sideLightZ", value)} />
                    <SliderRow label="Side reach" value={oceanConfig.sideLightReach} min={1} max={14} step={0.1} onChange={(value) => updateOcean("sideLightReach", value)} />
                    <SliderRow label="Side angle" value={oceanConfig.sideLightAngle} min={0.08} max={1.2} step={0.01} onChange={(value) => updateOcean("sideLightAngle", value)} />
                  </ControlGroup>

                  <button
                    type="button"
                    onClick={() => setOceanConfig(DEFAULT_OCEAN_CONFIG)}
                    className="w-full rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/15"
                  >
                    Reset ocean
                  </button>
                </>
              )}
              </SearchContext.Provider>
            </div>
          )}
        </section>
      </div>

      {/* Object list drawer + toggle button, bottom-left. Lists everything the
          user has interacted with plus anything referenced by an override,
          duplicate, or lock; each row is a toggle that flips config.lockedObjects.
          A locked entry has its descendant meshes' raycast noop'd inside the
          Canvas (see LockLayer), so pointer clicks pass through to whatever is
          behind - useful for placing something under a bear without picking the
          bear every time. */}
      {activeScene === "campfire" && (() => {
        const allNames = Array.from(new Set([
          ...knownObjects,
          ...Object.keys(campfireConfig.objectOverrides || {}),
          ...Object.keys(campfireConfig.objectDuplicates || {}),
          ...Object.keys(campfireConfig.lockedObjects || {}),
        ])).sort();
        return (
          <div className="pointer-events-none absolute bottom-14 left-3 z-30 flex flex-col items-start gap-2">
            {objectListOpen && (
              <div className="pointer-events-auto w-72 rounded-2xl border border-white/10 bg-black/75 p-3 text-xs text-white/90 shadow-2xl backdrop-blur-md">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-semibold">Object list</div>
                  <div className="flex items-center gap-1">
                    <span className="text-[0.6rem] text-white/45">{allNames.length}</span>
                    <button
                      onClick={() => setObjectListOpen(false)}
                      className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[0.62rem] hover:bg-white/20"
                    >
                      close
                    </button>
                  </div>
                </div>
                <p className="mb-2 text-[0.62rem] leading-4 text-white/55">
                  Toggle lock to make an object non-clickable. Clicks pass through it to whatever is behind.
                </p>
                {allNames.length === 0 ? (
                  <div className="rounded-lg bg-white/5 px-2 py-3 text-center text-[0.65rem] text-white/50">
                    Click something in the scene to add it here.
                  </div>
                ) : (
                  <div className="max-h-72 space-y-1 overflow-y-auto pr-0.5">
                    {allNames.map((name) => {
                      const locked = !!campfireConfig.lockedObjects?.[name];
                      return (
                        <div key={name} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2 py-1">
                          <button
                            onClick={() => { setSelectedObject(name); }}
                            className="min-w-0 flex-1 truncate text-left text-[0.65rem] text-white/70 hover:text-white"
                            title={name}
                          >
                            {name}
                          </button>
                          <button
                            onClick={() => toggleLocked(name)}
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${
                              locked
                                ? "border-amber-300/40 bg-amber-300/20 text-amber-100 hover:bg-amber-300/30"
                                : "border-white/15 bg-white/10 text-white/70 hover:bg-white/20"
                            }`}
                          >
                            {locked ? "🔒 locked" : "unlocked"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setObjectListOpen((v) => !v)}
              className="pointer-events-auto rounded-full border border-white/15 bg-black/70 px-3 py-1.5 text-xs font-semibold text-white/90 shadow-lg backdrop-blur-md hover:bg-black/80"
            >
              Object list
              {(() => {
                const lockedCount = Object.values(campfireConfig.lockedObjects || {}).filter(Boolean).length;
                return lockedCount > 0 ? (
                  <span className="ml-2 rounded-full bg-amber-300/25 px-1.5 py-0.5 text-[0.6rem] text-amber-100">
                    {lockedCount} 🔒
                  </span>
                ) : null;
              })()}
            </button>
            {/* Camera pill row: orbit freely without persisting the pose. Reset
                snaps back to the last saved shot (cameraX/Y/Z + targetX/Y/Z in
                config). Save commits the current live pose into config so the
                next reload starts there. */}
            <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/15 bg-black/70 px-2 py-1 text-xs shadow-lg backdrop-blur-md">
              <span className="pl-1 pr-1 text-[0.6rem] uppercase tracking-[0.14em] text-white/45">
                {siteView !== null ? `Camera · ${LOCATION_NAMES[siteView] ?? `panel ${siteView}`}` : "Camera · Free look"}
              </span>
              <button
                onClick={() => setCameraSnapSignal((s) => s + 1)}
                className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[0.65rem] font-semibold text-white/85 hover:bg-white/20"
                title="Snap the camera back to the last saved pose"
              >
                Reset
              </button>
              <button
                onClick={async () => {
                  // Save whatever is on screen RIGHT NOW. Reads from the live
                  // pose ref (kept fresh by OrbitControls "change") so a click
                  // works even without a prior drag.
                  //
                  // Panelled mode: locationViews are STRIPPED by /api/dev/scene-config
                  // (that endpoint intentionally keeps camera state out of
                  // campfireScene.json so a stray auto-save doesn't clobber the
                  // pinned defaults). So bypass the auto-save entirely and
                  // POST straight to /api/dev/camera-defaults, which writes
                  // src/config/cameraDefaults.json — the file sceneConfig.ts
                  // overlays on top of campfireScene.json at load time. That
                  // is the ONLY place a panelled camera survives a refresh.
                  //
                  // Free look: cameraX/Y/Z + targetX/Y/Z are top-level numbers
                  // and are NOT stripped, so the normal auto-save path works
                  // for those. Still fires an immediate write so a refresh
                  // right after Save can't beat the 800ms auto-save debounce.
                  const live = cameraLivePoseRef.current ?? liveCameraRef.current;
                  if (!live) return;
                  if (siteView !== null) {
                    const view = worldToLocationView(siteView, campfireConfig, live.pos, live.tgt);
                    // Update in-memory state so the current session shows the
                    // saved view (and Reset snaps back to it).
                    updateLocationView(siteView, view);
                    // Persist to cameraDefaults.json — the file that actually
                    // gets read on next refresh.
                    const next = { ...cameraDefaults, [String(siteView)]: view };
                    setCameraDefaults(next);
                    try {
                      const res = await fetch("/api/dev/camera-defaults", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(next),
                      });
                      if (!res.ok) {
                        showSaveMessage(`Camera save failed: ${res.status}`);
                        return;
                      }
                      showSaveMessage(`Saved ${LOCATION_NAMES[siteView]} camera to cameraDefaults.json`);
                    } catch (err) {
                      showSaveMessage(`Camera save error: ${(err as Error).message}`);
                      return;
                    }
                  } else {
                    const nextConfig = normalizeCampfireConfig({
                      ...campfireConfig,
                      cameraX: live.pos[0], cameraY: live.pos[1], cameraZ: live.pos[2],
                      targetX: live.tgt[0], targetY: live.tgt[1], targetZ: live.tgt[2],
                    });
                    setCampfireConfig(nextConfig);
                    try {
                      const res = await fetch("/api/dev/scene-config", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ campfire: nextConfig }),
                      });
                      if (!res.ok) {
                        showSaveMessage(`Camera save failed: ${res.status}`);
                        return;
                      }
                      showSaveMessage("Saved free-look camera to campfireScene.json");
                    } catch (err) {
                      showSaveMessage(`Camera save error: ${(err as Error).message}`);
                      return;
                    }
                  }
                  setCameraDirty(false);
                }}
                className="rounded-full border border-emerald-400/40 bg-emerald-400/20 px-2.5 py-1 text-[0.65rem] font-semibold text-emerald-100 hover:bg-emerald-400/30"
                title={
                  siteView !== null
                    ? `Save this view as the default for ${LOCATION_NAMES[siteView] ?? `panel ${siteView}`}`
                    : "Save this free-look view as the default"
                }
              >
                Save
              </button>
              {cameraDirty ? (
                <span className="ml-1 rounded-full bg-amber-300/25 px-1.5 py-0.5 text-[0.6rem] text-amber-100">
                  unsaved
                </span>
              ) : null}
            </div>
          </div>
        );
      })()}
    </main>
  );
}
