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
    // One agent: the coordinator, which brings Smokey and Maple into the room
    // itself (agent/src/livekit-bears) and gets their pitches from here.
    token.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: "bear-coordinator",
          metadata: JSON.stringify({
            smokeyPitch: typeof body.smokeyPitch === "number" ? body.smokeyPitch : undefined,
            maplePitch: typeof body.maplePitch === "number" ? body.maplePitch : undefined,
          }),
        }),
      ],
    });
    return NextResponse.json({ token: await token.toJwt(), url: required("LIVEKIT_URL"), room });
  } catch (error) {
    console.error("Unable to create LiveKit room token", error);
    return NextResponse.json({ error: "LiveKit is unavailable." }, { status: 503 });
  }
}
