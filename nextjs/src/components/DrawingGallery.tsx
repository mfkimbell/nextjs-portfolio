"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import useSWR, { mutate as mutateGlobal } from "swr";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { SIGN_CONFIG } from "@/config/signs";
import type { FooterSignsLayout } from "@/config/responsiveLayout";
import { drawPaintStroke, type PaintPoint } from "@/lib/paint";

const GALLERY_ENDPOINT = "/api/drawing-submissions";
const PAPER_ROTATIONS = ["-rotate-2", "rotate-1", "-rotate-1"] as const;

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error("Could not load drawing gallery.");
    return response.json();
  });

type Point = PaintPoint;
type Stroke = { pts: Point[]; color: string; width: number; erase?: boolean };
type GalleryDrawing = {
  id: string;
  name: string;
  strokes: Stroke[];
  canvasSize: number;
  canvasHeight: number | null;
  upvotes: number;
  createdAt: string;
};

type GalleryResponse = {
  drawings: GalleryDrawing[];
  limit: number;
  weekWindowDays: number;
};

function DrawingPreview({ drawing }: { drawing: GalleryDrawing }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceWidth = Math.max(100, drawing.canvasSize || 384);
  const sourceHeight = Math.max(100, drawing.canvasHeight || drawing.canvasSize || 384);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const redraw = () => {
      const width = canvas.clientWidth || 240;
      const height = canvas.clientHeight || width;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const scaleX = width / sourceWidth;
      const scaleY = height / sourceHeight;

      ctx.save();
      ctx.scale(scaleX, scaleY);

      drawing.strokes.forEach((stroke) => {
        drawPaintStroke(ctx, stroke);
      });

      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    };

    redraw();
    window.addEventListener("resize", redraw);
    return () => window.removeEventListener("resize", redraw);
  }, [drawing, sourceWidth, sourceHeight]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Saved drawing"
      className="block h-full w-full"
    />
  );
}

const GALLERY_SLOTS = 3;

type DrawingGalleryLayout = "inline" | "footerScene";

interface DrawingGalleryProps {
  layout?: DrawingGalleryLayout;
  footerSigns?: FooterSignsLayout;
}

