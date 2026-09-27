import { config as loadEnv } from "dotenv";
import express, { type Request, type Response } from "express";
import expressWs from "express-ws";
import OpenAI from "openai";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import twilio from "twilio";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(sourceDirectory, "../../nextjs/.env") });

type BearLine = { bear: "bear1" | "bear2"; text: string };
type RelaySocket = {
  readonly OPEN: number;
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
};
type RelayMessage =
  | { type: "setup"; sessionId: string; callSid?: string; customParameters?: Record<string, string> }
  | { type: "prompt"; voicePrompt: string; last: boolean }
  | { type: "interrupt" }
  | { type: "info"; name?: string; value?: unknown }
  | { type: "error"; description?: string };

type Session = {
  id: string;
  callSid?: string;
  smokeyHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  mapleHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  eventSubscribers: Set<Response>;
  activeSpeech?: BearLine;
  playedText: string;
  playbackWaiters: Set<() => void>;
  generation: number;
  lastSeen: number;
  expiresAt: number;
};

function createSession(id: string): Session {
  const now = Date.now();
  return {
    id,
    generation: 0,
    lastSeen: now,
    expiresAt: now + sessionTtlMs,
    smokeyHistory: [],
    mapleHistory: [],
    eventSubscribers: new Set(),
    playedText: "",
    playbackWaiters: new Set(),
  };
}

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
const portfolioOrigin = process.env.PORTFOLIO_ORIGIN?.trim() || "http://localhost:3000";
const bearEventToken = process.env.BEAR_EVENT_TOKEN?.trim();
if (appEnv === "PROD" && !bearEventToken) {
  throw new Error("BEAR_EVENT_TOKEN is required in PROD");
}
const sessionTtlMs = Number(process.env.SESSION_IDLE_TTL_MS ?? 900_000);
if (!Number.isFinite(sessionTtlMs) || sessionTtlMs < 1_000) {
  throw new Error("SESSION_IDLE_TTL_MS must be at least 1000 milliseconds");
}
const sessions = new Map<string, Session>();
const { app } = expressWs(express());

const bear1VoiceId = process.env.SMOKEY_ELEVENLABS_VOICE_ID?.trim() || "Cb8NLd0sUB8jI4MW2f9M";
const bear1Language = process.env.SMOKEY_TTS_LANGUAGE?.trim() || "en-US";
const bear2VoiceId = process.env.MAPLE_ELEVENLABS_VOICE_ID?.trim() || "oubi7HGxNVjXMnWLgwBT";
const bear2Language = process.env.MAPLE_TTS_LANGUAGE?.trim() || "en-GB";

function redactId(value: string): string {
  return value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : "[configured]";
}

function asRelayMessage(raw: unknown): RelayMessage | undefined {
  try {
    const text = Buffer.isBuffer(raw)
      ? raw.toString()
      : Array.isArray(raw)
        ? Buffer.concat(raw.map((part) => Buffer.from(part))).toString()
        : String(raw);
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || !("type" in value) || typeof value.type !== "string") return undefined;
    return value as RelayMessage;
  } catch {
    return undefined;
  }
}

function send(ws: RelaySocket, message: object): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function bearSpeaker(bear: BearLine["bear"]): "back_left_log" | "back_right_log" {
  return bear === "bear1" ? "back_left_log" : "back_right_log";
}

function publishSpeechEvent(session: Session, event: "bear.speech.started" | "bear.speech.ended" | "bear.speech.interrupted", line: BearLine): void {
  if (!session.callSid) return;
  const payload = JSON.stringify({
    callSid: session.callSid,
    bear: line.bear,
    bearId: bearSpeaker(line.bear),
    speaker: bearSpeaker(line.bear),
    text: line.text,
  });
  for (const response of session.eventSubscribers) {
    response.write(`event: ${event}\ndata: ${payload}\n\n`);
  }
}

function closeEventSubscribers(session: Session): void {
  for (const response of session.eventSubscribers) response.end();
  session.eventSubscribers.clear();
}

