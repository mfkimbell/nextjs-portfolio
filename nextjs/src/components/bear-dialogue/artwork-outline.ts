"use client";

import { useEffect, useState } from "react";
import type { ArtworkOutline } from "./smokey-icon";

// The silhouette of an icon image, read from its alpha channel.
//
// The text flows around this rather than around the image's square box. Most
// of that box is transparent — the head PNG is 3:2 inside a square, and the
// hat brim is a thin sliver — so a box reserve leaves a band of dead space the
// copy can never reach, however small the margin. Reading the alpha at
// runtime also means the flow stays right when the artwork is swapped, with no
// hand-measured bounds to go stale.
//
// Points are left/right edges of each opaque row, relative to the centre of
// the square box the icon is drawn in (object-contain), in units of that box's
// side. Multiply by the icon size to get em.

const SAMPLE_SIZE = 160;
const ALPHA_CUTOFF = 40;

const cache = new Map<string, Promise<ArtworkOutline | null>>();

function loadOutline(src: string): Promise<ArtworkOutline | null> {
  const cached = cache.get(src);
  if (cached) return cached;
  const pending = new Promise<ArtworkOutline | null>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const naturalW = img.naturalWidth;
        const naturalH = img.naturalHeight;
        if (!naturalW || !naturalH) return resolve(null);
        const scale = SAMPLE_SIZE / Math.max(naturalW, naturalH);
        const w = Math.max(1, Math.round(naturalW * scale));
        const h = Math.max(1, Math.round(naturalH * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        const alpha = ctx.getImageData(0, 0, w, h).data;
        const side = Math.max(w, h);
        const points: [number, number][] = [];
        for (let y = 0; y < h; y += 1) {
          let left = -1;
          let right = -1;
          for (let x = 0; x < w; x += 1) {
            if (alpha[(y * w + x) * 4 + 3] > ALPHA_CUTOFF) {
              if (left < 0) left = x;
              right = x;
            }
          }
          if (left < 0) continue;
          // Both edges of the row, at its top and bottom, so a rotation cannot
          // slip a thin stroke like the brim between two samples.
          for (const yy of [y, y + 1]) {
            const ny = (yy - h / 2) / side;
            points.push([(left - w / 2) / side, ny], [(right + 1 - w / 2) / side, ny]);
          }
        }
        resolve(points.length >= 3 ? points : null);
      } catch {
        resolve(null);
      }
    };
    img.src = src;
  });
  cache.set(src, pending);
  return pending;
}

export function useArtworkOutline(src: string): ArtworkOutline | null {
  const [outline, setOutline] = useState<ArtworkOutline | null>(null);
  useEffect(() => {
    let live = true;
    void loadOutline(src).then((value) => {
      if (live) setOutline(value);
    });
    return () => {
      live = false;
    };
  }, [src]);
  return outline;
}
