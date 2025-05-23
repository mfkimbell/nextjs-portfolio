/* ------------------------------------------------------------------
   src/components/CanvasBoard.tsx
   • Shows visits & mouse‑miles as icons alongside Save/Clear
   • Slider container capped at 16rem so it won’t push layout
   • Canvas still Hi‑DPI & fixed 160px height
-------------------------------------------------------------------*/
"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import {
  Eraser,
  Save,
  Trash2,
  Eye,
  MousePointer,
} from "lucide-react";

type Point  = { x: number; y: number };
type Stroke = { pts: Point[]; color: string; width: number; erase?: boolean };

const COLORS = [
  "#ffffff", "#000000", "#ff0000",
  "#00a83e", "#0055ff", "#ffa800", "#9400d3",
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface CanvasBoardProps {
  visits: number;
  mouseMiles: number;
}

export default function CanvasBoard({
  visits,
  mouseMiles,
}: CanvasBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef    = useRef<CanvasRenderingContext2D | null>(null);

  const { data, mutate } = useSWR<{ strokes: Stroke[] }>(
    "/api/drawings",
    fetcher,
    { refreshInterval: 3000 }
  );

  const [pending, setPending] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [color,   setColor]   = useState(COLORS[1]);
  const [size,    setSize]    = useState(6);
  const [eraser,  setEraser]  = useState(false);

  // Setup Hi‑DPI canvas backing store
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    const setup = () => {
      const w = cvs.clientWidth;
      const h = 160;
      const dpr = window.devicePixelRatio || 1;

      cvs.width  = w * dpr;
      cvs.height = h * dpr;

      ctx.resetTransform();
      ctx.scale(dpr, dpr);
      ctx.lineCap = ctx.lineJoin = "round";
      ctxRef.current = ctx;
      redraw();
    };

    setup();
    window.addEventListener("resize", setup);
    return () => window.removeEventListener("resize", setup);
  }, []);

  useEffect(redraw, [data, pending]);

  // Pointer handlers
  const start = (e: React.PointerEvent) =>
    setCurrent({ pts: [loc(e)], color, width: size, erase: eraser });
  const move = (e: React.PointerEvent) => {
    if (!current) return;
    const p = loc(e);
    const next = { ...current, pts: [...current.pts, p] };
    setPending((lst) => lst.filter((s) => s !== current).concat(next));
    setCurrent(next);
  };
  const end = () => {
    if (current) setPending((lst) => [...lst, current]);
    setCurrent(null);
  };

  // Save & Clear
  const save = async () => {
    if (!pending.length) return;
    await fetch("/api/drawings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newStrokes: pending }),
    });
    setPending([]);
    mutate();
  };
  const clear = async () => {
    await fetch("/api/drawings", { method: "DELETE" });
    setPending([]);
    mutate([], false);
  };

  return (
    <div className="w-full max-w-[24rem] mx-auto px-3 py-4
                    bg-white/10 backdrop-blur-lg shadow-lg border border-white/20
                    rounded-xl flex flex-col gap-3 overflow-visible mb-20">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-[160px] bg-transparent rounded-md border-2 border-white touch-none"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />

      {/* Color Palette & Eraser */}
      <div className="flex flex-wrap justify-center gap-1">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => { setColor(c); setEraser(false); }}
            className={`h-6 w-6 rounded-full border-2 transition
                        ${!eraser && c === color ? "ring-2 ring-white" : ""}`}
            style={{ backgroundColor: c, borderColor: "white" }}
          />
        ))}
        <button
          onClick={() => setEraser(true)}
          className={`h-6 w-6 flex items-center justify-center rounded-full
                      bg-gray-800 border-2 border-white transition
                      ${eraser ? "ring-2 ring-white" : ""}`}
        >
          <Eraser size={12} className="text-white" />
        </button>
      </div>

      {/* Slider + Preview (capped width) */}
      <div className="relative w-full max-w-[16rem] mx-auto flex items-center">
        <input
          type="range"
          min={2}
          max={40}
          value={size}
          onChange={(e) => setSize(+e.target.value)}
          className="flex-1 accent-blue-500 h-1"
        />
        <div className="absolute -top-11 -right-12 flex items-center justify-center">
          <div
            className="rounded-full bg-white"
            style={{ width: size, height: size }}
          />
        </div>
      </div>

      {/* Metrics + Save/Clear */}
      <div className="flex justify-around items-center text-white text-sm">
        <div className="flex items-center gap-1">
          <Eye size={16} /> <span>{visits.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1">
          <MousePointer size={16} />{" "}
          <span>{mouseMiles.toFixed(4).toLocaleString()}</span>
        </div>
        <button
          onClick={save}
          title="Save drawing"
          className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition"
        >
          <Save size={16} />
        </button>
        <button
          onClick={clear}
          title="Clear drawing"
          className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-full transition"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );

  // Map pointer to CSS coordinates
  function loc(e: React.PointerEvent): Point {
    const cvs = canvasRef.current!;
    const rect = cvs.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Draw strokes
  function redraw() {
    const ctx = ctxRef.current;
    const cvs = canvasRef.current;
    if (!ctx || !cvs) return;
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    const base = Array.isArray(data?.strokes) ? data.strokes : [];
    [...base, ...pending].forEach((s) => {
      ctx.lineWidth = s.width;
      ctx.strokeStyle =
        s.erase ? "rgba(0,0,0,1)" : s.color;
      ctx.globalCompositeOperation = s.erase
        ? "destination-out"
        : "source-over";
      ctx.beginPath();
      s.pts.forEach((p, i) =>
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)
      );
      ctx.stroke();
    });

    ctx.globalCompositeOperation = "source-over";
  }
}