function matchingSession(callSid: string): Session | undefined {
  for (const session of sessions.values()) {
    if (session.callSid === callSid && session.expiresAt >= Date.now()) return session;
  }
  return undefined;
}

function allowPortfolioOrigin(request: Request, response: Response): boolean {
  const origin = request.header("origin");
  if (origin && origin !== portfolioOrigin) return false;
  if (origin === portfolioOrigin) {
    response.set({
      "Access-Control-Allow-Origin": portfolioOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      Vary: "Origin",
    });
  }
  return true;
}

function sendTalkCycle(
  ws: RelaySocket,
  session: Session,
  line: BearLine,
  preemptible = false,
  canSend: () => boolean = () => true,
): void {
  if (!canSend() || ws.readyState !== ws.OPEN) return;
  session.activeSpeech = line;
  session.playedText = "";
  const language = line.bear === "bear1" ? bear1Language : bear2Language;
  const voice = line.bear === "bear1" ? bear1VoiceId : bear2VoiceId;
  console.log("Sending native ElevenLabs bear text", {
    bear: line.bear,
    callSid: session.callSid,
    language,
    preemptible,
    textLength: line.text.length,
    voice: redactId(voice),
  });
  publishSpeechEvent(session, "bear.speech.started", line);
  send(ws, {
    type: "text",
    token: line.text,
    lang: language,
    last: true,
    interruptible: true,
    preemptible,
  });
}

function normalizedSpeech(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function waitForPlayedText(session: Session, target: string, timeoutMs: number): Promise<boolean> {
  const normalizedTarget = normalizedSpeech(target);
  if (normalizedSpeech(session.playedText).includes(normalizedTarget)) return Promise.resolve(true);

  return new Promise((resolve) => {
    const waiter = () => {
      if (!normalizedSpeech(session.playedText).includes(normalizedTarget)) return;
      clearTimeout(timeout);
      session.playbackWaiters.delete(waiter);
      resolve(true);
    };
    const timeout = setTimeout(() => {
      session.playbackWaiters.delete(waiter);
      resolve(false);
    }, timeoutMs);
    session.playbackWaiters.add(waiter);
  });
}

function sendTwoBearReply(
  ws: RelaySocket,
  lines: BearLine[],
  generation: number,
  session: Session,
  preemptible = false,
): void {
  for (const line of lines) sendTalkCycle(ws, session, line, preemptible, () => session.generation === generation);
}

function sendGreeting(ws: RelaySocket, session: Session): void {
  const generation = ++session.generation;
  const smokey = {
    bear: "bear1" as const,
    text: "Oh, hey there, partner. We weren't expecting company. We were just talking about our favorite senior engineer, Mitchell Kimbell. Earlier he led several projects that...",
  };
  void (async () => {
    sendTalkCycle(ws, session, smokey, true, () => session.generation === generation);
    // ConversationRelay reports audible text through info/tokensPlayed. The
    // timeout is only a recovery path if Twilio fails to send that event.
    const heardTarget = await waitForPlayedText(session, "Earlier he", 9_000);
    if (session.generation !== generation) return;
    if (!heardTarget) {
      console.warn("Greeting playback prefix timed out; interrupting conservatively", {
        callSid: session.callSid,
        target: "Earlier he",
      });
    }
    const maple = { bear: "bear2" as const, text: "Actually, Smokey, Mitch is a staff engineer." };
    sendTalkCycle(ws, session, maple, false, () => session.generation === generation);
    await waitForPlayedText(session, maple.text, 6_000);
    if (session.generation !== generation) return;
    const apology = { bear: "bear1" as const, text: "My apologies. We were just talking about our favorite staff engineer..." };
    sendTalkCycle(ws, session, apology, false, () => session.generation === generation);
    await waitForPlayedText(session, apology.text, 6_000);
    if (session.generation !== generation) return;
    sendTalkCycle(ws, session, { bear: "bear1", text: "Mitch. So, what would you like to know?" }, false, () => session.generation === generation);
  })().catch((error: unknown) => {
    console.error("Greeting sequencing failed", error instanceof Error ? error.message : "unknown error");
  });
}

function keepBoundedHistory(history: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): void {
  history.splice(0, Math.max(0, history.length - 12));
}

async function completePersona(
  history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  system: string,
  prompt: string,
): Promise<string> {
  if (!openai) throw new Error("OpenAI is not configured");
  history.push({ role: "user", content: prompt });
  keepBoundedHistory(history);
  const completion = await openai.chat.completions.create({
    model: openaiModel,
    temperature: 0.7,
    messages: [{ role: "system", content: system }, ...history],
  });
  const text = completion.choices[0]?.message.content?.trim().slice(0, 600);
  if (!text) throw new Error("OpenAI returned an empty bear response");
  history.push({ role: "assistant", content: text });
  keepBoundedHistory(history);
  return text;
}

async function generateReply(session: Session, prompt: string): Promise<BearLine[]> {
  if (!openai) {
    return [
      { bear: "bear1", text: "I can give our introduction, but my conversation service is not configured yet." },
      { bear: "bear2", text: "Please set OPENAI_API_KEY to enable answers to your questions." },
    ];
  }
  const smokey = await completePersona(
    session.smokeyHistory,
    "You are Smokey, a friendly portfolio bear. Give a concise, helpful lead answer to the user's question. Speak naturally, safely, and without markdown.",
    prompt,
  );
  const maple = await completePersona(
    session.mapleHistory,
    "You are Maple, a friendly portfolio bear. Give a concise follow-up that adds useful detail or gently corrects Smokey when needed. Speak naturally, safely, and without markdown.",
    `User prompt: ${prompt}\n\nSmokey's lead: ${smokey}`,
  );
  return [{ bear: "bear1", text: smokey }, { bear: "bear2", text: maple }];
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
    if (!signature) return false;
    const urls = protocol === "wss"
      ? [publicUrl(request, "wss"), publicUrl(request, "https")]
      : [publicUrl(request, "https")];
    return urls.some((url) => twilio.validateRequest(authToken, signature, url, params));
  } catch {
    return false;
  }
}

