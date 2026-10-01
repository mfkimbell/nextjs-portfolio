"use client";

/*
 * The cabin computer's screen: a little '95-style desktop, drawn into a canvas
 * and put on the monitor's glass the same way the arcade CRT draws its menu.
 *
 * Four apps sit on the desktop:
 *   GitHub     opens the GitHub profile in a new tab
 *   LinkedIn   opens the LinkedIn profile in a new tab
 *   Email      a compose window that really sends (see /api/contact)
 *   OnlyBears  a placeholder window for now
 *
 * The desktop is always on the monitor. A click on the computer flies the
 * camera in (CampfireScene owns that) and the desktop starts taking clicks.
 * Back on the taskbar, Shut Down in the Start menu, or Escape flies it back
 * out.
 *
 * Everything on the glass is a pure function of (state, t): the controller
 * below keeps the state in a ref so typing a message does not re-render the
 * scene once per keystroke, and the texture reads it at 24fps.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/* --- where things go ------------------------------------------------------ */

export const PC_GITHUB_URL = "https://github.com/mfkimbell";
export const PC_LINKEDIN_URL = "https://www.linkedin.com/in/kimbell151/";
export const PC_EMAIL_TO = "mfkimbell@gmail.com";

/* --- state ---------------------------------------------------------------- */

export type PcApp = "github" | "linkedin" | "email" | "onlybears";
export type PcWindow = "email" | "onlybears" | null;
export type PcField = "from" | "subject" | "body";
export type PcSend = "idle" | "sending" | "sent" | "error";

export type PcHit =
  | { kind: "icon"; app: PcApp }
  | { kind: "start" }
  | { kind: "back" }
  | { kind: "startItem"; item: PcApp | "shutdown" }
  | { kind: "task" }
  | { kind: "close" }
  | { kind: "field"; field: PcField }
  | { kind: "send" }
  | { kind: "cancel" }
  | { kind: "window" }
  | { kind: "desktop" };

export type PcState = {
  /** Zoomed in: the desktop is live. False = the screensaver. */
  focused: boolean;
  hover: PcHit | null;
  selected: PcApp | null;
  window: PcWindow;
  startOpen: boolean;
  field: PcField | null;
  from: string;
  subject: string;
  body: string;
  send: PcSend;
  /** One short line for the compose window's status bar. */
  note: string;
};

export const PC_INITIAL: PcState = {
  focused: false,
  hover: null,
  selected: null,
  window: null,
  startOpen: false,
  field: null,
  from: "",
  subject: "",
  body: "",
  send: "idle",
  note: "",
};

/* --- layout: 320 x 256 logical pixels (the glass is 5:4) ------------------ */

export const PC_W = 320;
export const PC_H = 256;
const TASK_H = 20;
const TASK_Y = PC_H - TASK_H;
const START = { x: 3, y: TASK_Y + 3, w: 50, h: 15 };
/** "Back", right beside Start: the always-visible way out of the close-up. */
const BACK = { x: 55, y: TASK_Y + 3, w: 42, h: 15 };
const TASKBTN = { x: 101, y: TASK_Y + 3, w: 96, h: 15 };

const APPS: Array<{ app: PcApp; label: string }> = [
  { app: "github", label: "GitHub" },
  { app: "linkedin", label: "LinkedIn" },
  { app: "email", label: "Email" },
  { app: "onlybears", label: "OnlyBears" },
];
const ICON = { x: 10, y: 10, step: 54, size: 32, cellW: 56 };
function iconCell(i: number) {
  const top = ICON.y + i * ICON.step;
  return { x: ICON.x - 2, y: top - 2, w: ICON.cellW, h: ICON.size + 18, top };
}

const EMAIL_WIN = { x: 74, y: 12, w: 236, h: 216 };
const BEARS_WIN = { x: 86, y: 34, w: 206, h: 158 };
const TITLE_H = 14;

function winRect(w: PcWindow) {
  return w === "email" ? EMAIL_WIN : w === "onlybears" ? BEARS_WIN : null;
}
function closeRect(r: { x: number; y: number; w: number }) {
  return { x: r.x + r.w - 15, y: r.y + 3, w: 12, h: 10 };
}
function emailRows() {
  const r = EMAIL_WIN;
  const lx = r.x + 8;
  const bx = r.x + 52;
  const bw = r.w - 60;
  return {
    to: { lx, ly: r.y + TITLE_H + 14, x: bx, y: r.y + TITLE_H + 7, w: bw, h: 13 },
    from: { lx, ly: r.y + TITLE_H + 31, x: bx, y: r.y + TITLE_H + 24, w: bw, h: 13 },
    subject: { lx, ly: r.y + TITLE_H + 48, x: bx, y: r.y + TITLE_H + 41, w: bw, h: 13 },
    body: { x: r.x + 8, y: r.y + TITLE_H + 60, w: r.w - 16, h: r.h - TITLE_H - 60 - 44 },
    send: { x: r.x + r.w - 118, y: r.y + r.h - 38, w: 52, h: 17 },
    cancel: { x: r.x + r.w - 60, y: r.y + r.h - 38, w: 52, h: 17 },
    status: { x: r.x + 3, y: r.y + r.h - 16, w: r.w - 6, h: 13 },
  };
}
const START_MENU_ITEMS: Array<{ item: PcApp | "shutdown"; label: string }> = [
  { item: "github", label: "GitHub" },
  { item: "linkedin", label: "LinkedIn" },
  { item: "email", label: "Email" },
  { item: "onlybears", label: "OnlyBears" },
  { item: "shutdown", label: "Shut Down..." },
];
const START_MENU = { x: 2, w: 124, itemH: 22, banner: 18 };
function startMenuRect() {
  const h = START_MENU_ITEMS.length * START_MENU.itemH + 10;
  return { x: START_MENU.x, y: TASK_Y - h + 1, w: START_MENU.w, h };
}
function startItemRect(i: number) {
  const m = startMenuRect();
  // Shut Down sits under a separator, a few pixels lower than the rest
  const last = i === START_MENU_ITEMS.length - 1;
  return {
    x: m.x + START_MENU.banner + 3,
    y: m.y + 3 + i * START_MENU.itemH + (last ? 4 : 0),
    w: m.w - START_MENU.banner - 6,
    h: START_MENU.itemH - 2,
  };
}

