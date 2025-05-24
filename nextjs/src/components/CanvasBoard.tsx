/* ------------------------------------------------------------------
   CanvasBoard – live-updating drawing canvas + metrics
-------------------------------------------------------------------*/
"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Eraser, Save, Trash2, RotateCcw } from "lucide-react";

/* ---------- types & constants ---------- */
type Point  = { x: number; y: number };
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
  const ctxRef    = useRef<CanvasRenderingContext2D | null>(null);
  const { data, mutate } = useSWR<{ strokes: Stroke[] }>("/api/drawings", fetcher, { refreshInterval: 3000 });

  const [pending, setPending] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [color,   setColor]   = useState(COLORS[1]);
  const [size,    setSize]    = useState(6);
  const [eraser,  setEraser]  = useState(false);

  /* ---------- Hi-DPI square canvas ---------- */
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    const setup = () => {
      const w   = cvs.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      cvs.width  = w * dpr;
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
  const loc   = (e: React.PointerEvent<HTMLCanvasElement>): Point =>
    ({ x: (e.nativeEvent as PointerEvent).offsetX, y: (e.nativeEvent as PointerEvent).offsetY });

  const start = (e: React.PointerEvent<HTMLCanvasElement>) =>
    setCurrent({ pts: [loc(e)], color, width: size, erase: eraser });

  const move  = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!current) return;
    const next = { ...current, pts: [...current.pts, loc(e)] };
    setPending(lst => lst.filter(s => s !== current).concat(next));
    setCurrent(next);
  };

  const end   = () => {
    if (current) setPending(lst => [...lst, current]);
    setCurrent(null);
  };

  /* ---------- actions ---------- */
  const save = async () => {
    if (!pending.length) return;
    await fetch("/api/drawings", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ newStrokes: pending }),
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
      ctx.lineWidth   = s.width;
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button title="Eraser" onClick={() => setEraser(e => !e)}
          className={`p-2 rounded-full ${eraser ? "bg-gray-600" : "bg-gray-800"} hover:bg-gray-700`}>
          <Eraser size={16} className="text-white" />
        </button>
        <button title="Undo"  onClick={undo}      className="p-2 bg-yellow-500 hover:bg-yellow-600 rounded-full text-white"><RotateCcw size={16}/></button>
        <button title="Save"  onClick={save}     className="p-2 bg-blue-500   hover:bg-blue-600   rounded-full text-white"><Save   size={16}/></button>
        <button title="Clear" onClick={clearAll} className="p-2 bg-red-500    hover:bg-red-600    rounded-full text-white"><Trash2 size={16}/></button>
      </div>
    
    </div>
  );

  const Palette = (
    <div className="flex justify-center gap-2 mb-2">
      {COLORS.map(c => (
        <button
          key={c}
          onClick={() => { setColor(c); setEraser(false); }}
          style={{ backgroundColor: c, borderColor: "white" }}
          className={`h-6 w-6 rounded-full border-2 ${!eraser && c === color ? "ring-2 ring-white" : ""}`}
        />
      ))}
    </div>
  );

  const Slider = (
    <div className="relative w-full max-w-[14rem] mx-auto flex items-center">
      <input
        type="range" min={2} max={40}
        value={size} onChange={e => setSize(+e.target.value)}
        className="flex-1 accent-blue-500 h-1"
      />
      <div className="absolute -top-5 -right-14 w-10 h-10 flex items-center justify-center">
        <div className="rounded-full transition-all"
             style={{ width: `${size}px`, height: `${size}px`, backgroundColor: color }} />
      </div>
    </div>
  );

  /* ================================================================= */
  /*                              render                               */
  /* ================================================================= */
  return (
    <div className="flex justify-center w-full">
      {/* ------------- card + sidebar wrapper ------------- */}
      <div className="relative"> {/* relative only hugs the card */}  {/* ⬅ key */}
        {/* === Drawing card === */}
        <div
          className="w-full max-w-[24rem] p-4 mx-auto
                     bg-white/10 backdrop-blur-lg shadow-lg border border-white/20
                     rounded-xl flex flex-col gap-4 mb-0">
          <canvas
            ref={canvasRef}
            className="w-full aspect-square bg-transparent rounded-md border-2 border-white touch-none"
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
          className="hidden sm:flex flex-col gap-4 w-40
                     absolute left-full ml-6 top-0"   /* anchored to card edge */
        >
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
