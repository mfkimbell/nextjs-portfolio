import { config as loadEnv } from "dotenv";
import express, { type Request } from "express";
import expressWs from "express-ws";
import OpenAI from "openai";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import twilio from "twilio";
import type WebSocket from "ws";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(sourceDirectory, "../../nextjs/.env") });

type BearLine = { bear: "bear1" | "bear2"; text: string };
type RelayMessage =
  | { type: "setup"; sessionId: string; callSid?: string; customParameters?: Record<string, string> }
  | { type: "prompt"; voicePrompt: string; last: boolean }
  | { type: "interrupt" }
  | { type: "error"; description?: string };

type Session = {
  id: string;
  history: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  generation: number;
  lastSeen: number;
  expiresAt: number;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const appEnv = required("APP_ENV");
if (appEnv !== "DEV" && appEnv !== "PROD") {
  throw new Error("APP_ENV must be exactly DEV or PROD");
}

const agentBaseUrl = required(appEnv === "DEV" ? "DEV_AGENT_BASE_URL" : "PROD_AGENT_BASE_URL").replace(/\/$/, "");
if (!agentBaseUrl.startsWith("https://")) {
  throw new Error("The selected agent base URL must start with https:// so ConversationRelay can use wss://");
}

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port");

const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : undefined;
const openaiModel = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
const sessionTtlMs = Number(process.env.SESSION_IDLE_TTL_MS ?? 900_000);
if (!Number.isFinite(sessionTtlMs) || sessionTtlMs < 1_000) {
  throw new Error("SESSION_IDLE_TTL_MS must be at least 1000 milliseconds");
}
const sessions = new Map<string, Session>();
const { app } = expressWs(express());

const bear1Language = process.env.SMOKEY_TTS_LANGUAGE ?? "en-US";
const bear2Language = process.env.MAPLE_TTS_LANGUAGE ?? "en-GB";
const bear1Provider = process.env.SMOKEY_TTS_PROVIDER ?? "Google";
const bear2Provider = process.env.MAPLE_TTS_PROVIDER ?? "Google";
const bear1Voice = process.env.SMOKEY_TTS_VOICE ?? "en-US-Journey-D";
const bear2Voice = process.env.MAPLE_TTS_VOICE ?? "en-GB-Neural2-B";
const greetingInterjectionDelayMs = 750;

function asRelayMessage(raw: WebSocket.RawData): RelayMessage | undefined {
  try {
    const value: unknown = JSON.parse(raw.toString());
    if (!value || typeof value !== "object" || !("type" in value) || typeof value.type !== "string") return undefined;
    return value as RelayMessage;
  } catch {
    return undefined;
  }
}

function send(ws: WebSocket, message: object): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function sendTalkCycle(ws: WebSocket, line: BearLine, preemptible = false): void {
  send(ws, {
    type: "text",
    token: line.text,
    lang: line.bear === "bear1" ? bear1Language : bear2Language,
    last: true,
    interruptible: true,
    preemptible,
  });
}

function sendTwoBearReply(ws: WebSocket, lines: BearLine[]): void {
  for (const line of lines) sendTalkCycle(ws, line);
}

function sendGreeting(ws: WebSocket, session: Session): void {
  const generation = ++session.generation;
  // Queue the suffix before Maple starts a separate cycle that can preempt it.
  const smokeyTokens = [
    "Oh, hey there, partner. We weren't expecting company. ",
    "We were just talking about our favorite senior engineer, Mitchell Kimbell. ",
    "Earlier he",
    " led several projects that...",
  ];
  for (const [index, token] of smokeyTokens.entries()) {
    send(ws, {
      type: "text",
      token,
      lang: bear1Language,
      last: index === smokeyTokens.length - 1,
      interruptible: true,
      preemptible: true,
    });
  }
  setTimeout(() => {
    if (session.generation !== generation) return;
    // This is a new cycle, so it preempts Smokey only if his greeting is still playing.
    sendTalkCycle(ws, { bear: "bear2", text: "Actually, Smokey, Mitch is a staff engineer." });
    setTimeout(() => {
      if (session.generation === generation) {
        sendTalkCycle(ws, { bear: "bear1", text: "My apologies. We were just talking about our favorite staff engineer..." });
        setTimeout(() => {
          if (session.generation === generation) {
            sendTalkCycle(ws, { bear: "bear1", text: "Mitch. So, what would you like to know?" });
          }
        }, greetingInterjectionDelayMs).unref();
      }
    }, greetingInterjectionDelayMs).unref();
  }, greetingInterjectionDelayMs).unref();
}

function parseBearLines(content: string): BearLine[] | undefined {
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== "object" || !("lines" in value) || !Array.isArray(value.lines) || value.lines.length !== 2) {
      return undefined;
    }
    const lines = value.lines.map((item) => {
      if (!item || typeof item !== "object" || !("bear" in item) || !("text" in item)) return undefined;
      const { bear, text } = item as { bear?: unknown; text?: unknown };
      return (bear === "bear1" || bear === "bear2") && typeof text === "string" && text.trim()
        ? { bear, text: text.trim().slice(0, 600) } as BearLine
        : undefined;
    });
    return lines.every((line): line is BearLine => Boolean(line)) && new Set(lines.map((line) => line.bear)).size === 2
      ? lines
      : undefined;
  } catch {
    return undefined;
  }
}