function inside(x: number, y: number, r: { x: number; y: number; w: number; h: number }) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** What is under a point on the glass. Mirrors the draw exactly. */
export function pcHit(u: number, v: number, s: PcState): PcHit {
  const x = u * PC_W;
  const y = (1 - v) * PC_H;

  if (s.startOpen) {
    for (let i = 0; i < START_MENU_ITEMS.length; i += 1) {
      if (inside(x, y, startItemRect(i))) return { kind: "startItem", item: START_MENU_ITEMS[i].item };
    }
    if (inside(x, y, startMenuRect())) return { kind: "window" };
  }
  if (inside(x, y, START)) return { kind: "start" };
  if (inside(x, y, BACK)) return { kind: "back" };
  if (s.window && inside(x, y, TASKBTN)) return { kind: "task" };

  const wr = winRect(s.window);
  if (wr && inside(x, y, wr)) {
    if (inside(x, y, closeRect(wr))) return { kind: "close" };
    if (s.window === "email") {
      const R = emailRows();
      if (inside(x, y, R.from)) return { kind: "field", field: "from" };
      if (inside(x, y, R.subject)) return { kind: "field", field: "subject" };
      if (inside(x, y, R.body)) return { kind: "field", field: "body" };
      if (inside(x, y, R.send)) return { kind: "send" };
      if (inside(x, y, R.cancel)) return { kind: "cancel" };
    } else if (s.window === "onlybears") {
      const ok = { x: wr.x + wr.w / 2 - 26, y: wr.y + wr.h - 26, w: 52, h: 17 };
      if (inside(x, y, ok)) return { kind: "cancel" };
    }
    return { kind: "window" };
  }
  if (y < TASK_Y) {
    for (let i = 0; i < APPS.length; i += 1) {
      if (inside(x, y, iconCell(i))) return { kind: "icon", app: APPS[i].app };
    }
    return { kind: "desktop" };
  }
  return { kind: "window" };
}

/** Whether a hit is something a click does something with. */
export function pcHitIsLive(h: PcHit | null) {
  return !!h && h.kind !== "window" && h.kind !== "desktop";
}

function sameHit(a: PcHit | null, b: PcHit | null) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* --- drawing -------------------------------------------------------------- */

const UI_FONT = 'Tahoma, "MS Sans Serif", "Segoe UI", Verdana, Geneva, sans-serif';
const FACE = "#c0c0c0";
const HI = "#ffffff";
const LO = "#808080";
const DK = "#000000";
const NAVY = "#000080";

type Ctx = CanvasRenderingContext2D;
type Rect = { x: number; y: number; w: number; h: number };

/** The classic two-tone bevel. `inset` flips it for pressed buttons / fields. */
function bevel(c: Ctx, r: Rect, inset = false) {
  const [a, b] = inset ? [LO, HI] : [HI, DK];
  const [a2, b2] = inset ? [DK, "#dfdfdf"] : ["#dfdfdf", LO];
  c.fillStyle = a;
  c.fillRect(r.x, r.y, r.w, 1);
  c.fillRect(r.x, r.y, 1, r.h);
  c.fillStyle = b;
  c.fillRect(r.x, r.y + r.h - 1, r.w, 1);
  c.fillRect(r.x + r.w - 1, r.y, 1, r.h);
  c.fillStyle = a2;
  c.fillRect(r.x + 1, r.y + 1, r.w - 2, 1);
  c.fillRect(r.x + 1, r.y + 1, 1, r.h - 2);
  c.fillStyle = b2;
  c.fillRect(r.x + 1, r.y + r.h - 2, r.w - 2, 1);
  c.fillRect(r.x + r.w - 2, r.y + 1, 1, r.h - 2);
}

