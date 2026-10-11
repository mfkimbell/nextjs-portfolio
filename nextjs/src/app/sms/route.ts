import { NextResponse } from "next/server";
import twilio from "twilio";

export const runtime = "nodejs";

/**
 * Text messages to the bears' Twilio number. Set the number's Messaging
 * Configuration -> "A message comes in" -> Webhook -> https://<site>/sms,
 * HTTP POST. (Calls go to /call, set under Voice Configuration.)
 *
 * Twilio posts the text here; Smokey and Maple answer with one short reply,
 * sent back as TwiML so Twilio texts it to the sender.
 */
function publicSmsUrl(): string {
  const configured = process.env.PRODUCTION_BASE_URL?.trim() || "https://mitchellkimbell.com";
  return `${configured.replace(/\/$/, "")}/sms`;
}

const twiml = (text: string) => {
  const r = new twilio.twiml.MessagingResponse();
  r.message(text);
  return new NextResponse(r.toString(), { status: 200, headers: { "content-type": "text/xml" } });
};

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) return NextResponse.json({ error: "Messaging is unavailable." }, { status: 503 });

  const form = await request.formData();
  const params = Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, String(v)]));
  const signature = request.headers.get("x-twilio-signature");
  if (!signature || !twilio.validateRequest(authToken, signature, publicSmsUrl(), params)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const body = (params.Body ?? "").trim().slice(0, 600);
  if (!body) return twiml("Howdy! Text us a question about Mitch and we'll holler back. - Smokey & Maple");
  if (!process.env.OPENAI_API_KEY) return twiml("The bears are away from the fire right now. Try again a little later!");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
        temperature: 0.7,
        max_tokens: 160,
        messages: [
          {
            role: "system",
            content: "You are Smokey and Maple, an affectionate married pair of Southern bears who sit by the campfire on Mitch Kimbell's portfolio site and answer questions about him. This is a text message: reply in at most 3 short sentences, plain text, no markdown or labels. You may sign off as '- Smokey & Maple'.",
          },
          { role: "user", content: body },
        ],
      }),
    });
    if (!response.ok) throw new Error(`OpenAI ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const reply = typeof payload.choices?.[0]?.message?.content === "string" ? (payload.choices[0].message!.content as string).trim().slice(0, 1200) : "";
    return twiml(reply || "We lost our train of thought - text us again?");
  } catch (error) {
    console.error("Bear SMS reply failed", error);
    return twiml("The fire's crackling too loud to hear you - try again in a bit!");
  }
}
