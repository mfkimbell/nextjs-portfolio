"use client";

import { useEffect, useState } from "react";
import { DEV_AGENT_BASE_URL } from "@/hooks/useBearVoiceAgent";
import { endBearPhone, startBearPhone } from "@/lib/bearPhone";

/**
 * While the "Call us" bubble is open, wait for this visitor's phone call.
 *
 * Holds the agent's /call-watch stream open. If a call comes in within 3
 * minutes of the bubble opening and this is the newest site waiting, the
 * agent pairs the call with it: `call.started` makes the bears pick up their
 * phones (lib/bearPhone), `call.ended` has them put them away. Closing the
 * bubble mid-call leaves the bears on the phone until the caller hangs up -
 * the stream stays paired until then.
 */
export function useCallWatch(enabled: boolean): { onCall: boolean } {
  const [onCall, setOnCall] = useState(false);
  // open while the bubble is up, and kept open through a live call
  const keep = enabled || onCall;
  useEffect(() => {
    if (!keep) return;
    const configured = process.env.NEXT_PUBLIC_BEAR_AGENT_BASE_URL?.trim();
    const base = process.env.NEXT_PUBLIC_APP_MODE !== "DEV" ? configured : DEV_AGENT_BASE_URL;
    if (!base) return;
    const url = new URL("/call-watch", base);
    const token = process.env.NEXT_PUBLIC_BEAR_EVENT_TOKEN?.trim();
    if (token) url.searchParams.set("token", token);
    const source = new EventSource(url);
    const started = () => { console.log("[call] the bears picked up"); setOnCall(true); startBearPhone(); };
    const ended = () => { console.log("[call] the caller hung up"); setOnCall(false); endBearPhone(); };
    source.addEventListener("call.started", started);
    source.addEventListener("call.ended", ended);
    return () => { source.close(); };
  }, [keep]);
  return { onCall };
}
