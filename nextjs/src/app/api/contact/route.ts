import { NextRequest, NextResponse } from "next/server";

/*
 * POST /api/contact - the cabin computer's Email app.
 *
 * Sends through whichever mail provider is configured, tried in this order:
 *
 *   SENDGRID_API_KEY  (+ CONTACT_FROM_EMAIL, a sender verified in SendGrid)
 *   RESEND_API_KEY    (+ CONTACT_FROM_EMAIL, on a domain verified in Resend)
 *
 * CONTACT_TO_EMAIL overrides where it lands (default mfkimbell@gmail.com).
 * The visitor's address goes in Reply-To, so hitting Reply answers them.
 *
 * With neither key set this answers 503, and the desktop falls back to
 * opening the visitor's own mail app with the message already filled in -
 * so the button works on a fresh checkout before any keys exist.
 */

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX = { from: 120, subject: 140, message: 4000 };

/** A small per-IP limit so the form can't be used to flood the inbox. Per
 *  server instance, which is plenty for a portfolio. */
const WINDOW_MS = 10 * 60 * 1000;
const PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > PER_WINDOW;
}

function clean(v: unknown, max: number) {
  return typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, max) : "";
}

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // Honeypot: a field no person fills in. Bots that do get a quiet "ok".
  if (clean(payload.company, 200)) return NextResponse.json({ ok: true });

  const from = clean(payload.from, MAX.from);
  const subject = clean(payload.subject, MAX.subject).replace(/\n/g, " ") || "Hello from your portfolio";
  const message = clean(payload.message, MAX.message);
  if (!EMAIL_RE.test(from)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "The message is empty." }, { status: 400 });
  }

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (limited(ip)) {
    return NextResponse.json({ error: "Too many messages - please try again later." }, { status: 429 });
  }

  const to = process.env.CONTACT_TO_EMAIL || "mfkimbell@gmail.com";
  const sender = process.env.CONTACT_FROM_EMAIL;
  const text = `${message}\n\n-- \nSent from the cabin computer on your portfolio by ${from}`;
  const fullSubject = `[Portfolio] ${subject}`;

  try {
    if (process.env.SENDGRID_API_KEY && sender) {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: sender, name: "Portfolio Cabin" },
          reply_to: { email: from },
          subject: fullSubject,
          content: [{ type: "text/plain", value: text }],
        }),
      });
      if (!res.ok) throw new Error(`sendgrid ${res.status}: ${await res.text()}`);
      return NextResponse.json({ ok: true });
    }

    if (process.env.RESEND_API_KEY && sender) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `Portfolio Cabin <${sender}>`,
          to: [to],
          reply_to: from,
          subject: fullSubject,
          text,
        }),
      });
      if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
      return NextResponse.json({ ok: true });
    }
  } catch (err) {
    console.error("[contact] send failed", err);
    return NextResponse.json({ error: "Couldn't send right now. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ error: "Mail is not configured." }, { status: 503 });
}