function button(c: Ctx, r: Rect, label: string, opts: { pressed?: boolean; hot?: boolean; bold?: boolean; disabled?: boolean } = {}) {
  c.fillStyle = FACE;
  c.fillRect(r.x, r.y, r.w, r.h);
  bevel(c, r, !!opts.pressed);
  c.font = `${opts.bold ? "bold " : ""}8px ${UI_FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  const off = opts.pressed ? 1 : 0;
  if (opts.disabled) {
    c.fillStyle = HI;
    c.fillText(label, r.x + r.w / 2 + 1 + off, r.y + r.h / 2 + 1.5 + off);
    c.fillStyle = LO;
  } else {
    c.fillStyle = DK;
  }
  c.fillText(label, r.x + r.w / 2 + off, r.y + r.h / 2 + 0.5 + off);
  if (opts.hot && !opts.disabled) {
    c.strokeStyle = DK;
    c.lineWidth = 0.5;
    c.setLineDash([1, 1]);
    c.strokeRect(r.x + 3.5, r.y + 3.5, r.w - 7, r.h - 7);
    c.setLineDash([]);
  }
  c.textAlign = "left";
}

function fitText(c: Ctx, s: string, maxW: number) {
  if (c.measureText(s).width <= maxW) return s;
  let out = s;
  while (out.length > 1 && c.measureText(out + "…").width > maxW) out = out.slice(0, -1);
  return out + "…";
}

/** The tail of `s` that fits `maxW` - a field shows the end of what is typed,
 *  where the caret is, the way a real text box scrolls. */
function tailText(c: Ctx, s: string, maxW: number) {
  if (c.measureText(s).width <= maxW) return s;
  let out = s;
  while (out.length > 1 && c.measureText(out).width > maxW) out = out.slice(1);
  return out;
}

function wrap(c: Ctx, text: string, maxW: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (c.measureText(next).width > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
      // a single word wider than the box gets broken by characters
      while (c.measureText(line).width > maxW && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && c.measureText(line.slice(0, cut)).width > maxW) cut -= 1;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

/* --- icon art ------------------------------------------------------------- */

/** The GitHub and LinkedIn marks, straight from /public. */
export const PC_GITHUB_LOGO = "/github.png";
export const PC_LINKEDIN_LOGO = "/linkedin.png";

type IconImages = {
  github: HTMLImageElement | null;
  linkedin: HTMLImageElement | null;
  onlybears: HTMLImageElement | null;
  wallpaper: HTMLImageElement | null;
  startLogo: HTMLImageElement | null;
};

/** The desktop wallpaper's logo. */
export const PC_WALLPAPER = "/desktop.png";

/** The OnlyBears logo: public/onlybears.png cropped to its artwork and cut
 *  down to 192px wide (the original is 1462px and 800KB - a lot to fetch for
 *  a 32px desktop icon). */
export const PC_ONLYBEARS_LOGO = "/onlybears_icon.png";

function plainImage(src: string) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  return img;
}

function drawTile(c: Ctx, x: number, y: number, s: number, bg: string) {
  c.fillStyle = bg;
  c.beginPath();
  const r = 5;
  c.moveTo(x + r, y);
  c.arcTo(x + s, y, x + s, y + s, r);
  c.arcTo(x + s, y + s, x, y + s, r);
  c.arcTo(x, y + s, x, y, r);
  c.arcTo(x, y, x + s, y, r);
  c.closePath();
  c.fill();
  // a hard 1px sheen on top, like a '95 icon's highlight
  c.fillStyle = "rgba(255,255,255,0.22)";
  c.fillRect(x + 4, y + 1, s - 8, 1);
}

function drawAppIcon(c: Ctx, app: PcApp, x: number, y: number, s: number, img: IconImages) {
  if (app === "github" || app === "linkedin") {
    const im = img[app];
    // GitHub's mark is white on transparent, so it sits on a dark tile;
    // LinkedIn's file IS the tile, and is drawn edge to edge.
    const pad = app === "github" ? s * 0.12 : 0;
    if (app === "github") drawTile(c, x, y, s, "#24292f");
    if (im && im.complete && im.naturalWidth) {
      const box = s - pad * 2;
      const k = Math.min(box / im.naturalWidth, box / im.naturalHeight);
      const w = im.naturalWidth * k;
      const h = im.naturalHeight * k;
      c.drawImage(im, x + (s - w) / 2, y + (s - h) / 2, w, h);
    }
    return;
  }
  if (app === "email") {
    // a letter: white envelope with a red stamp
    const ex = x + 2, ey = y + 7, ew = s - 4, eh = s - 13;
    c.fillStyle = "#fdfdf6";
    c.fillRect(ex, ey, ew, eh);
    c.strokeStyle = "#4a4a4a";
    c.lineWidth = 1;
    c.strokeRect(ex + 0.5, ey + 0.5, ew - 1, eh - 1);
    c.beginPath();
    c.moveTo(ex + 0.5, ey + 0.5);
    c.lineTo(ex + ew / 2, ey + eh * 0.58);
    c.lineTo(ex + ew - 0.5, ey + 0.5);
    c.stroke();
    c.fillStyle = "#d8342c";
    c.fillRect(ex + ew - 9, ey + 3, 6, 5);
    c.fillStyle = "#1e5bb8";
    c.fillRect(ex + 4, ey + eh - 7, 12, 1.5);
    c.fillRect(ex + 4, ey + eh - 4, 8, 1.5);
    return;
  }
  // OnlyBears: the logo, contain-fit in the icon's square
  const im = img.onlybears;
  if (!im || !im.complete || !im.naturalWidth) return;
  const k = Math.min(s / im.naturalWidth, s / im.naturalHeight);
  const w = im.naturalWidth * k;
  const h = im.naturalHeight * k;
  c.save();
  // a hard little drop shadow so the blue lifts off the teal wallpaper
  c.shadowColor = "rgba(0,0,0,0.35)";
  c.shadowOffsetX = 1;
  c.shadowOffsetY = 1;
  c.drawImage(im, x + (s - w) / 2, y + (s - h) / 2, w, h);
  c.restore();
}

/** The Start button's mark: the flag from the Meadows 97 wallpaper,
 *  cropped out of public/desktop.png into public/start_logo.png. */
function drawStartLogo(c: Ctx, x: number, y: number, img: IconImages) {
  const im = img.startLogo;
  if (!im || !im.complete || !im.naturalWidth) return;
  const h = 9.5;
  const w = (im.naturalWidth / im.naturalHeight) * h;
  c.drawImage(im, x, y, w, h);
}

/* --- the screens ---------------------------------------------------------- */

function drawWindowFrame(c: Ctx, r: Rect, title: string, active: boolean, closeHot: boolean, icon?: (x: number, y: number) => void) {
  // drop shadow
  c.fillStyle = "rgba(0,0,0,0.35)";
  c.fillRect(r.x + 3, r.y + 3, r.w, r.h);
  c.fillStyle = FACE;
  c.fillRect(r.x, r.y, r.w, r.h);
  bevel(c, r);
  const tb = { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: TITLE_H - 3 };
  const g = c.createLinearGradient(tb.x, 0, tb.x + tb.w, 0);
  g.addColorStop(0, active ? NAVY : "#808080");
  g.addColorStop(1, active ? "#1084d0" : "#b5b5b5");
  c.fillStyle = g;
  c.fillRect(tb.x, tb.y, tb.w, tb.h);
  let tx = tb.x + 3;
  if (icon) { icon(tb.x + 2, tb.y + 1); tx += 11; }
  c.font = `bold 8px ${UI_FONT}`;
  c.textBaseline = "middle";
  c.fillStyle = "#fff";
  c.fillText(fitText(c, title, tb.w - 24), tx, tb.y + tb.h / 2 + 0.5);
  // close box
  const cr = closeRect(r);
  c.fillStyle = FACE;
  c.fillRect(cr.x, cr.y - 1, cr.w, cr.h);
  bevel(c, { x: cr.x, y: cr.y - 1, w: cr.w, h: cr.h }, closeHot);
  c.strokeStyle = DK;
  c.lineWidth = 1.3;
  const o = closeHot ? 0.6 : 0;
  c.beginPath();
  c.moveTo(cr.x + 3.5 + o, cr.y + 1.5 + o); c.lineTo(cr.x + cr.w - 3.5 + o, cr.y + cr.h - 3.5 + o);
  c.moveTo(cr.x + cr.w - 3.5 + o, cr.y + 1.5 + o); c.lineTo(cr.x + 3.5 + o, cr.y + cr.h - 3.5 + o);
  c.stroke();
}

function field(c: Ctx, r: Rect, value: string, active: boolean, t: number, placeholder = "") {
  c.fillStyle = "#fff";
  c.fillRect(r.x, r.y, r.w, r.h);
  bevel(c, r, true);
  c.font = `8px ${UI_FONT}`;
  c.textBaseline = "middle";
  const maxW = r.w - 8;
  if (!value && placeholder && !active) {
    c.fillStyle = "#8a8a8a";
    c.fillText(fitText(c, placeholder, maxW), r.x + 4, r.y + r.h / 2 + 0.5);
    return;
  }
  const shown = tailText(c, value, maxW - 2);
  c.fillStyle = DK;
  c.fillText(shown, r.x + 4, r.y + r.h / 2 + 0.5);
  if (active && Math.floor(t * 2) % 2 === 0) {
    const cx = r.x + 4 + c.measureText(shown).width + 0.5;
    c.fillRect(cx, r.y + 3, 0.8, r.h - 6);
  }
}

function drawEmail(c: Ctx, s: PcState, t: number) {
  const r = EMAIL_WIN;
  const R = emailRows();
  const hv = s.hover;
  drawWindowFrame(c, r, "New Message", true, hv?.kind === "close", (x, y) => {
    c.fillStyle = "#fdfdf6"; c.fillRect(x, y + 1, 9, 7);
    c.strokeStyle = "#333"; c.lineWidth = 0.6; c.strokeRect(x + 0.3, y + 1.3, 8.4, 6.4);
    c.beginPath(); c.moveTo(x, y + 1); c.lineTo(x + 4.5, y + 5); c.lineTo(x + 9, y + 1); c.stroke();
  });

  c.font = `8px ${UI_FONT}`;
  c.textBaseline = "middle";
  c.fillStyle = DK;
  c.fillText("To:", R.to.lx, R.to.ly);
  c.fillText("From:", R.from.lx, R.from.ly);
  c.fillText("Subject:", R.subject.lx, R.subject.ly);

  // To is fixed - it is always me
  c.fillStyle = FACE;
  c.fillRect(R.to.x, R.to.y, R.to.w, R.to.h);
  bevel(c, R.to, true);
  c.fillStyle = "#222";
  c.fillText(PC_EMAIL_TO, R.to.x + 4, R.to.y + R.to.h / 2 + 0.5);

  field(c, R.from, s.from, s.field === "from", t, "your@email.com");
  field(c, R.subject, s.subject, s.field === "subject", t, "Hello!");

  // message body
  const b = R.body;
  c.fillStyle = "#fff";
  c.fillRect(b.x, b.y, b.w, b.h);
  bevel(c, b, true);
  c.save();
  c.beginPath();
  c.rect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
  c.clip();
  c.font = `8px ${UI_FONT}`;
  c.textBaseline = "top";
  const lineH = 10;
  if (!s.body && s.field !== "body") {
    c.fillStyle = "#8a8a8a";
    c.fillText("Write your message here...", b.x + 5, b.y + 5);
  } else {
    const lines = wrap(c, s.body, b.w - 12);
    const fit = Math.max(1, Math.floor((b.h - 8) / lineH));
    const first = Math.max(0, lines.length - fit);
    c.fillStyle = DK;
    for (let i = first; i < lines.length; i += 1) {
      c.fillText(lines[i], b.x + 5, b.y + 5 + (i - first) * lineH);
    }
    if (s.field === "body" && Math.floor(t * 2) % 2 === 0) {
      const last = lines[lines.length - 1] ?? "";
      const lx = b.x + 5 + c.measureText(last).width + 0.5;
      const ly = b.y + 5 + (lines.length - 1 - first) * lineH;
      c.fillRect(lx, ly, 0.8, 8);
    }
  }
  c.restore();

  const sending = s.send === "sending";
  const canSend = !sending && s.send !== "sent";
  button(c, R.send, sending ? "Sending" : "Send", { bold: true, hot: hv?.kind === "send", disabled: !canSend });
  button(c, R.cancel, s.send === "sent" ? "Close" : "Cancel", { hot: hv?.kind === "cancel" });

  // status bar
  const st = R.status;
  c.fillStyle = FACE;
  c.fillRect(st.x, st.y, st.w, st.h);
  bevel(c, st, true);
  c.font = `8px ${UI_FONT}`;
  c.textBaseline = "middle";
  c.fillStyle = s.send === "error" ? "#a00000" : s.send === "sent" ? "#006000" : "#222";
  const dots = sending ? ".".repeat(1 + (Math.floor(t * 3) % 3)) : "";
  const note = s.note || "Type a message and press Send.";
  c.fillText(fitText(c, note + dots, st.w - 8), st.x + 4, st.y + st.h / 2 + 0.5);
}

function drawOnlyBears(c: Ctx, s: PcState, t: number, img: IconImages) {
  const r = BEARS_WIN;
  drawWindowFrame(c, r, "OnlyBears", true, s.hover?.kind === "close");
  const body = { x: r.x + 4, y: r.y + TITLE_H + 3, w: r.w - 8, h: r.h - TITLE_H - 34 };
  const g = c.createLinearGradient(0, body.y, 0, body.y + body.h);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "#dff2fd");
  c.fillStyle = g;
  c.fillRect(body.x, body.y, body.w, body.h);
  bevel(c, body, true);
  const bob = Math.sin(t * 2.4) * 1.5;
  drawAppIcon(c, "onlybears", r.x + r.w / 2 - 24, body.y + 6 + bob, 48, img);
  c.textAlign = "center";
  c.textBaseline = "middle";
  // text in the logo's own blues
  c.fillStyle = "#0a7fd4";
  c.font = `bold 11px ${UI_FONT}`;
  c.fillText("OnlyBears", r.x + r.w / 2, body.y + 64);
  c.font = `8px ${UI_FONT}`;
  c.fillStyle = "#23405a";
  c.fillText("Exclusive bear content.", r.x + r.w / 2, body.y + 78);
  c.fillStyle = "#00a3ef";
  c.fillText("Coming soon...", r.x + r.w / 2, body.y + 90);
  c.textAlign = "left";
  const ok = { x: r.x + r.w / 2 - 26, y: r.y + r.h - 26, w: 52, h: 17 };
  button(c, ok, "OK", { bold: true, hot: s.hover?.kind === "cancel" });
}

function drawStartMenu(c: Ctx, s: PcState, img: IconImages) {
  const m = startMenuRect();
  c.fillStyle = FACE;
  c.fillRect(m.x, m.y, m.w, m.h);
  bevel(c, m);
  // the side banner
  const bx = m.x + 3, by = m.y + 3, bh = m.h - 6;
  const g = c.createLinearGradient(0, by + bh, 0, by);
  g.addColorStop(0, NAVY);
  g.addColorStop(1, "#1084d0");
  c.fillStyle = g;
  c.fillRect(bx, by, START_MENU.banner, bh);
  c.save();
  c.translate(bx + START_MENU.banner / 2 + 0.5, by + bh - 4);
  c.rotate(-Math.PI / 2);
  c.textBaseline = "middle";
  c.fillStyle = "#fff";
  c.font = `bold 10px ${UI_FONT}`;
  c.fillText("Meadows", 0, 0);
  const kw = c.measureText("Meadows").width;
  c.fillStyle = "#c8d4ff";
  c.font = `10px ${UI_FONT}`;
  c.fillText(" 97", kw, 0);
  c.restore();

  for (let i = 0; i < START_MENU_ITEMS.length; i += 1) {
    const it = START_MENU_ITEMS[i];
    const r = startItemRect(i);
    if (it.item === "shutdown") {
      c.fillStyle = LO;
      c.fillRect(r.x, r.y - 4, r.w, 1);
      c.fillStyle = HI;
      c.fillRect(r.x, r.y - 3, r.w, 1);
    }
    const hot = s.hover?.kind === "startItem" && s.hover.item === it.item;
    if (hot) {
      c.fillStyle = NAVY;
      c.fillRect(r.x, r.y, r.w, r.h);
    }
    // small icon
    if (it.item === "shutdown") {
      c.strokeStyle = hot ? "#fff" : "#333";
      c.lineWidth = 1.3;
      c.beginPath();
      c.arc(r.x + 9, r.y + r.h / 2 + 0.5, 5, -Math.PI * 0.3, Math.PI * 1.3);
      c.moveTo(r.x + 9, r.y + r.h / 2 - 6);
      c.lineTo(r.x + 9, r.y + r.h / 2);
      c.stroke();
    } else {
      c.save();
      c.translate(r.x + 2, r.y + 2);
      c.scale(16 / 32, 16 / 32);
      drawAppIcon(c, it.item, 0, 0, 32, img);
      c.restore();
    }
    c.font = `8px ${UI_FONT}`;
    c.textBaseline = "middle";
    c.fillStyle = hot ? "#fff" : DK;
    c.fillText(it.label, r.x + 24, r.y + r.h / 2 + 0.5);
  }
}

function drawDesktop(c: Ctx, s: PcState, t: number, img: IconImages) {
  // wallpaper: the classic teal, with the Meadows 97 logo (public/desktop.png)
  // centred in the space right of the icon column
  c.fillStyle = "#008080";
  c.fillRect(0, 0, PC_W, TASK_Y);
  const logo = img.wallpaper;
  if (logo && logo.complete && logo.naturalWidth) {
    const left = ICON.x + ICON.cellW + 8;
    const boxW = PC_W - left - 16;
    const boxH = TASK_Y - 40;
    const k = Math.min(boxW / logo.naturalWidth, boxH / logo.naturalHeight, 1) * 0.82;
    const w = logo.naturalWidth * k;
    const h = logo.naturalHeight * k;
    c.drawImage(logo, left + (boxW - w) / 2 + 8, (TASK_Y - h) / 2, w, h);
  }

  // desktop icons
  for (let i = 0; i < APPS.length; i += 1) {
    const { app, label } = APPS[i];
    const cell = iconCell(i);
    const sel = s.selected === app;
    const hot = s.hover?.kind === "icon" && s.hover.app === app;
    const ix = ICON.x + (ICON.cellW - 4 - ICON.size) / 2;
    const iy = cell.top + (hot ? -1 : 0) + (hot ? Math.sin(t * 6) * 0.5 : 0);
    drawAppIcon(c, app, ix, iy, ICON.size, img);
    if (sel) {
      // the '95 selection: a navy wash over the icon
      c.fillStyle = "rgba(0,0,128,0.45)";
      c.fillRect(ix, iy, ICON.size, ICON.size);
    }
    c.font = `8px ${UI_FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    const lw = c.measureText(label).width + 6;
    const lx = ix + ICON.size / 2;
    const ly = cell.top + ICON.size + 8;
    if (sel || hot) {
      c.fillStyle = sel ? NAVY : "rgba(0,0,128,0.55)";
      c.fillRect(lx - lw / 2, ly - 5.5, lw, 11);
      if (sel) {
        c.strokeStyle = "#ffff80";
        c.lineWidth = 0.5;
        c.setLineDash([1, 1]);
        c.strokeRect(lx - lw / 2 + 0.25, ly - 5.25, lw - 0.5, 10.5);
        c.setLineDash([]);
      }
    } else {
      // text shadow so the label reads on the teal
      c.fillStyle = "rgba(0,0,0,0.55)";
      c.fillText(label, lx + 0.7, ly + 0.7);
    }
    c.fillStyle = "#fff";
    c.fillText(label, lx, ly + 0.5);
    c.textAlign = "left";
  }

  // windows
  if (s.window === "email") drawEmail(c, s, t);
  if (s.window === "onlybears") drawOnlyBears(c, s, t, img);

  // taskbar
  c.fillStyle = FACE;
  c.fillRect(0, TASK_Y, PC_W, TASK_H);
  c.fillStyle = HI;
  c.fillRect(0, TASK_Y + 1, PC_W, 1);
  c.fillStyle = "#dfdfdf";
  c.fillRect(0, TASK_Y, PC_W, 1);

  // Start button
  const startHot = s.hover?.kind === "start";
  c.fillStyle = FACE;
  c.fillRect(START.x, START.y, START.w, START.h);
  bevel(c, START, s.startOpen);
  const o = s.startOpen ? 1 : 0;
  drawStartLogo(c, START.x + 3 + o, START.y + 2.75 + o, img);
  c.font = `bold 8px ${UI_FONT}`;
  c.textBaseline = "middle";
  c.fillStyle = DK;
  c.fillText("Start", START.x + 21 + o, START.y + START.h / 2 + 0.5 + o);
  if (startHot && !s.startOpen) {
    c.strokeStyle = DK; c.lineWidth = 0.5; c.setLineDash([1, 1]);
    c.strokeRect(START.x + 3.5, START.y + 3.5, START.w - 7, START.h - 7);
    c.setLineDash([]);
  }

  // Back: a left arrow and the word, same raised bevel as Start
  const backHot = s.hover?.kind === "back";
  c.fillStyle = FACE;
  c.fillRect(BACK.x, BACK.y, BACK.w, BACK.h);
  bevel(c, BACK);
  c.fillStyle = "#1a3fa0";
  const ay = BACK.y + BACK.h / 2;
  c.beginPath();
  c.moveTo(BACK.x + 4, ay);
  c.lineTo(BACK.x + 9, ay - 4.5);
  c.lineTo(BACK.x + 9, ay - 2);
  c.lineTo(BACK.x + 13, ay - 2);
  c.lineTo(BACK.x + 13, ay + 2);
  c.lineTo(BACK.x + 9, ay + 2);
  c.lineTo(BACK.x + 9, ay + 4.5);
  c.closePath();
  c.fill();
  c.font = `bold 8px ${UI_FONT}`;
  c.textBaseline = "middle";
  c.fillStyle = DK;
  c.fillText("Back", BACK.x + 16, ay + 0.5);
  if (backHot) {
    c.strokeStyle = DK; c.lineWidth = 0.5; c.setLineDash([1, 1]);
    c.strokeRect(BACK.x + 3.5, BACK.y + 3.5, BACK.w - 7, BACK.h - 7);
    c.setLineDash([]);
  }

  // open window's taskbar button
  if (s.window) {
    c.fillStyle = "#d4d4d4";
    c.fillRect(TASKBTN.x, TASKBTN.y, TASKBTN.w, TASKBTN.h);
    // dithered "active" face
    c.fillStyle = "#e8e8e8";
    for (let yy = TASKBTN.y + 2; yy < TASKBTN.y + TASKBTN.h - 2; yy += 2) {
      for (let xx = TASKBTN.x + 2 + (yy % 4 === 0 ? 0 : 1); xx < TASKBTN.x + TASKBTN.w - 2; xx += 2) c.fillRect(xx, yy, 1, 1);
    }
    bevel(c, TASKBTN, true);
    c.font = `bold 8px ${UI_FONT}`;
    c.fillStyle = DK;
    c.fillText(s.window === "email" ? "New Message" : "OnlyBears", TASKBTN.x + 6, TASKBTN.y + TASKBTN.h / 2 + 1.5);
  }

  // tray + clock
  const tray = { x: PC_W - 52, y: TASK_Y + 3, w: 49, h: 15 };
  bevel(c, tray, true);
  const now = new Date();
  let hh = now.getHours();
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12 || 12;
  const clock = `${hh}:${String(now.getMinutes()).padStart(2, "0")} ${ampm}`;
  c.font = `8px ${UI_FONT}`;
  c.textAlign = "center";
  c.fillStyle = DK;
  c.fillText(clock, tray.x + tray.w / 2, tray.y + tray.h / 2 + 0.5);
  c.textAlign = "left";

  if (s.startOpen) drawStartMenu(c, s, img);
}

