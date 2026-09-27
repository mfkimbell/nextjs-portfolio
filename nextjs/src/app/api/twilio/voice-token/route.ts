import { NextResponse } from "next/server";
import twilio from "twilio";
import { getTwilioVoiceConfig } from "@/lib/twilioVoice";

export const runtime = "nodejs";

export async function POST() {
  try {
    const config = getTwilioVoiceConfig();
    const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({
      outgoingApplicationSid: config.appSid,
      incomingAllow: false,
    });
    const accessToken = new twilio.jwt.AccessToken(
      config.accountSid,
      config.apiKey,
      config.apiSecret,
      {
        identity: `bear-web-${crypto.randomUUID()}`,
        ttl: Number(process.env.TWILIO_ACCESS_TOKEN_TTL || 900),
      }
    );

    accessToken.addGrant(voiceGrant);
    return NextResponse.json({ token: accessToken.toJwt() });
  } catch (error) {
    console.error("Unable to create Twilio voice token", error);
    return NextResponse.json({ error: "Voice service is unavailable." }, { status: 500 });
  }
}