export default function DrawingGallery({ layout = "inline", footerSigns }: DrawingGalleryProps) {
  const { data, error, mutate } = useSWR<GalleryResponse>(
    GALLERY_ENDPOINT,
    fetcher,
    { refreshInterval: 5_000 }
  );
  const [votingId, setVotingId] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [voteNotice, setVoteNotice] = useState<string | null>(null);

  const vote = async (id: string, type: "upvote" | "downvote") => {
    if (votingId === id) return;

    setVotingId(id);
    setVoteError(null);
    setVoteNotice(null);

    // Make the UI feel instant; reconcile with the database afterward.
    if (type === "upvote") {
      void mutate(
        (current) =>
          current
            ? {
                ...current,
                drawings: current.drawings.map((drawing) =>
                  drawing.id === id ? { ...drawing, upvotes: drawing.upvotes + 1 } : drawing
                ),
              }
            : current,
        false
      );
    } else {
      setVoteNotice("This image has been flagged for review and cycled out.");
      void mutate(
        (current) =>
          current
            ? {
                ...current,
                drawings: current.drawings.filter((drawing) => drawing.id !== id),
              }
            : current,
        false
      );
      void mutateGlobal("/api/drawings");
    }

    try {
      const response = await fetch(`/api/drawing-submissions/${id}/${type}`, {
        method: "POST",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Vote failed.");
      }

      await mutate();
    } catch (err) {
      setVoteError(err instanceof Error ? err.message : "Vote failed.");
      await mutate();
    } finally {
      setVotingId(null);
    }
  };

  const drawings = data?.drawings ?? [];
  const slots: (GalleryDrawing | null)[] = Array.from(
    { length: GALLERY_SLOTS },
    (_, index) => drawings[index] ?? null
  );

  const isFooterScene = layout === "footerScene";

  return (
    <div className={isFooterScene ? "pointer-events-none absolute inset-0 z-40" : "w-full max-w-4xl ml-0 mr-auto px-2 pt-0"}>
      <h3 className="sr-only">Weekly doodle wall</h3>

      {voteError && <p className="mb-3 text-left text-sm text-red-200">{voteError}</p>}
      {error && !data && (
        <p className="mb-3 text-center text-sm text-red-200">Could not refresh saved drawings.</p>
      )}

      {voteNotice && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Flagged for review"
          className="fixed inset-0 z-[2500] flex items-center justify-center p-4 pointer-events-auto"
          onClick={() => setVoteNotice(null)}
        >
          <div
            className="max-w-xs rounded-xl border border-amber-900/30 bg-[#b9783d] px-5 py-4 text-center text-amber-950 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-sm font-black uppercase tracking-wide">Flagged for review</p>
            <p className="mt-2 text-xs font-semibold leading-relaxed">{voteNotice}</p>
            <button
              type="button"
              className="mt-4 rounded-lg bg-amber-950/20 px-4 py-1.5 text-xs font-black uppercase tracking-wide hover:bg-amber-950/30"
              onClick={() => setVoteNotice(null)}
            >
              OK
            </button>
          </div>
        </div>
      )}

      <div className={isFooterScene ? "relative h-full w-full" : "flex flex-col sm:flex-row items-end justify-start gap-4 sm:gap-3"}>
        {slots.map((drawing, index) => {
          const disabled = !drawing;
          const voteBoxYOffset = SIGN_CONFIG.voteBoxYOffsetPctBySign[index] ?? 0;
          const articleStyle: CSSProperties = isFooterScene && footerSigns
            ? {
                position: "absolute",
                left: `${footerSigns.leftPctBySign[index] ?? 0}%`,
                bottom: `${footerSigns.bottomPctBySign[index] ?? 0}%`,
                width: `${footerSigns.widthPct}%`,
              }
            : { maxWidth: `${SIGN_CONFIG.signMaxWidthPx}px` };

          return (
            <article
              key={drawing?.id ?? `slot-${index}`}
              className={isFooterScene ? "pointer-events-none" : "flex w-full flex-col items-center"}
              style={articleStyle}
            >
              <div
                className={`relative w-full overflow-hidden rounded-[2px] bg-[#fff4cf] shadow-[0_10px_20px_rgba(71,34,10,0.28)] ring-1 ring-amber-900/15 ${PAPER_ROTATIONS[index % PAPER_ROTATIONS.length]}`}
                style={{
                  aspectRatio: `${SIGN_CONFIG.signImageWidth} / ${SIGN_CONFIG.signImageHeight}`,
                }}
              >
                <div className="pointer-events-none absolute left-1/2 top-1.5 z-20 h-4 w-12 -translate-x-1/2 rotate-1 rounded-sm bg-amber-100/70 shadow-sm ring-1 ring-amber-900/10" />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.34),rgba(255,255,255,0)_42%),radial-gradient(circle_at_20%_20%,rgba(120,67,22,0.08),transparent_28%)]" />
                {/* Drawing — top plaque */}
                <div
                  className="absolute overflow-hidden"
                  style={{
                    top: `${SIGN_CONFIG.drawingInsetTopPct}%`,
                    right: `${SIGN_CONFIG.drawingInsetRightPct}%`,
                    bottom: `${SIGN_CONFIG.drawingInsetBottomPct}%`,
                    left: `${SIGN_CONFIG.drawingInsetLeftPct}%`,
                  }}
                >
                  {drawing && <DrawingPreview drawing={drawing} />}
                </div>
                {/* Votes — lower plank. Each box is anchored to the sign PNG frame. */}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => drawing && vote(drawing.id, "upvote")}
                  className="absolute pointer-events-auto inline-flex items-center justify-center gap-0.5 bg-transparent text-[12px] sm:text-[14px] font-black text-[#5f3014]/85 [filter:drop-shadow(0_1px_0_rgba(239,177,104,0.5))_drop-shadow(0_-1px_0_rgba(79,38,13,0.3))] transition-transform hover:scale-110 active:scale-125 hover:text-[#4a220d]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-950/35 disabled:cursor-not-allowed disabled:opacity-35"
                  style={{
                    top: `${SIGN_CONFIG.upvoteInsetTopPct + voteBoxYOffset}%`,
                    right: `${SIGN_CONFIG.upvoteInsetRightPct}%`,
                    bottom: `${SIGN_CONFIG.upvoteInsetBottomPct - voteBoxYOffset}%`,
                    left: `${SIGN_CONFIG.upvoteInsetLeftPct}%`,
                  }}
                  title={!drawing ? "Empty slot" : "Upvote"}
                >
                  <ThumbsUp className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.4} />
                  {drawing?.upvotes ?? 0}
                </button>

                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => drawing && vote(drawing.id, "downvote")}
                  className="absolute pointer-events-auto inline-flex items-center justify-center bg-transparent text-[#5f3014]/85 [filter:drop-shadow(0_1px_0_rgba(239,177,104,0.5))_drop-shadow(0_-1px_0_rgba(79,38,13,0.3))] transition-transform hover:scale-110 active:scale-125 hover:text-[#4a220d]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-950/35 disabled:cursor-not-allowed disabled:opacity-35"
                  style={{
                    top: `${SIGN_CONFIG.downvoteInsetTopPct + voteBoxYOffset}%`,
                    right: `${SIGN_CONFIG.downvoteInsetRightPct}%`,
                    bottom: `${SIGN_CONFIG.downvoteInsetBottomPct - voteBoxYOffset}%`,
                    left: `${SIGN_CONFIG.downvoteInsetLeftPct}%`,
                  }}
                  title={!drawing ? "Empty slot" : "Downvote/report and hide"}
                >
                  <ThumbsDown className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.4} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