/** Draw the whole glass. The desktop is always up - idle, it is just not
 *  taking clicks yet (the first click flies the camera in). */
export function drawRetroDesktop(c: Ctx, s: PcState, t: number, img: IconImages) {
  if ("textRendering" in c) {
    (c as Ctx & { textRendering: string }).textRendering = "geometricPrecision";
  }
  drawDesktop(c, s, t, img);
  // the tube: faint scanlines and a vignette, so it reads as a CRT monitor
  c.fillStyle = "rgba(0,0,0,0.10)";
  for (let y = 0; y < PC_H; y += 2) c.fillRect(0, y, PC_W, 0.7);
  const vig = c.createRadialGradient(PC_W / 2, PC_H / 2, PC_H * 0.35, PC_W / 2, PC_H / 2, PC_H * 0.85);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.38)");
  c.fillStyle = vig;
  c.fillRect(0, 0, PC_W, PC_H);
}

/* --- the texture ---------------------------------------------------------- */

const SS = 3;
const FPS = 24;

export function useRetroDesktopTexture(stateRef: React.MutableRefObject<PcState>, lit = false) {
  const litRef = useRef(lit);
  litRef.current = lit;
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = PC_W * SS;
    c.height = PC_H * SS;
    return c;
  }, []);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    return t;
  }, [canvas]);
  const images = useMemo<IconImages>(() => ({
    github: plainImage(PC_GITHUB_LOGO),
    linkedin: plainImage(PC_LINKEDIN_LOGO),
    onlybears: plainImage(PC_ONLYBEARS_LOGO),
    wallpaper: plainImage(PC_WALLPAPER),
    startLogo: plainImage("/start_logo.png"),
  }), []);

  const last = useRef(-1);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    if (now - last.current < 1 / FPS) return;
    last.current = now;
    const s = stateRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(SS, 0, 0, SS, 0, 0);
    drawRetroDesktop(ctx, s, now, images);
    if (litRef.current && !s.focused) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
    }
    texture.needsUpdate = true;
  });

  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/* --- the controller ------------------------------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** 1-bit pixel cursors in /public/cursors, drawn at 2x. Hotspots: the
 *  arrow's tip, the hand's fingertip. */
