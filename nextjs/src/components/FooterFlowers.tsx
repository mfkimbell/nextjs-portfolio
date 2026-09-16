"use client";

import Image from "next/image";
import { useRef, useState, type PointerEvent, type CSSProperties } from "react";
import {
  FOOTER_FLOWERS,
  FOOTER_FLOWERS_SHOW_LABELS,
  type FooterFlowerPlacement,
} from "@/config/footerFlowers";

export type FooterFlowersProps = {
  depthToZ: (depth: number) => number;
  /**
   * Scene-lock cap in px. Matches `grassMaxWidthPx` in ForestFooter so flower
   * xPct/sizePct percentages measure against the same capped reference the
   * grass blades do — never against raw viewport width. Without this, flowers
   * would grow linearly with viewport above the cap while blades pin, and the
   * two would visually decouple on wide monitors.
   */
  maxWidthPx: number;
  placements?: FooterFlowerPlacement[];
  showLabels?: boolean;
};

const nextId = (list: FooterFlowerPlacement[]) =>
  list.reduce((max, p) => Math.max(max, p.id), 0) + 1;

const toTsConfig = (list: FooterFlowerPlacement[]) => {
  const entry = (p: FooterFlowerPlacement) =>
    `  {\n` +
    `    id: ${p.id},\n` +
    `    src: "${p.src}",\n` +
    `    xPct: ${p.xPct.toFixed(2)},\n` +
    `    yPct: ${p.yPct.toFixed(2)},\n` +
    `    sizePct: ${p.sizePct.toFixed(2)},\n` +
    `    rotationDeg: ${p.rotationDeg.toFixed(1)},\n` +
    (p.flipX ? `    flipX: true,\n` : "") +
    `    depth: ${p.depth},\n` +
    `  },`;
  return (
    `export const FOOTER_FLOWERS: FooterFlowerPlacement[] = [\n` +
    list.map(entry).join("\n") +
    `\n];\n`
  );
};

const btnStyle: CSSProperties = {
  background: "#1a1a1a",
  color: "#fff5a8",
  border: "1px solid #444",
  padding: "3px 8px",
  borderRadius: 3,
  fontFamily: "monospace",
  fontSize: 12,
  cursor: "pointer",
};

