import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";

export const runtime = "nodejs";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as {
      room?: unknown; voice?: unknown; smokeyPitch?: unknown; maplePitch?: unknown;
    };
    const room = typeof body.room === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(body.room)
      ? body.room
      : "bear-lab";
    const token = new AccessToken(required("LIVEKIT_API_KEY"), required("LIVEKIT_API_SECRET"), {
      identity: `bear-browser-${crypto.randomUUID()}`,
      ttl: "15m",
    });
    token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });
    token.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: "smokey-agent",
          metadata: JSON.stringify({
            voice: typeof body.voice === "string" ? body.voice : undefined,
            pitch: typeof body.smokeyPitch === "number" ? body.smokeyPitch : undefined,
          }),
        }),
        new RoomAgentDispatch({
          agentName: "maple-agent",
          metadata: JSON.stringify({ pitch: typeof body.maplePitch === "number" ? body.maplePitch : undefined }),
        }),
        new RoomAgentDispatch({ agentName: "bear-coordinator" }),
      ],
    });
    return NextResponse.json({ token: await token.toJwt(), url: required("LIVEKIT_URL"), room });
  } catch (error) {
    console.error("Unable to create LiveKit room token", error);
    return NextResponse.json({ error: "LiveKit is unavailable." }, { status: 503 });
  }
}
