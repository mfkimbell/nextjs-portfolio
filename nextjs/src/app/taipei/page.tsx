"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import type { TaipeiDay, TaipeiEvent } from "./types";
import { useMode } from "./ModeContext";

// Map dayNum → image src, with real/fake variants where they exist
function dayImg(dayNum: number, mode: "real" | "fake"): string {
  const variants: Record<number, { real: string; fake: string }> = {
    2: { real: "/days/day2real.png", fake: "/days/day2fake.png" },
    6: { real: "/days/day6real.png", fake: "/days/day6fake.png" },
  };
  if (variants[dayNum]) return variants[dayNum][mode];
  return `/days/day${dayNum}.png`;
}

// ─── Inline editable field ────────────────────────────────────────────────────
function EditableField({
  value,
  onSave,
  multiline = false,
  placeholder = "",
  className = "",
}: {
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  if (editing) {
    const shared = {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !multiline) commit();
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      },
      autoFocus: true,
      className: `bg-white/10 border border-sky-400/60 rounded px-2 py-1 text-white w-full outline-none ${className}`,
    };
    return multiline ? <textarea {...shared} rows={3} /> : <input {...shared} />;
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={`cursor-text hover:bg-white/5 rounded px-1 -mx-1 transition-colors ${className} ${value ? "" : "text-white/30 italic"}`}
      title="Click to edit"
    >
      {value || placeholder}
    </span>
  );
}