const PC_CURSOR_ARROW = "url('/cursors/retro_arrow.png') 0 0, default";
const PC_CURSOR_HAND = "url('/cursors/retro_hand.png') 11 1, pointer";

/**
 * Owns the desktop's state and turns clicks/keys into it.
 *
 * Typing goes through three real, invisible form elements - an <input> for
 * From and Subject and a <textarea> for the message. That is what gets a
 * phone its keyboard, paste, autocorrect and IME for free; the canvas just
 * paints whatever they hold. Their keydowns are stopped at the element, so
 * the page's own shortcuts (arrow keys ring the camp round) never see them.
 */
/**
 * What the machine sounds like - see lib/retroPcSounds for how each is made.
 * All optional, so the desktop works silent.
 */
export type PcSounds = {
  /** Mouse button: every click on the desktop. */
  click?: () => void;
  /** A key on the keyboard, while typing into the email. */
  key?: () => void;
  /** Hard-drive chatter: opening an app, sending. */
  seek?: () => void;
  /** The monitor waking up as you sit down (zoom in). */
  wake?: () => void;
  /** Heads parking as you leave (zoom out). */
  park?: () => void;
  /** PC-speaker error beep. */
  error?: () => void;
  /** PC-speaker "done" chirp - the email went. */
  done?: () => void;
};