app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false }));
app.get("/health", (_request, response) => response.status(200).json({ ok: true, environment: appEnv }));
app.options("/events/:callSid", (request, response) => {
  if (!allowPortfolioOrigin(request, response)) return response.sendStatus(403);
  return response.sendStatus(204);
});
app.get("/events/:callSid", (request, response) => {
  if (!allowPortfolioOrigin(request, response)) return response.sendStatus(403);
  if (appEnv === "PROD" && request.query.token !== bearEventToken) return response.sendStatus(401);
  const session = matchingSession(request.params.callSid);
  if (!session) return response.sendStatus(404);
  response.set({
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();
  response.write(": connected\n\n");
  session.eventSubscribers.add(response);
  request.on("close", () => session.eventSubscribers.delete(response));
});
app.post("/call", (request, response) => {
  if (!validTwilioRequest(request, "https")) return response.sendStatus(403);
  const callReference = randomUUID();
  const relayUrl = `${agentBaseUrl.replace(/^https:/, "wss:")}/conversation-relay`;
  const voiceResponse = new twilio.twiml.VoiceResponse();
  const connect = voiceResponse.connect();
  const relayOptions: Parameters<typeof connect.conversationRelay>[0] & { events: string } = {
    url: relayUrl,
    ttsLanguage: bear1Language,
    ttsProvider: "ElevenLabs",
    voice: bear1VoiceId,
    transcriptionLanguage: "en-US",
    interruptible: "speech",
    // Twilio's current ConversationRelay API accepts "speech" here, while
    // the installed SDK version still types this property as boolean.
    reportInputDuringAgentSpeech: "speech" as unknown as boolean,
    events: "speaker-events tokens-played",
  };
  const relay = connect.conversationRelay(relayOptions);
  relay.language({ code: bear1Language, ttsProvider: "ElevenLabs", voice: bear1VoiceId });
  relay.language({ code: bear2Language, ttsProvider: "ElevenLabs", voice: bear2VoiceId });
  relay.parameter({ name: "callReference", value: callReference });
  console.log("Created native ElevenLabs ConversationRelay TwiML", {
    smokey: { language: bear1Language, voice: redactId(bear1VoiceId) },
    maple: { language: bear2Language, voice: redactId(bear2VoiceId) },
  });
  sessions.set(callReference, createSession(callReference));
  response.type("text/xml").send(voiceResponse.toString());
});

app.ws("/conversation-relay", (ws, request) => {
  if (!validTwilioRequest(request, "wss")) {
    console.warn("Rejected ConversationRelay WebSocket signature", {
      path: request.originalUrl,
      environment: appEnv,
    });
    return ws.close(1008, "Unauthorized");
  }
  let session: Session | undefined;

  ws.on("message", (raw) => {
    const message = asRelayMessage(raw);
    if (!message) return ws.close(1003, "Invalid message");
    if (message.type === "setup") {
      const reference = message.customParameters?.callReference;
      session = reference ? sessions.get(reference) : undefined;
      // In PROD, the Next.js /call webhook owns TwiML generation, so setup is
      // the first message the agent sees. Use Twilio's session/call identity.
      if (!session) {
        const setupId = reference || message.sessionId || message.callSid;
        if (!setupId) return ws.close(1008, "Unknown session");
        session = createSession(setupId);
        sessions.set(setupId, session);
      }
      if (session.expiresAt < Date.now()) return ws.close(1008, "Unknown session");
      if (message.callSid) session.callSid = message.callSid;
      console.log("ConversationRelay setup accepted", {
        sessionId: message.sessionId,
        callSid: message.callSid,
      });
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
      if (session.activeSpeech) {
        console.log("ConversationRelay caller interruption", {
          callSid: session.callSid,
          activeBear: session.activeSpeech.bear,
        });
        publishSpeechEvent(session, "bear.speech.interrupted", session.activeSpeech);
        session.activeSpeech = undefined;
      }
      return;
    }
    if (message.type === "info") {
      if (message.name === "tokensPlayed" && typeof message.value === "string") {
        session.playedText += message.value;
        for (const waiter of [...session.playbackWaiters]) waiter();
      }
      console.log("ConversationRelay info event", {
        callSid: session.callSid,
        name: message.name,
        valueLength: typeof message.value === "string" ? message.value.length : undefined,
      });
      return;
    }
    if (message.type === "error") {
      console.error("ConversationRelay reported an error", {
        callSid: session.callSid,
        description: message.description,
      });
      return;
    }
    if (message.type !== "prompt" || !message.last || !message.voicePrompt.trim()) return;
    console.log("ConversationRelay final prompt", {
      callSid: session.callSid,
      characters: message.voicePrompt.trim().length,
    });
    const generation = ++session.generation;
    void generateReply(session, message.voicePrompt.trim())
      .then((lines) => {
        if (session?.generation === generation) sendTwoBearReply(ws, lines, generation, session);
      })
      .catch((error: unknown) => {
        console.error("OpenAI response failed", error instanceof Error ? error.message : "unknown error");
        if (session?.generation === generation) {
          sendTwoBearReply(ws, [
            { bear: "bear1", text: "I am sorry, I missed that." },
            { bear: "bear2", text: "Please try asking us again in a moment." },
          ], generation, session);
        }
      });
  });

  ws.on("close", () => {
    if (session) {
      closeEventSubscribers(session);
      sessions.delete(session.id);
    }
  });
  ws.on("error", (error) => console.error("ConversationRelay WebSocket error", error.message));
});

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt < now) {
      closeEventSubscribers(session);
      sessions.delete(id);
    }
  }
}, Math.min(sessionTtlMs, 60_000)).unref();

app.listen(port, () => console.log(`Bear agent listening on port ${port} (${appEnv})`));
console.log("Native ElevenLabs voice configuration", {
  smokey: { language: bear1Language, voice: redactId(bear1VoiceId) },
  maple: { language: bear2Language, voice: redactId(bear2VoiceId) },
});