// ─── Event card — two-column layout ─────────────────────────────────────────
function EventCard({
  event,
  onUpdateEvent,
}: {
  event: TaipeiEvent;
  onUpdateEvent: (id: string, data: Partial<TaipeiEvent>) => void;
}) {
  function save(field: keyof TaipeiEvent) {
    return (v: string) => onUpdateEvent(event.id, { [field]: v });
  }

  const hasRight = event.location || event.transit || event.tips;

  return (
    <div className="relative sm:pl-8">
      {/* Timeline dot */}
      <div className="hidden sm:flex absolute left-0 top-2 w-6 h-6 rounded-full bg-sky-500/80 border-2 border-sky-400 items-center justify-center text-xs select-none">
        {event.emoji || "•"}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl hover:border-white/20 transition-colors overflow-hidden">
        <div className={`${hasRight ? "grid grid-cols-1 md:grid-cols-2" : ""}`}>

          {/* ── LEFT: main info ── */}
          <div className="p-4 space-y-1">
            <div className="text-sky-300 text-xs font-mono">
              <EditableField value={event.time} onSave={save("time")} className="text-xs font-mono text-sky-300" />
            </div>
            <EditableField
              value={event.title}
              onSave={save("title")}
              className="font-semibold text-white text-base"
            />
            {event.description && (
              <div className="text-white/70 text-sm leading-relaxed">
                <EditableField
                  value={event.description}
                  onSave={save("description")}
                  multiline
                  placeholder="Description…"
                  className="text-sm"
                />
              </div>
            )}
          </div>

          {/* ── RIGHT: directions ── */}
          {hasRight && (
            <div className="border-t md:border-t-0 md:border-l border-white/10 p-4 bg-white/[0.02] space-y-3">
              {event.location && (
                <div>
                  <div className="text-white/35 text-[10px] uppercase tracking-widest mb-1 font-semibold">📍 Location</div>
                  <div className="text-white/70 text-sm whitespace-pre-line leading-relaxed">
                    <EditableField value={event.location} onSave={save("location")} multiline placeholder="Location…" className="text-sm" />
                  </div>
                </div>
              )}

              {event.transit && (
                <div>
                  <div className="text-white/35 text-[10px] uppercase tracking-widest mb-1 font-semibold">🚆 Getting There</div>
                  <div className="text-white/70 text-sm leading-relaxed">
                    <EditableField value={event.transit} onSave={save("transit")} multiline placeholder="Transit directions…" className="text-sm" />
                  </div>
                </div>
              )}

              {event.tips && (
                <div>
                  <div className="text-white/35 text-[10px] uppercase tracking-widest mb-1 font-semibold">💡 Tips</div>
                  <div className="text-yellow-200/60 text-sm leading-relaxed">
                    <EditableField value={event.tips} onSave={save("tips")} multiline placeholder="Tips…" className="text-sm" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Day panel ────────────────────────────────────────────────────────────────
function DayPanel({
  day,
  mode,
  onUpdateEvent,
}: {
  day: TaipeiDay;
  mode: "real" | "fake";
  onUpdateEvent: (id: string, data: Partial<TaipeiEvent>) => void;
}) {
  const visibleEvents = mode === "fake"
    ? day.events.filter((ev) => !ev.realOnly)
    : day.events;

  const focus = mode === "fake" && day.fakeFocus ? day.fakeFocus : day.focus;

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="bg-sky-500 text-white text-xs font-bold px-3 py-1 rounded-full">{day.label}</span>
          <span className="text-white/50 text-sm">{day.date}</span>
        </div>
        <h2 className="text-white font-bold text-xl mt-2">{focus}</h2>
        {day.notes && (
          <p className="text-yellow-200/70 text-sm mt-1 bg-yellow-500/10 rounded-lg px-3 py-2 border border-yellow-500/20">
            📝 {day.notes}
          </p>
        )}
      </div>

      <div className="space-y-4 border-l-2 border-white/10 pl-2 ml-3">
        {visibleEvents.map((ev) => (
          <EventCard
            key={ev.id}
            event={ev}
            onUpdateEvent={onUpdateEvent}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function TaipeiSchedule() {
  const { mode } = useMode();
  const [days, setDays] = useState<TaipeiDay[]>([]);
  const [activeDay, setActiveDay] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/taipei/days?mode=${mode}`)
      .then((r) => r.json())
      .then((data) => {
        setDays(data);
        setLoading(false);
      });
  }, [mode]);

  const updateEvent = useCallback(async (id: string, data: Partial<TaipeiEvent>) => {
    setSaving(true);
    const res = await fetch("/api/taipei/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    const updated = await res.json();
    setSaving(false);
    setDays((prev) =>
      prev.map((day) => ({
        ...day,
        events: day.events.map((ev) => (ev.id === id ? { ...ev, ...updated } : ev)),
      }))
    );
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white/50 text-lg">Loading itinerary…</div>
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-white/50 text-lg">No itinerary data yet.</div>
        <button
          onClick={async () => {
            setLoading(true);
            await fetch("/api/taipei/seed", { method: "POST" });
            const data = await fetch("/api/taipei/days").then((r) => r.json());
            setDays(data);
            setLoading(false);
          }}
          className="bg-sky-500 hover:bg-sky-400 text-white px-6 py-2 rounded-full font-semibold transition-colors"
        >
          Load Trip Data
        </button>
      </div>
    );
  }

  const current = days[activeDay];

  return (
    <div>
      {saving && (
        <div className="fixed top-20 right-4 bg-sky-500/90 text-white text-xs px-3 py-1.5 rounded-full z-50 shadow-lg">
          Saving…
        </div>
      )}

      {/* Tab strip — image tiles */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-hide">
        {days.map((day, i) => {
          const active = i === activeDay;
          const src = dayImg(day.dayNum, mode);
          return (
            <button
              key={day.id}
              onClick={() => setActiveDay(i)}
              className={`flex-shrink-0 flex flex-col items-center gap-1.5 p-1.5 rounded-xl transition-all border ${
                active
                  ? "border-sky-400 shadow-lg shadow-sky-500/30 bg-sky-500/20"
                  : "border-white/10 hover:border-white/30 bg-white/5"
              }`}
            >
              <div className={`relative w-14 h-14 rounded-lg overflow-hidden transition-all ${active ? "" : "opacity-60 hover:opacity-90"}`}>
                <Image src={src} alt={day.label} fill className="object-cover" />
              </div>
              <div className="text-center leading-tight">
                <div className={`text-xs font-semibold ${active ? "text-sky-300" : "text-white/60"}`}>{day.label}</div>
                <div className="text-[10px] text-white/35">{day.date.split(",")[1]?.trim().split(" ").slice(0, 2).join(" ") || ""}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Content — padded right so text doesn't go under the photo column */}
      <div className="pr-[116px] xl:pr-0">
        {current && (
          <DayPanel
            day={current}
            mode={mode}
            onUpdateEvent={updateEvent}
          />
        )}

        <p className="text-center text-white/20 text-xs mt-12">
          Click any field to edit it live · Changes save instantly to the database
        </p>
      </div>
    </div>
  );
}