export function useRetroDesktop(opts: {
  /** False in the lab's config mode: the computer is just a prop there. */
  enabled: boolean;
  sounds?: PcSounds;
  /**
   * OnlyBears does not open a window: it hands off to the scene, which plays
   * the bear gag (OnlyBearsBear). Unset = the plain placeholder window.
   */
  onOnlyBears?: () => void;
  /** True while the scene has the machine (the bear's paw is on it): the
   *  desktop ignores clicks and hovers, and Escape goes to onBusyEscape. */
  busy?: () => boolean;
  onBusyEscape?: () => void;
}) {
  const { enabled } = opts;
  const cb = useRef(opts);
  cb.current = opts;
  const stateRef = useRef<PcState>({ ...PC_INITIAL });
  const [focused, setFocused] = useState(false);
  const [pointerLive, setPointerLive] = useState(false);
  const inputs = useRef<Record<PcField, HTMLInputElement | HTMLTextAreaElement> | null>(null);

  const patch = useCallback((p: Partial<PcState>) => {
    stateRef.current = { ...stateRef.current, ...p };
  }, []);

  const blurFields = useCallback(() => {
    const els = inputs.current;
    if (els) for (const el of Object.values(els)) el.blur();
    patch({ field: null });
  }, [patch]);

  const focusField = useCallback((f: PcField) => {
    patch({ field: f });
    const el = inputs.current?.[f];
    if (el) {
      el.focus({ preventScroll: true });
      const n = el.value.length;
      try { el.setSelectionRange(n, n); } catch { /* email inputs refuse it */ }
    }
  }, [patch]);

  const exit = useCallback(() => {
    blurFields();
    patch({ focused: false, window: null, startOpen: false, selected: null, hover: null });
    setFocused((was) => {
      if (was) cb.current.sounds?.park?.();
      return false;
    });
  }, [blurFields, patch]);

  const send = useCallback(async () => {
    const s = stateRef.current;
    if (s.send === "sending" || s.send === "sent") return;
    const from = s.from.trim();
    const subject = s.subject.trim();
    const body = s.body.trim();
    if (!EMAIL_RE.test(from)) {
      cb.current.sounds?.error?.();
      patch({ send: "error", note: "Please enter your email address in From." });
      focusField("from");
      return;
    }
    if (!body) {
      cb.current.sounds?.error?.();
      patch({ send: "error", note: "The message is empty." });
      focusField("body");
      return;
    }
    blurFields();
    cb.current.sounds?.seek?.();
    patch({ send: "sending", note: "Sending" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, subject, message: body, company: "" }),
      });
      if (res.ok) {
        cb.current.sounds?.done?.();
        patch({ send: "sent", note: "Message sent. Thanks for writing!" });
        return;
      }
      if (res.status === 503) {
        // No mail service configured on this deployment: hand the message to
        // the visitor's own mail app, already filled in.
        const href = `mailto:${PC_EMAIL_TO}?subject=${encodeURIComponent(subject || "Hello from your portfolio")}`
          + `&body=${encodeURIComponent(`${body}\n\n- ${from}`)}`;
        window.location.href = href;
        patch({ send: "sent", note: "Opened in your mail app - just hit send there." });
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      cb.current.sounds?.error?.();
      patch({ send: "error", note: data?.error ?? "Couldn't send. Please try again." });
    } catch {
      cb.current.sounds?.error?.();
      patch({ send: "error", note: "Couldn't reach the server. Please try again." });
    }
  }, [patch, focusField, blurFields]);

  const openApp = useCallback((app: PcApp) => {
    patch({ selected: app, startOpen: false });
    // the drive chatters as the program loads - even for the two that just
    // hand off to the browser
    cb.current.sounds?.seek?.();
    if (app === "github") { window.open(PC_GITHUB_URL, "_blank", "noopener,noreferrer"); return; }
    if (app === "linkedin") { window.open(PC_LINKEDIN_URL, "_blank", "noopener,noreferrer"); return; }
    if (app === "onlybears") {
      blurFields();
      if (cb.current.onOnlyBears) {
        patch({ window: null, hover: null });
        cb.current.onOnlyBears();
      } else {
        patch({ window: "onlybears" });
      }
      return;
    }
    const s = stateRef.current;
    if (s.send === "sent") {
      // a fresh message after a sent one; the sender's address is kept
      if (inputs.current) {
        inputs.current.subject.value = "";
        inputs.current.body.value = "";
      }
      patch({ subject: "", body: "", send: "idle", note: "" });
    }
    patch({ window: "email" });
    focusField(s.from ? "subject" : "from");
  }, [patch, blurFields, focusField]);

  const closeWindow = useCallback(() => {
    blurFields();
    patch({ window: null });
  }, [blurFields, patch]);

  // The invisible form elements, alive only while the computer is usable.
  useEffect(() => {
    if (!enabled) return;
    const mk = (tag: "input" | "textarea", f: PcField, max: number) => {
      const el = document.createElement(tag);
      if (el instanceof HTMLInputElement) el.type = f === "from" ? "email" : "text";
      el.maxLength = max;
      el.setAttribute("aria-label", f === "from" ? "Your email" : f === "subject" ? "Subject" : "Message");
      el.autocomplete = f === "from" ? "email" : "off";
      Object.assign(el.style, {
        position: "fixed", left: "0", bottom: "0", width: "1px", height: "1px",
        opacity: "0", pointerEvents: "none", fontSize: "16px", border: "0", padding: "0",
        zIndex: "-1",
      });
      el.addEventListener("input", () => {
        const s = stateRef.current;
        patch({ [f]: el.value, ...(s.send !== "sending" ? { send: "idle" as PcSend, note: "" } : {}) });
      });
      el.addEventListener("focus", () => patch({ field: f }));
      el.addEventListener("blur", () => { if (stateRef.current.field === f) patch({ field: null }); });
      el.addEventListener("keydown", (e) => {
        const ke = e as KeyboardEvent;
        ke.stopPropagation();
        // a keystroke you can hear - not for held-down repeats or bare
        // modifier keys, which made no sound on the real thing either
        if (!ke.repeat && !["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(ke.key)) {
          cb.current.sounds?.key?.();
        }
        if (ke.key === "Escape") { ke.preventDefault(); closeWindow(); return; }
        const order: PcField[] = ["from", "subject", "body"];
        if (ke.key === "Tab") {
          ke.preventDefault();
          const i = order.indexOf(f);
          focusField(order[(i + (ke.shiftKey ? 2 : 1)) % 3]);
          return;
        }
        if (ke.key === "Enter" && (f !== "body" || ke.metaKey || ke.ctrlKey)) {
          ke.preventDefault();
          if (f === "body") void send();
          else focusField(f === "from" ? "subject" : "body");
        }
      });
      document.body.appendChild(el);
      return el;
    };
    const els = {
      from: mk("input", "from", 120),
      subject: mk("input", "subject", 140),
      body: mk("textarea", "body", 4000),
    };
    els.from.value = stateRef.current.from;
    els.subject.value = stateRef.current.subject;
    els.body.value = stateRef.current.body;
    inputs.current = els;
    return () => {
      for (const el of Object.values(els)) el.remove();
      inputs.current = null;
    };
  }, [enabled, patch, focusField, closeWindow, send]);

  // Escape backs out a level at a time: start menu, window, then the desktop.
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = stateRef.current;
      if (cb.current.busy?.()) { cb.current.onBusyEscape?.(); return; }
      if (s.startOpen) patch({ startOpen: false });
      else if (s.window) closeWindow();
      else exit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, patch, closeWindow, exit]);

  // Config mode switched on mid-session drops the close-up.
  useEffect(() => { if (!enabled) exit(); }, [enabled, exit]);

  const onScreenClick = useCallback((uv: { x: number; y: number } | null) => {
    if (!enabled) return;
    const s = stateRef.current;
    if (!s.focused) {
      patch({ focused: true, hover: null });
      setFocused(true);
      cb.current.sounds?.wake?.();
      return;
    }
    if (!uv) return;
    // the bear has the machine - OnlyBearsBear listens for its own click
    if (cb.current.busy?.()) return;
    const h = pcHit(uv.x, uv.y, s);
    // Every press on the desktop is a press of the mouse button.
    cb.current.sounds?.click?.();
    switch (h.kind) {
      case "icon":
        openApp(h.app);
        return;
      case "start":
        patch({ startOpen: !s.startOpen });
        return;
      case "back":
        exit();
        return;
      case "startItem":
        if (h.item === "shutdown") { exit(); return; }
        openApp(h.item);
        return;
      case "task":
        if (s.window === "email") focusField(s.field ?? "body");
        return;
      case "close":
      case "cancel":
        closeWindow();
        return;
      case "field":
        patch({ startOpen: false });
        focusField(h.field);
        return;
      case "send":
        void send();
        return;
      case "window":
        if (s.startOpen) patch({ startOpen: false });
        return;
      case "desktop":
        blurFields();
        patch({ selected: null, startOpen: false });
        return;
    }
  }, [enabled, patch, openApp, exit, focusField, closeWindow, send, blurFields]);

  const onScreenHover = useCallback((uv: { x: number; y: number } | null) => {
    const s = stateRef.current;
    const h = uv && s.focused && !cb.current.busy?.() ? pcHit(uv.x, uv.y, s) : null;
    if (!sameHit(h, s.hover)) patch({ hover: h });
    // Idle, the hand is driven by onComputerOver (the whole machine counts).
    if (!s.focused) return;
    const live = pcHitIsLive(h);
    setPointerLive((was) => (was === live ? was : live));
  }, [patch]);

  /** Idle: the pointer is on the computer somewhere, so it is clickable. */
  const onComputerOver = useCallback((over: boolean) => {
    if (stateRef.current.focused) return;
    setPointerLive((was) => (was === over ? was : over));
  }, []);

  /*
   * Period cursors: the pixel arrow for as long as you are at the desk, and
   * the pixel pointing hand over anything clickable - and over the whole
   * machine while idle, to say "click me". Held on <body> for the whole
   * close-up, like the CRT's P1 hand, so it never flips back to a modern
   * arrow when the pointer drifts off the glass.
   */
  useEffect(() => {
    if (!enabled || (!focused && !pointerLive)) return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = pointerLive ? PC_CURSOR_HAND : PC_CURSOR_ARROW;
    return () => { document.body.style.cursor = prev; };
  }, [enabled, focused, pointerLive]);

  // Zooming in or out resets the hand; the next move re-derives it.
  useEffect(() => { setPointerLive(false); }, [focused]);

  return { focused, stateRef, onScreenClick, onScreenHover, onComputerOver, exit };
}

