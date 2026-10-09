import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const clean = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 600) : "";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Please write a message first." }, { status: 400 });
  }

  const message = clean(body.message);
  if (!message) return NextResponse.json({ error: "Please write a message first." }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "The bears are away from the keyboard right now." }, { status: 503 });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
      temperature: 0.7,
      max_tokens: 130,
      messages: [
        {
          role: "system",
          content: "Reply as Smokey and Maple, an affectionate married pair of Southern bears. Keep each bear's turn to one or two short sentences. Maple may interrupt with her own one or two short sentences, then Smokey may add another brief one or two sentence response. Keep it natural, concise, and friendly. Do not use labels, stage directions, markdown, or a script.",
        },
        { role: "user", content: message },
      ],
    }),
  });
  if (!response.ok) return NextResponse.json({ error: "The bears could not answer right now." }, { status: 502 });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const reply = clean(payload.choices?.[0]?.message?.content);
  if (!reply) return NextResponse.json({ error: "The bears lost their train of thought." }, { status: 502 });
  return NextResponse.json({ reply });
}
