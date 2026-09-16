/* ------------------------------------------------------------------
   CanvasBoard – live-updating drawing canvas + metrics
-------------------------------------------------------------------*/
"use client";

import { useEffect, useRef, useState } from "react";
import { mutate as mutateGlobal } from "swr";
import { ArrowLeft, Eraser, Save, Trash2, RotateCcw } from "lucide-react";
import { SIGN_CONFIG } from "@/config/signs";
import { drawPaintStroke, type PaintPoint } from "@/lib/paint";

/* ---------- types & constants ---------- */
type Point = PaintPoint;
type Stroke = { pts: Point[]; color: string; width: number; erase?: boolean; submissionId?: string };

// Add history state type
type CanvasState = {
  pendingStrokes: Stroke[];
  action: 'draw' | 'clear' | 'save';
};

const COLORS = [
  "#ffffff", "#000000", "#ff0000",
  "#00a83e", "#0055ff", "#ffa800", "#9400d3",
];
interface CanvasBoardProps {
  visits: number;
  clicks: number;
  mouseMiles: number;
  embedded?: boolean;
  onBack?: () => void;
}

/* ================================================================= */
export default function CanvasBoard({ visits, clicks, mouseMiles, embedded = false, onBack }: CanvasBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [pending, setPending] = useState<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[1]);
  const [size, setSize] = useState(6);
  const [eraser, setEraser] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedModal, setSavedModal] = useState(false);

  // Add history state
  const [history, setHistory] = useState<CanvasState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Helper function to save current state to history
  const saveToHistory = (action: 'draw' | 'clear' | 'save') => {
    const currentState: CanvasState = {
      pendingStrokes: [...pending],
      action
    };

    setHistory(prev => {
      // Remove any future history if we're not at the end
      const newHistory = prev.slice(0, historyIndex + 1);
      // Add new state
      newHistory.push(currentState);
      // Limit history to last 50 states to prevent memory issues
      return newHistory.slice(-50);
    });

    setHistoryIndex(prev => Math.min(prev + 1, 49));
  };

  /* ---------- Hi-DPI square canvas ---------- */
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    const setup = () => {
      const w = cvs.clientWidth;
      const h = cvs.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      cvs.width = w * dpr;
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
  }, [redraw]);

  useEffect(redraw, [pending, redraw]);

  /* ---------- prevent scroll during canvas interaction ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Prevent all touch-based scrolling on the canvas itself
    const preventCanvasScroll = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // Add touch event listeners directly to canvas
    canvas.addEventListener('touchstart', preventCanvasScroll, { passive: false });
    canvas.addEventListener('touchmove', preventCanvasScroll, { passive: false });
    canvas.addEventListener('touchend', preventCanvasScroll, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', preventCanvasScroll);
      canvas.removeEventListener('touchmove', preventCanvasScroll);
      canvas.removeEventListener('touchend', preventCanvasScroll);
    };
  }, []);

  /* ---------- pointer helpers ---------- */
  const loc = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const pointer = e.nativeEvent as PointerEvent;
    return {
      x: pointer.offsetX,
      y: pointer.offsetY,
      pressure: pointer.pressure && pointer.pressure > 0 ? pointer.pressure : 0.62,
    };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // Prevent any default touch behaviors
    const stroke: Stroke = { pts: [loc(e)], color, width: size, erase: eraser };
    currentRef.current = stroke;
    setPending(lst => [...lst, stroke]);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // Prevent any default touch behaviors
    const stroke = currentRef.current;
    if (!stroke) return;
    stroke.pts.push(loc(e));
    redraw();
  };

  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // Prevent any default touch behaviors
    currentRef.current = null;
  };

  /* ---------- actions ---------- */
  const save = async () => {
    if (!pending.length || saving) return;

    // Save current state before making changes
    saveToHistory('save');
    setSaving(true);
    setSaveError(null);

    const strokesToSave = pending;
    const canvasSize = Math.round(canvasRef.current?.clientWidth || SIGN_CONFIG.canvasWidth);
    const canvasHeight = Math.round(canvasRef.current?.clientHeight || SIGN_CONFIG.canvasHeight);

    try {
      const galleryResponse = await fetch("/api/drawing-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "", strokes: strokesToSave, canvasSize, canvasHeight }),
      });

      const galleryBody = await galleryResponse.json().catch(() => null);

      if (!galleryResponse.ok) {
        throw new Error(galleryBody?.error || "Could not upload drawing.");
      }

      currentRef.current = null;
      setPending([]);
      setHistory([]);
      setHistoryIndex(-1);
      setSavedModal(true);
      mutateGlobal("/api/drawing-submissions");
      mutateGlobal("/api/drawing-submissions?limit=32");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save drawing.");
    } finally {
      setSaving(false);
    }
  };

  const clearAll = () => {
    // Save current state before clearing
    saveToHistory('clear');

    currentRef.current = null;
    setPending([]);
  };

  const undo = async () => {
    if (pending.length > 0) {
      // If there are pending strokes, remove the last one
      setPending(lst => lst.slice(0, -1));
    } else if (historyIndex >= 0) {
      // If no pending strokes, try to restore from history
      const previousState = history[historyIndex];

      if (previousState) {
        // Restore pending strokes
        setPending(previousState.pendingStrokes);

        setHistoryIndex(prev => prev - 1);
      }
    }
  };

  const selectPaletteColor = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return;

    const button = target.closest<HTMLButtonElement>("[data-canvas-color]");
    const nextColor = button?.dataset.canvasColor;
    if (!nextColor) return;

    setColor(nextColor);
    setEraser(false);
  };

  const handlePalettePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    selectPaletteColor(event.target);
  };

  const handlePaletteClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    selectPaletteColor(event.target);
  };

  /* ---------- drawing ---------- */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  function redraw() {
    const ctx = ctxRef.current, cvs = canvasRef.current;
    if (!ctx || !cvs) return;

    ctx.clearRect(0, 0, cvs.clientWidth || cvs.width, cvs.clientHeight || cvs.height);

    pending.forEach((stroke) => {
      drawPaintStroke(ctx, stroke);
    });
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  /* ---------- UI bits ---------- */
  const toolIconSize = embedded ? 13 : 16;

  const Tools = (
    <div className={embedded ? "flex shrink-0 flex-col items-center gap-1" : "flex flex-col gap-2 h-8"}>
      <div className={embedded ? "flex flex-col items-center gap-1" : "flex items-center gap-2 "}>
        {embedded && onBack && (
          <button title="Back" onClick={onBack} className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-950/20 text-amber-950 hover:bg-amber-950/30">
            <ArrowLeft size={toolIconSize} />
          </button>
        )}
        <button title="Eraser" onClick={() => setEraser(e => !e)}
          className={`${embedded ? "flex h-6 w-6 items-center justify-center" : "p-2 ml-1.5"} rounded-full ${eraser ? "bg-gray-600" : "bg-gray-800"} hover:bg-gray-700`}>
          <Eraser size={toolIconSize} className="text-white" />
        </button>
        <button title="Undo" onClick={undo} className={`${embedded ? "flex h-6 w-6 items-center justify-center" : "p-2 ml-0.5"} bg-yellow-500 hover:bg-yellow-600 rounded-full text-white`}><RotateCcw size={toolIconSize} /></button>
        <button
          title="Save"
          onClick={() => {
            setSaveError(null);
            save();
          }}
          disabled={saving || !pending.length}
          className={`${embedded ? "flex h-6 w-6 items-center justify-center" : "p-2 ml-0.5"} bg-blue-500 hover:bg-blue-600 rounded-full text-white disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Save size={toolIconSize} />
        </button>
        <button title="Clear" onClick={clearAll} className={`${embedded ? "flex h-6 w-6 items-center justify-center" : "p-2 ml-0.5"} bg-red-500 hover:bg-red-600 rounded-full text-white`}><Trash2 size={toolIconSize} /></button>
      </div>
    </div>
  );

  const BrushPreview = (
    <div className={embedded ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-950/30 bg-white/70" : "absolute sm:-top-26 sm:right-2 -right-12 w-8 h-8 flex items-center justify-center border-2 rounded-full"}>
      <div
        className="rounded-full transition-all"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: eraser ? "#fffdf4" : color,
          border: eraser ? "1px dashed rgba(120, 53, 15, 0.65)" : undefined,
          maxWidth: "90%",
          maxHeight: "90%",
        }}
      />
    </div>
  );

  const Palette = (
    <div
      className={
        embedded
          ? "relative z-30 grid shrink-0 grid-cols-2 justify-center gap-1 pointer-events-auto"
          : "relative z-30 flex justify-center gap-2 sm:mb-4 pointer-events-auto"
      }
      style={{ touchAction: "manipulation" }}
      onPointerDown={handlePalettePointerDown}
      onClick={handlePaletteClick}
    >
      {COLORS.map(c => (
        <button
          key={c}
          type="button"
          data-canvas-color={c}
          aria-label={`Select ${c}`}
          style={{ backgroundColor: c, borderColor: "white" }}
          className={`${embedded ? "h-5 w-5 border" : "h-6 w-6 border-2"} relative z-30 cursor-pointer rounded-full pointer-events-auto ${!eraser && c === color ? "ring-2 ring-amber-950/70" : ""}`}
        />
      ))}
    </div>
  );

  const Slider = (
    <div className={embedded ? "relative flex h-24 w-8 shrink-0 items-center justify-center" : "relative w-full max-w-[16rem] mx-auto flex items-center sm:mb-2"}>
      <input
        type="range"
        min={2}
        max={40}
        value={size}
        onChange={e => setSize(+e.target.value)}
        className={embedded ? "absolute h-1 w-24 -rotate-90 accent-blue-500" : "h-1 flex-1 accent-blue-500"}
      />

      {!embedded && BrushPreview}
    </div>
  );

  /* ================================================================= */
  /*                              render                               */
  /* ================================================================= */
  return (
    <div className={embedded ? "h-full w-full" : "w-full mb-3"} style={{ touchAction: embedded ? 'none' : 'pan-y' }}>
      {/* Use props in a minimal way to satisfy linter */}
      <div style={{ display: 'none' }}>
        {visits && null}
        {clicks && null}
        {mouseMiles && null}
      </div>
      <div className={embedded ? "h-full w-full" : "flex justify-center w-full"}>
        {/* ------------- card + sidebar wrapper ------------- */}
        <div className={embedded ? "relative h-full w-full" : "relative"} style={{ touchAction: 'none' }}> {/* relative only hugs the card */}
        {/* === Drawing card === */}
        <div
          className={
            embedded
              ? "h-full w-full mx-auto rounded-lg flex flex-row justify-start gap-1 mb-0"
              : "w-full p-4 mx-auto bg-white/10 backdrop-blur-lg shadow-lg border border-white/20 rounded-xl flex flex-col gap-4 mb-0"
          }
          style={{
            maxWidth: embedded ? '100%' : `${SIGN_CONFIG.canvasWidth + 32}px`,
            touchAction: 'none',
            overflowX: 'hidden',
            overflowY: 'hidden'
          }}>
          <div className={embedded ? "flex min-h-0 min-w-0 flex-1 flex-col items-center gap-1" : "contents"}>
            {embedded ? (
              <div
                className="relative z-0 min-h-0 flex-1 self-center"
                style={{
                  aspectRatio: `${SIGN_CONFIG.canvasWidth} / ${SIGN_CONFIG.canvasHeight}`,
                  height: "100%",
                  maxWidth: "100%",
                }}
              >
                <canvas
                  ref={canvasRef}
                  style={{
                    touchAction: 'none',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    WebkitTouchCallout: 'none',
                    overscrollBehavior: 'none',
                  } as React.CSSProperties}
                  className="absolute inset-0 z-0 h-full w-full bg-[#fffdf4] rounded-md border-2 border-amber-900/35 shadow-inner"
                  onPointerDown={start}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerLeave={end}
                  onTouchStart={(e) => e.preventDefault()}
                  onTouchMove={(e) => e.preventDefault()}
                  onTouchEnd={(e) => e.preventDefault()}
                />
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                style={{
                  touchAction: 'none',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  WebkitTouchCallout: 'none',
                  overscrollBehavior: 'none',
                  position: 'relative',
                  aspectRatio: `${SIGN_CONFIG.canvasWidth} / ${SIGN_CONFIG.canvasHeight}`,
                  maxWidth: "100%",
                  minHeight: 0,
                } as React.CSSProperties}
                className="w-full bg-[#fffdf4] rounded-md border-2 border-white shadow-inner"
                onPointerDown={start}
                onPointerMove={move}
                onPointerUp={end}
                onPointerLeave={end}
                onTouchStart={(e) => e.preventDefault()}
                onTouchMove={(e) => e.preventDefault()}
                onTouchEnd={(e) => e.preventDefault()}
              />
            )}
          </div>
          <div
            id="ios-controls"
            className={embedded ? "relative z-30 flex h-full w-14 shrink-0 flex-col items-center justify-center gap-2 rounded-md bg-amber-950/10 px-1 py-2" : "relative z-30 sm:hidden flex flex-col items-center gap-4"}
            style={{ touchAction: 'manipulation' }}
          >
            {embedded ? (
              <>
                {Tools}
                {Palette}
                {Slider}
                {BrushPreview}
              </>
            ) : (
              <>
                {Palette}
                {Slider}
                <div className="flex justify-center">{Tools}</div>
              </>
            )}
          </div>
        </div>

        {saveError && (
          <p className={embedded ? "absolute bottom-1 left-2 right-16 z-40 truncate rounded bg-red-100/90 px-2 py-1 text-left text-[10px] font-semibold text-red-700" : "mt-2 text-sm text-red-200"}>
            {saveError}
          </p>
        )}

        {/* === Sidebar === */}
        <div
          id="sidebar"
          className={embedded ? "hidden" : "hidden sm:flex flex-col gap-4 w-58 absolute left-full ml-6 top-0"}>
          <div className="p-2 bg-white/20 rounded">{Tools}</div>
          <div className="p-2 bg-white/20 rounded">
            {Palette}
            {Slider}
          </div>
        </div>
        </div>
      </div>

      {savedModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="doodle-saved-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSavedModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 text-gray-900 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="doodle-saved-title" className="text-lg font-semibold">
              Saved to the doodle wall
            </h2>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSavedModal(false)}
                className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}