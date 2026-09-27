import { NextResponse } from "next/server";
import twilio from "twilio";

export const runtime = "nodejs";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function publicCallUrl(): string {
  const configured = process.env.PRODUCTION_BASE_URL?.trim() || "https://mitchellkimbell.com";
  return `${configured.replace(/\/$/, "")}/call`;
}

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) return NextResponse.json({ error: "Voice service is unavailable." }, { status: 503 });

  const form = await request.formData();
  const params = Object.fromEntries(
    Array.from(form.entries()).map(([key, value]) => [key, String(value)])
  );
  const signature = request.headers.get("x-twilio-signature");
  if (!signature || !twilio.validateRequest(authToken, signature, publicCallUrl(), params)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const agentBaseUrl = required("PROD_AGENT_BASE_URL").replace(/\/$/, "");
    if (!agentBaseUrl.startsWith("https://")) throw new Error("PROD_AGENT_BASE_URL must use HTTPS");

    const smokeyLanguage = process.env.SMOKEY_TTS_LANGUAGE || "en-US";
    const mapleLanguage = process.env.MAPLE_TTS_LANGUAGE || "en-GB";
    const smokeyProvider = process.env.SMOKEY_TTS_PROVIDER || "Google";
    const mapleProvider = process.env.MAPLE_TTS_PROVIDER || "Google";
    const smokeyVoice = process.env.SMOKEY_TTS_VOICE || "en-US-Journey-D";
    const mapleVoice = process.env.MAPLE_TTS_VOICE || "en-GB-Neural2-B";

    const response = new twilio.twiml.VoiceResponse();
    const connect = response.connect();
    const relay = connect.conversationRelay({
      url: `${agentBaseUrl.replace(/^https:/, "wss:")}/conversation-relay`,
      ttsLanguage: smokeyLanguage,
      ttsProvider: smokeyProvider,
      voice: smokeyVoice,
      transcriptionLanguage: smokeyLanguage,
      interruptible: "any",
      // Current ConversationRelay accepts "speech"; this SDK type is stale.
      reportInputDuringAgentSpeech: "speech" as unknown as boolean,
      events: "speaker-events tokens-played",
    });
    relay.language({ code: smokeyLanguage, ttsProvider: smokeyProvider, voice: smokeyVoice });
    relay.language({ code: mapleLanguage, ttsProvider: mapleProvider, voice: mapleVoice });

    return new NextResponse(response.toString(), {
      status: 200,
      headers: { "content-type": "text/xml" },
    });
  } catch (error) {
    console.error("Unable to create bear ConversationRelay TwiML", error);
    return NextResponse.json({ error: "Voice service is unavailable." }, { status: 503 });
  }
}
