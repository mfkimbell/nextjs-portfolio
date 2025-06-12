/* ------------------------------------------------------------------
   CanvasBoard – live-updating drawing canvas + metrics
-------------------------------------------------------------------*/
"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Eraser, Save, Trash2, RotateCcw } from "lucide-react";

/* ---------- types & constants ---------- */
type Point = { x: number; y: number };
type Stroke = { pts: Point[]; color: string; width: number; erase?: boolean };

const COLORS = [
  "#ffffff", "#000000", "#ff0000",
  "#00a83e", "#0055ff", "#ffa800", "#9400d3",
];
const fetcher = (url: string) => fetch(url).then(r => r.json());

interface CanvasBoardProps {
  visits: number;
  clicks: number;
  mouseMiles: number;
}

/* ================================================================= */
export default function CanvasBoard({ visits, clicks, mouseMiles }: CanvasBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const { data, mutate } = useSWR<{ strokes: Stroke[] }>("/api/drawings", fetcher, { refreshInterval: 3000 });

  const [pending, setPending] = useState<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[1]);
  const [size, setSize] = useState(6);
  const [eraser, setEraser] = useState(false);

  /* ---------- Hi-DPI square canvas ---------- */
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    const setup = () => {
      const w = cvs.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      cvs.width = w * dpr;
      cvs.height = w * dpr;
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

  /* ---------- pointer helpers ---------- */
  const loc = (e: React.PointerEvent<HTMLCanvasElement>): Point =>
    ({ x: (e.nativeEvent as PointerEvent).offsetX, y: (e.nativeEvent as PointerEvent).offsetY });

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke: Stroke = { pts: [loc(e)], color, width: size, erase: eraser };
    currentRef.current = stroke;
    setPending(lst => [...lst, stroke]);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = currentRef.current;
    if (!stroke) return;
    stroke.pts.push(loc(e));
    redraw();
  };

  const end = () => {
    currentRef.current = null;
  };

  /* ---------- actions ---------- */
  const save = async () => {
    if (!pending.length) return;
    await fetch("/api/drawings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newStrokes: pending }),
    });
    setPending([]); mutate();
  };

  const clearAll = async () => {
    await fetch("/api/drawings", { method: "DELETE" });
    setPending([]); mutate([], false);
  };

  const undo = () => setPending(lst => lst.slice(0, -1));

  /* ---------- drawing ---------- */
  function redraw() {
    const ctx = ctxRef.current, cvs = canvasRef.current;
    if (!ctx || !cvs) return;

    ctx.clearRect(0, 0, cvs.width, cvs.height);
    const base = Array.isArray(data?.strokes) ? data!.strokes : [];

    [...base, ...pending].forEach(s => {
      ctx.lineWidth = s.width;
      ctx.strokeStyle = s.erase ? "rgba(0,0,0,1)" : s.color;
      ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
      ctx.beginPath();
      s.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    });
    ctx.globalCompositeOperation = "source-over";
  }

  /* ---------- UI bits ---------- */
  const Tools = (
    <div className="flex flex-col gap-2 h-8">
      <div className="flex items-center gap-2 ">
        <button title="Eraser" onClick={() => setEraser(e => !e)}
          className={`p-2 ml-1.5 rounded-full ${eraser ? "bg-gray-600" : "bg-gray-800"} hover:bg-gray-700`}>
          <Eraser size={16} className="text-white" />
        </button>
        <button title="Undo" onClick={undo} className="p-2 ml-0.5 bg-yellow-500 hover:bg-yellow-600 rounded-full text-white"><RotateCcw size={16} /></button>
        <button title="Save" onClick={save} className="p-2 ml-0.5 bg-blue-500   hover:bg-blue-600   rounded-full text-white"><Save size={16} /></button>
        <button title="Clear" onClick={clearAll} className="p-2 ml-0.5 bg-red-500    hover:bg-red-600    rounded-full text-white"><Trash2 size={16} /></button>
      </div>
    </div>
  );

  const Palette = (
    <div className="flex justify-center gap-2 sm:mb-4">
      {COLORS.map(c => (
        <button
          key={c}
          onClick={() => { setColor(c); setEraser(false); }}
          style={{ backgroundColor: c, borderColor: "white" }}
          className={`h-6 w-6 rounded-full border-2 ${!eraser && c === color ? "ring-2 ring:white" : ""}`}
        />
      ))}
    </div>
  );

  const Slider = (
    <div className="relative w-full max-w-[16rem] mx-auto flex items-center sm:mb-2">
      {/* range track */}
      <input
        type="range"
        min={2}
        max={40}
        value={size}
        onChange={e => setSize(+e.target.value)}
        className="flex-1 accent-blue-500 h-1"
      />

      {/* fixed 48×48 wrapper keeps the center locked */}
      <div className="absolute sm:-top-26  sm:right-2 -right-12 w-8 h-8 flex items-center justify-center border-2 rounded-full">
        <div
          className="rounded-full transition-all"
          style={{
            width: `${size}px`,
            height: `${size}px`,
            backgroundColor: color,
            maxWidth: '90%',
            maxHeight: '90%',
          }}
        />
      </div>
    </div>
  );

  /* ================================================================= */
  /*                              render                               */
  /* ================================================================= */
  return (
    <div className="flex justify-center w-full mb-3">
      {/* ------------- card + sidebar wrapper ------------- */}
      <div className="relative"> {/* relative only hugs the card */}
        {/* === Drawing card === */}
        <div
          className="w-full max-w-[24rem] p-4 mx-auto
                     bg-white/10 backdrop-blur-lg shadow-lg border border-white/20
                     rounded-xl flex flex-col gap-4 mb-0">
          <canvas
            ref={canvasRef}
            style={{ touchAction: 'none' }}
            className="w-full aspect-square bg-transparent rounded-md border-2 border-white"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
          />
          <div id="ios-controls" className="sm:hidden flex flex-col items-center gap-4">
            {Palette}
            {Slider}

            <div className="flex justify-center">{Tools}</div>
          </div>
        </div>

        {/* === Sidebar === */}
        <div
          id="sidebar"
          className="hidden sm:flex flex-col gap-4 w-58
                     absolute left-full ml-6 top-0">
          <div className="p-2 bg-white/20 rounded">{Tools}</div>
          <div className="p-2 bg-white/20 rounded">
            {Palette}
            {Slider}
          </div>
        </div>
      </div>
    </div>
  );
}