async function generateReply(session: Session, prompt: string): Promise<BearLine[]> {
  if (!openai) {
    return [
      { bear: "bear1", text: "I can give our introduction, but my conversation service is not configured yet." },
      { bear: "bear2", text: "Please set OPENAI_API_KEY to enable answers to your questions." },
    ];
  }
  session.history.push({ role: "user", content: prompt });
  session.history.splice(1, Math.max(0, session.history.length - 13));
  const completion = await openai.chat.completions.create({
    model: openaiModel,
    temperature: 0.7,
    messages: session.history,
    response_format: { type: "json_object" },
  });
  const content = completion.choices[0]?.message.content ?? "";
  const lines = parseBearLines(content);
  if (!lines) throw new Error("OpenAI returned an invalid bear response");
  session.history.push({ role: "assistant", content });
  return lines;
}

function publicUrl(request: Request, protocol: "https" | "wss"): string {
  // The configured external origin remains correct when a TLS-terminating proxy changes request headers.
  return `${agentBaseUrl.replace(/^https:/, `${protocol}:`)}${request.originalUrl}`;
}

function validTwilioRequest(request: Request, protocol: "https" | "wss"): boolean {
  // The reserved DEV ngrok domain is only for local iteration. Production must
  // always verify Twilio's signature with a current Auth Token.
  if (appEnv === "DEV" && process.env.TWILIO_VALIDATE_SIGNATURES !== "true") return true;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;
  const signature = request.header("x-twilio-signature");
  const params = protocol === "https" && request.body && typeof request.body === "object"
    ? request.body as Record<string, string>
    : {};
  try {
    return Boolean(signature && twilio.validateRequest(authToken, signature, publicUrl(request, protocol), params));
  } catch {
    return false;
  }
}

app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false }));
app.get("/health", (_request, response) => response.status(200).json({ ok: true, environment: appEnv }));

app.post("/call", (request, response) => {
  if (!validTwilioRequest(request, "https")) return response.sendStatus(403);
  const callReference = randomUUID();
  const relayUrl = `${agentBaseUrl.replace(/^https:/, "wss:")}/conversation-relay`;
  const voiceResponse = new twilio.twiml.VoiceResponse();
  const connect = voiceResponse.connect();
  const relay = connect.conversationRelay({
    url: relayUrl,
    ttsLanguage: bear1Language,
    ttsProvider: bear1Provider,
    voice: bear1Voice,
    transcriptionLanguage: bear1Language,
    interruptible: "any",
    reportInputDuringAgentSpeech: "speech",
  });
  relay.language({ code: bear1Language, ttsProvider: bear1Provider, voice: bear1Voice });
  relay.language({ code: bear2Language, ttsProvider: bear2Provider, voice: bear2Voice });
  relay.parameter({ name: "callReference", value: callReference });
  sessions.set(callReference, {
    id: callReference,
    generation: 0,
    lastSeen: Date.now(),
    expiresAt: Date.now() + sessionTtlMs,
    history: [{ role: "system", content: "You are two friendly portfolio bears. Return exactly a JSON object with a 'lines' array containing exactly two objects: first {bear:'bear1',text:string}, then {bear:'bear2',text:string}. Both bears must answer the user concisely, safely, and naturally. No markdown." }],
  });
  response.type("text/xml").send(voiceResponse.toString());
});

app.ws("/conversation-relay", (ws, request) => {
  if (!validTwilioRequest(request, "wss")) return ws.close(1008, "Unauthorized");
  let session: Session | undefined;

  ws.on("message", (raw) => {
    const message = asRelayMessage(raw);
    if (!message) return ws.close(1003, "Invalid message");
    if (message.type === "setup") {
      const reference = message.customParameters?.callReference;
      session = reference ? sessions.get(reference) : undefined;
      if (!session || session.expiresAt < Date.now()) return ws.close(1008, "Unknown session");
      session.lastSeen = Date.now();
      session.expiresAt = session.lastSeen + sessionTtlMs;
      sendGreeting(ws, session);
      return;
    }
    if (!session) return ws.close(1008, "Setup required");
    session.lastSeen = Date.now();
    session.expiresAt = session.lastSeen + sessionTtlMs;
    if (message.type === "interrupt") {
      session.generation += 1;
      return;
    }
    if (message.type !== "prompt" || !message.last || !message.voicePrompt.trim()) return;
    const generation = ++session.generation;
    void generateReply(session, message.voicePrompt.trim())
      .then((lines) => {
        if (session?.generation === generation) sendTwoBearReply(ws, lines);
      })
      .catch((error: unknown) => {
        console.error("OpenAI response failed", error instanceof Error ? error.message : "unknown error");
        if (session?.generation === generation) {
          sendTwoBearReply(ws, [
            { bear: "bear1", text: "I am sorry, I missed that." },
            { bear: "bear2", text: "Please try asking us again in a moment." },
          ]);
        }
      });
  });

  ws.on("close", () => {
    if (session) sessions.delete(session.id);
  });
  ws.on("error", (error) => console.error("ConversationRelay WebSocket error", error.message));
});

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) if (session.expiresAt < now) sessions.delete(id);
}, Math.min(sessionTtlMs, 60_000)).unref();

app.listen(port, () => console.log(`Bear agent listening on port ${port} (${appEnv})`));