export default function FooterFlowers({
  depthToZ,
  maxWidthPx,
  placements: initial = FOOTER_FLOWERS,
  showLabels = FOOTER_FLOWERS_SHOW_LABELS,
}: FooterFlowersProps) {
  const [placements, setPlacements] =
    useState<FooterFlowerPlacement[]>(initial);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [copyStatus, setCopyStatus] = useState<string>("copy config");
  const [saveStatus, setSaveStatus] = useState<string>("save to config");
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; rect: DOMRect } | null>(null);

  const editing = showLabels;
  const selected = placements.find((p) => p.id === selectedId) ?? null;

  const updateSelected = (patch: Partial<FooterFlowerPlacement>) => {
    if (!selected) return;
    setPlacements((list) =>
      list.map((p) => (p.id === selected.id ? { ...p, ...patch } : p))
    );
  };

  const duplicate = () => {
    if (!selected) return;
    const id = nextId(placements);
    const copy: FooterFlowerPlacement = {
      ...selected,
      id,
      xPct: Math.min(100, selected.xPct + 4),
    };
    setPlacements((list) => [...list, copy]);
    setSelectedId(id);
  };

  const remove = () => {
    if (!selected) return;
    setPlacements((list) => list.filter((p) => p.id !== selected.id));
    setSelectedId(null);
  };

  const onFlowerPointerDown =
    (id: number) => (e: PointerEvent<HTMLDivElement>) => {
      if (!editing) return;
      e.stopPropagation();
      setSelectedId(id);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      dragRef.current = { id, rect };
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    };

  const onContainerPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { rect } = drag;
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    setPlacements((list) =>
      list.map((p) =>
        p.id === drag.id
          ? {
              ...p,
              xPct: Math.max(0, Math.min(100, xPct)),
              yPct: Math.max(0, Math.min(120, yPct)),
            }
          : p
      )
    );
  };

  const onContainerPointerUp = () => {
    dragRef.current = null;
  };

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(toTsConfig(placements));
      setCopyStatus("copied!");
    } catch {
      setCopyStatus("copy failed");
    }
    setTimeout(() => setCopyStatus("copy config"), 1500);
  };

  const saveToConfig = async () => {
    setSaveStatus("saving…");
    try {
      const res = await fetch("/api/dev/footer-flowers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ placements }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setSaveStatus("saved ✓");
    } catch (err) {
      setSaveStatus(`save failed`);
      console.error(err);
    }
    setTimeout(() => setSaveStatus("save to config"), 1500);
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 flex justify-center"
      style={{ pointerEvents: editing ? "auto" : "none" }}
    >
      <div
        ref={containerRef}
        className="relative h-full w-full"
        style={{
          maxWidth: maxWidthPx,
          pointerEvents: editing ? "auto" : "none",
        }}
        onPointerMove={onContainerPointerMove}
        onPointerUp={onContainerPointerUp}
        onPointerCancel={onContainerPointerUp}
      >
      {placements.map((p) => (
        <div
          key={`vis-${p.id}`}
          className="pointer-events-none absolute"
          style={{
            left: `${p.xPct}%`,
            top: `${p.yPct}%`,
            width: `${p.sizePct}%`,
            transform: `translate(-50%, -100%) rotate(${p.rotationDeg}deg)${
              p.flipX ? " scaleX(-1)" : ""
            }`,
            zIndex: depthToZ(p.depth),
          }}
        >
          <Image
            src={p.src}
            alt=""
            width={800}
            height={1200}
            sizes="10vw"
            className="pointer-events-none h-auto w-full select-none"
            draggable={false}
          />
        </div>
      ))}

      {/* Edit-mode hitboxes: always on top of grass so clicks/drag work
          regardless of the visible flower's depth z-index. */}
      {editing &&
        placements.map((p) => {
          const isSel = p.id === selectedId;
          return (
            <div
              key={`hit-${p.id}`}
              className="absolute"
              style={{
                left: `${p.xPct}%`,
                top: `${p.yPct}%`,
                width: `${p.sizePct}%`,
                // Match aspect roughly: source images are ~2:3 tall.
                aspectRatio: "2 / 3",
                transform: `translate(-50%, -100%) rotate(${p.rotationDeg}deg)${
                  p.flipX ? " scaleX(-1)" : ""
                }`,
                zIndex: 900000 + (isSel ? 1 : 0),
                cursor: "grab",
                pointerEvents: "auto",
                outline: isSel
                  ? "2px dashed #ffd54a"
                  : "1px dashed rgba(255,213,74,0.35)",
                outlineOffset: 2,
                background: isSel
                  ? "rgba(255,213,74,0.08)"
                  : "rgba(255,213,74,0.02)",
                touchAction: "none",
              }}
              onPointerDown={onFlowerPointerDown(p.id)}
            >
              {showLabels && (
                <div
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                  style={{
                    top: "-1.5em",
                    fontFamily: "monospace",
                    fontSize: "clamp(11px, 1.1vw, 16px)",
                    fontWeight: 700,
                    color: "#fff5a8",
                    background: "rgba(0,0,0,0.65)",
                    padding: "1px 6px",
                    borderRadius: 4,
                    textShadow: "0 1px 2px #000",
                    whiteSpace: "nowrap",
                    transform: p.flipX ? "scaleX(-1)" : undefined,
                  }}
                >
                  #{p.id}
                </div>
              )}
            </div>
          );
        })}

      {editing && selected && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: 12,
            right: 12,
            zIndex: 999999,
            background: "rgba(0,0,0,0.9)",
            color: "#fff5a8",
            padding: 10,
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 12,
            minWidth: 220,
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ marginBottom: 6, fontWeight: 700 }}>
            #{selected.id} — drag flower to move
          </div>
          <div style={{ marginBottom: 4 }}>size {selected.sizePct.toFixed(2)}%</div>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            <button
              style={btnStyle}
              onClick={() =>
                updateSelected({ sizePct: Math.max(0.5, selected.sizePct - 0.5) })
              }
            >
              −
            </button>
            <button
              style={btnStyle}
              onClick={() => updateSelected({ sizePct: selected.sizePct + 0.5 })}
            >
              +
            </button>
            <button
              style={btnStyle}
              onClick={() =>
                updateSelected({ sizePct: Math.max(0.5, selected.sizePct - 0.1) })
              }
            >
              −0.1
            </button>
            <button
              style={btnStyle}
              onClick={() => updateSelected({ sizePct: selected.sizePct + 0.1 })}
            >
              +0.1
            </button>
          </div>

          <div style={{ marginBottom: 4 }}>rot {selected.rotationDeg.toFixed(0)}°</div>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            <button
              style={btnStyle}
              onClick={() =>
                updateSelected({ rotationDeg: selected.rotationDeg - 5 })
              }
            >
              −5°
            </button>
            <button
              style={btnStyle}
              onClick={() =>
                updateSelected({ rotationDeg: selected.rotationDeg + 5 })
              }
            >
              +5°
            </button>
            <button
              style={btnStyle}
              onClick={() => updateSelected({ flipX: !selected.flipX })}
            >
              flip
            </button>
          </div>

          <div style={{ marginBottom: 4 }}>
            grass depth {selected.depth}
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            <select
              value={selected.depth}
              onChange={(e) =>
                updateSelected({ depth: Number(e.target.value) })
              }
              style={{
                ...btnStyle,
                flex: 1,
                cursor: "pointer",
              }}
            >
              <option value={0.5}>0.5 · in front of all grass</option>
              <option value={1.5}>1.5 · behind grass 1</option>
              <option value={2.5}>2.5 · behind grass 2</option>
              <option value={3.5}>3.5 · behind grass 3</option>
              <option value={4.5}>4.5 · behind grass 4</option>
              <option value={5.5}>5.5 · behind grass 5</option>
              <option value={6.5}>6.5 · behind grass 6</option>
              <option value={7.5}>7.5 · behind grass 7</option>
              <option value={8.5}>8.5 · behind grass 8</option>
              <option value={9.5}>9.5 · behind grass 9</option>
              <option value={10.5}>10.5 · behind grass 10</option>
              <option value={11.5}>11.5 · behind grass 11</option>
              <option value={12.5}>12.5 · behind grass 12 (max)</option>
            </select>
            <button
              style={btnStyle}
              onClick={() =>
                updateSelected({ depth: Math.max(0.5, selected.depth - 0.5) })
              }
            >
              −
            </button>
            <button
              style={btnStyle}
              onClick={() =>
                updateSelected({ depth: Math.min(12.5, selected.depth + 0.5) })
              }
            >
              +
            </button>
          </div>

          <div style={{ marginBottom: 8, opacity: 0.7 }}>
            x {selected.xPct.toFixed(1)}, y {selected.yPct.toFixed(1)}
          </div>

          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            <button style={btnStyle} onClick={duplicate}>
              duplicate
            </button>
            <button style={btnStyle} onClick={remove}>
              delete
            </button>
            <button style={btnStyle} onClick={() => setSelectedId(null)}>
              deselect
            </button>
          </div>

          <div style={{ display: "flex", gap: 4 }}>
            <button
              style={{ ...btnStyle, flex: 1, background: "#1a3a5a" }}
              onClick={copyConfig}
            >
              {copyStatus}
            </button>
            <button
              style={{
                ...btnStyle,
                flex: 1,
                background: "#2a4a1a",
                fontWeight: 700,
              }}
              onClick={saveToConfig}
            >
              {saveStatus}
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
