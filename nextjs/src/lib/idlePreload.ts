import { useGLTF } from "@react-three/drei";

/**
 * Model preloads that wait their turn. A module-scope useGLTF.preload starts
 * downloading the moment the file is imported - with ~70 of them that was
 * every model for all three scenes (and a few unused ones) fighting the
 * campfire for bandwidth on first load, which on a phone meant a long wait
 * before anything showed. These queue up and start a few seconds after the
 * page has loaded, a couple at a time, when the browser is idle. Anything the
 * visible scene needs is fetched straight away by its own useGLTF anyway.
 */
const queue: string[] = [];
let started = false;
let inFlight = 0;
const MAX_PARALLEL = 2;

function pump() {
  while (inFlight < MAX_PARALLEL && queue.length) {
    const url = queue.shift()!;
    inFlight += 1;
    try { useGLTF.preload(url); } catch { /* ignore */ }
    // drei doesn't hand back a promise; space them out instead
    window.setTimeout(() => { inFlight -= 1; schedule(); }, 700);
  }
}
function schedule() {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(pump, { timeout: 2000 }); else window.setTimeout(pump, 200);
}
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const go = () => window.setTimeout(schedule, 4000);
  if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
}

export function idlePreload(url: string) {
  if (typeof window === "undefined") return;
  if (!queue.includes(url)) queue.push(url);
  start();
}