/* --- pointer: our own raycast, straight from the DOM ---------------------- */

/**
 * Clicks and hovers on the computer, resolved by casting a ray at IT ALONE.
 *
 * r3f's own events hand a click to the NEAREST thing under the pointer, and
 * every prop in the scene sits in a <Selectable> that stops propagation - so
 * anything between the camera and the glass (the cabin's walls and window,
 * a lantern, the desk clutter) swallowed the click before the screen ever
 * saw it, and the camera never flew in. Listening on the canvas and casting
 * against just the computer means the screen answers whenever you can see
 * it, whatever else the ray passes through on the way.
 *
 * Idle, the whole machine is the target (monitor, case, keyboard) - it is a
 * big, obvious thing to click. Once zoomed in, only the glass counts, and
 * the hit comes back as the glass's UV for the desktop to hit-test.
 *
 * A press that turns into a drag (more than a few pixels) is not a click, so
 * orbiting past the computer never opens it.
 */
export function useComputerPointer(opts: {
  enabled: boolean;
  focused: boolean;
  screenRef: React.MutableRefObject<THREE.Object3D | null>;
  bodyRef: React.MutableRefObject<THREE.Object3D | null>;
  onClick: (uv: { x: number; y: number } | null) => void;
  onHover: (uv: { x: number; y: number } | null) => void;
  /** Idle hover on the machine, for the lift and the hand cursor. */
  onOver?: (over: boolean) => void;
}) {
  const get = useThree((st) => st.get);
  const gl = useThree((st) => st.gl);
  const cb = useRef(opts);
  cb.current = opts;
  const ray = useMemo(() => new THREE.Raycaster(), []);

  useEffect(() => {
    if (!opts.enabled) return;
    const el = (get().events.connected as HTMLElement | undefined) ?? gl.domElement;
    const ndc = new THREE.Vector2();

    const shown = (o: THREE.Object3D | null) => {
      for (let n = o; n; n = n.parent) if (!n.visible) return false;
      return !!o;
    };
    /** Pointer to NDC in the canvas's OWN frame. offsetX is in the target's
     *  untransformed box, so this stays right under ForceLandscape's CSS
     *  rotation, the same way r3f computes it. */
    const toNdc = (e: PointerEvent | MouseEvent) => {
      const canvas = gl.domElement;
      let x: number, y: number;
      if (e.target === canvas) {
        x = e.offsetX; y = e.offsetY;
      } else {
        const r = canvas.getBoundingClientRect();
        x = e.clientX - r.left; y = e.clientY - r.top;
      }
      ndc.set((x / canvas.clientWidth) * 2 - 1, -(y / canvas.clientHeight) * 2 + 1);
    };
    const cast = (e: PointerEvent | MouseEvent) => {
      const { focused } = cb.current;
      const screen = cb.current.screenRef.current;
      const body = cb.current.bodyRef.current;
      toNdc(e);
      ray.setFromCamera(ndc, get().camera);
      let uv: { x: number; y: number } | null = null;
      let onBody = false;
      if (screen && shown(screen)) {
        const hit = ray.intersectObject(screen, false)[0];
        if (hit?.uv) uv = { x: hit.uv.x, y: hit.uv.y };
      }
      if (!uv && !focused && body && shown(body)) {
        onBody = ray.intersectObject(body, true).length > 0;
      }
      return { uv, onBody };
    };

    let down: { x: number; y: number } | null = null;
    let over = false;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onClick = (e: MouseEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const { uv, onBody } = cast(e);
      if (uv || onBody) cb.current.onClick(uv);
    };
    const onMove = (e: PointerEvent) => {
      const { uv, onBody } = cast(e);
      cb.current.onHover(uv);
      const now = !!uv || onBody;
      if (now !== over) { over = now; cb.current.onOver?.(now); }
    };
    const onLeave = () => {
      cb.current.onHover(null);
      if (over) { over = false; cb.current.onOver?.(false); }
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("click", onClick);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("click", onClick);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      onLeave();
    };
  }, [opts.enabled, get, gl, ray]);
}
