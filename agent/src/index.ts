import { config as loadEnv } from "dotenv";
import express, { type Request, type Response } from "express";
import expressWs from "express-ws";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import twilio from "twilio";
import {
  activeSpeechSnapshotEvent,
  cleanSpokenLine,
  contextAwareResume,
  hasPlayedSpeech,
  playbackTimeoutMs,
  shouldPublishSpeechStarted,
  validInterruptTarget,
} from "./interruption-plan/index.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(sourceDirectory, "../../nextjs/.env") });
const portfolioContext = readFileSync(
  resolve(sourceDirectory, "../knowledge/mitchell-kimbell-context.md"),
  "utf8",
);

type BearLine = { bear: "bear1" | "bear2"; text: string; speechId?: string };
type BearSpeechEvent =
  | "bear.speech.queued"
  | "bear.speech.started"
  | "bear.speech.ended"
  | "bear.speech.interrupted";
type BearReplyPlan = {
  maple: BearLine;
  smokey: BearLine;
  smokeyResume?: BearLine;
  interruptAfter?: string;
};
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
  activeSpeechStarted: boolean;
  relaySocket?: RelaySocket;
  playedText: string;
  playbackWaiters: Set<() => void>;
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
const portfolioOrigin = process.env.PORTFOLIO_ORIGIN?.trim() || "http://localhost:3000";
const bearEventToken = process.env.BEAR_EVENT_TOKEN?.trim();
if (appEnv === "PROD" && !bearEventToken) {
  throw new Error("BEAR_EVENT_TOKEN is required in PROD");
}
const sessionTtlMs = Number(process.env.SESSION_IDLE_TTL_MS ?? 900_000);
if (!Number.isFinite(sessionTtlMs) || sessionTtlMs < 1_000) {
  throw new Error("SESSION_IDLE_TTL_MS must be at least 1000 milliseconds");
}

const smokeyVoiceId = process.env.SMOKEY_ELEVENLABS_VOICE_ID?.trim() || "oubi7HGxNVjXMnWLgwBT";
const smokeyLanguage = process.env.SMOKEY_TTS_LANGUAGE?.trim() || "en-US";
const mapleVoiceId = process.env.MAPLE_ELEVENLABS_VOICE_ID?.trim() || "u0REnIJvUgcGQYW2Ux8K";
const mapleLanguage = process.env.MAPLE_TTS_LANGUAGE?.trim() || "en-GB";
const dialogueProtocol = "speech-id-v3";
const sessions = new Map<string, Session>();
const { app } = expressWs(express());

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
    activeSpeechStarted: false,
    playedText: "",
    playbackWaiters: new Set(),
  };
}

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

function publishSpeechEvent(
  session: Session,
  event: BearSpeechEvent,
  line: BearLine,
  subscribers: Iterable<Response> = session.eventSubscribers,
): void {
  if (!session.callSid) return;
  const payload = JSON.stringify({
    callSid: session.callSid,
    bear: line.bear,
    bearId: bearSpeaker(line.bear),
    speaker: bearSpeaker(line.bear),
    speechId: line.speechId,
    text: line.text,
  });
  for (const response of subscribers) {
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
  const activeLine = { ...line, speechId: randomUUID() };
  session.activeSpeech = activeLine;
  session.activeSpeechStarted = false;
  session.playedText = "";
  console.log("Bear speech queued", {
    callSid: session.callSid,
    bear: activeLine.bear,
    characters: line.text.length,
    preemptible,
  });
  publishSpeechEvent(session, "bear.speech.queued", activeLine);
  send(ws, {
    type: "text",
    token: line.text,
    lang: line.bear === "bear1" ? smokeyLanguage : mapleLanguage,
    last: true,
    interruptible: true,
    preemptible,
  });
}

function waitForPlayedText(session: Session, target: string, timeoutMs: number): Promise<boolean> {
  if (hasPlayedSpeech(session.playedText, target)) return Promise.resolve(true);

  return new Promise((resolvePromise) => {
    const waiter = () => {
      if (!hasPlayedSpeech(session.playedText, target)) return;
      clearTimeout(timeout);
      session.playbackWaiters.delete(waiter);
      resolvePromise(true);
    };
    const timeout = setTimeout(() => {
      session.playbackWaiters.delete(waiter);
      resolvePromise(false);
    }, timeoutMs);
    session.playbackWaiters.add(waiter);
  });
}

async function sendBearReply(
  ws: RelaySocket,
  plan: BearReplyPlan,
  generation: number,
  session: Session,
): Promise<void> {
  const canSend = () => session.generation === generation;
  const interruptAfter = validInterruptTarget(plan.smokey.text, plan.interruptAfter);
  sendTalkCycle(ws, session, plan.smokey, Boolean(interruptAfter), canSend);

  const target = interruptAfter || plan.smokey.text;
  const played = await waitForPlayedText(session, target, playbackTimeoutMs(target));
  if (!canSend()) return;
  if (!played) {
    console.warn("Bear playback target timed out", {
      callSid: session.callSid,
      interrupting: Boolean(interruptAfter),
      target,
    });
    return;
  }
  if (interruptAfter && session.activeSpeech?.bear === "bear1") {
    console.log("Bear speech handoff", {
      callSid: session.callSid,
      from: session.activeSpeech.bear,
      to: plan.maple.bear,
      mode: "interrupt",
    });
    publishSpeechEvent(session, "bear.speech.interrupted", session.activeSpeech);
  } else if (session.activeSpeech?.bear === "bear1") {
    console.log("Bear speech handoff", {
      callSid: session.callSid,
      from: session.activeSpeech.bear,
      to: plan.maple.bear,
      mode: "follow",
    });
    publishSpeechEvent(session, "bear.speech.ended", session.activeSpeech);
  }
  sendTalkCycle(ws, session, plan.maple, false, canSend);
  const maplePlayed = await waitForPlayedText(session, plan.maple.text, playbackTimeoutMs(plan.maple.text));
  if (!canSend()) return;
  if (!maplePlayed) {
    console.warn("Maple playback timed out", { callSid: session.callSid });
    return;
  }
  if (session.activeSpeech?.bear === "bear2") {
    console.log("Bear speech ended", { callSid: session.callSid, bear: session.activeSpeech.bear });
    publishSpeechEvent(session, "bear.speech.ended", session.activeSpeech);
    session.activeSpeech = undefined;
    session.activeSpeechStarted = false;
  }
  if (!plan.smokeyResume) return;

  sendTalkCycle(ws, session, plan.smokeyResume, false, canSend);
  const resumePlayed = await waitForPlayedText(
    session,
    plan.smokeyResume.text,
    playbackTimeoutMs(plan.smokeyResume.text),
  );
  if (!canSend()) return;
  if (!resumePlayed) {
    console.warn("Smokey correction acknowledgement playback timed out", { callSid: session.callSid });
    return;
  }
  if (session.activeSpeech?.bear === "bear1") {
    console.log("Bear speech ended", { callSid: session.callSid, bear: session.activeSpeech.bear });
    publishSpeechEvent(session, "bear.speech.ended", session.activeSpeech);
    session.activeSpeech = undefined;
    session.activeSpeechStarted = false;
  }
}

function sendGreeting(ws: RelaySocket, session: Session): void {
  const generation = ++session.generation;
  const smokey = {
    bear: "bear1" as const,
    text: "Oh, hey there, partner. We weren't expecting company. We were just talking about our favorite senior engineer, Mitchell Kimbell. Earlier he led several projects that...",
  };
  void (async () => {
    sendTalkCycle(ws, session, smokey, true, () => session.generation === generation);
    const heardTarget = await waitForPlayedText(session, "Mitchell Kimbell", playbackTimeoutMs("Mitchell Kimbell"));
    if (session.generation !== generation) return;
    if (!heardTarget) {
      console.warn("Greeting playback prefix timed out; interrupting conservatively", {
        callSid: session.callSid,
        target: "Mitchell Kimbell",
      });
      return;
    }
    if (session.activeSpeech?.bear === "bear1") {
      publishSpeechEvent(session, "bear.speech.interrupted", session.activeSpeech);
    }
    const maple = { bear: "bear2" as const, text: "Actually, Smokey, Mitchell is a staff engineer." };
    sendTalkCycle(ws, session, maple, false, () => session.generation === generation);
    const maplePlayed = await waitForPlayedText(session, maple.text, playbackTimeoutMs(maple.text));
    if (session.generation !== generation) return;
    if (!maplePlayed) {
      console.warn("Greeting Maple playback timed out", { callSid: session.callSid });
      return;
    }
    if (session.activeSpeech?.bear === "bear2") publishSpeechEvent(session, "bear.speech.ended", session.activeSpeech);
    const apology = {
      bear: "bear1" as const,
      text: contextAwareResume(maple.text, "So what would you like to know about Mitchell?", "staff engineer"),
    };
    sendTalkCycle(ws, session, apology, false, () => session.generation === generation);
    const apologyPlayed = await waitForPlayedText(session, apology.text, playbackTimeoutMs(apology.text));
    if (session.generation !== generation) return;
    if (!apologyPlayed) {
      console.warn("Greeting Smokey response playback timed out", { callSid: session.callSid });
      return;
    }
    if (session.activeSpeech?.bear === "bear1") {
      publishSpeechEvent(session, "bear.speech.ended", session.activeSpeech);
      session.activeSpeech = undefined;
      session.activeSpeechStarted = false;
    }
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
    messages: [{
      role: "system",
      content: `${system}\n\nAPPROVED MITCHELL KIMBELL PORTFOLIO CONTEXT:\n${portfolioContext}`,
    }, ...history],
  });
  const text = completion.choices[0]?.message.content?.trim().slice(0, 600);
  if (!text) throw new Error("OpenAI returned an empty bear response");
  history.push({ role: "assistant", content: text });
  keepBoundedHistory(history);
  return text;
}

async function generateReply(session: Session, prompt: string): Promise<BearReplyPlan> {
  if (!openai) {
    return {
      smokey: { bear: "bear1", text: "I can give our introduction, but my conversation service is not configured yet." },
      maple: { bear: "bear2", text: "Please set OPENAI_API_KEY to enable answers to your questions." },
    };
  }
  const smokey = cleanSpokenLine(await completePersona(
    session.smokeyHistory,
    "You are Smokey, a friendly but slightly stubborn portfolio bear. Give one concise, helpful spoken answer to the user's question. Speak naturally, safely, and without markdown. You are mildly annoyed by Maple's pedantic corrections, so when he corrects you, acknowledge it with dry, lightly irritated phrasing rather than sounding submissive or apologetic. Never write your name, Maple's name, speaker labels, stage directions, or dialogue for another character.",
    prompt,
  ), "I can tell you about Mitchell's work.");
  const mapleCompletion = await openai.chat.completions.create({
    model: openaiModel,
    temperature: 0.7,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "maple_reply_plan",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            delivery: { type: "string", enum: ["follow", "interrupt"] },
            interruptAfter: { anyOf: [{ type: "string" }, { type: "null" }] },
            handoffContext: { anyOf: [{ type: "string" }, { type: "null" }] },
          },
          required: ["text", "delivery", "interruptAfter", "handoffContext"],
        },
      },
    },
    messages: [{
      role: "system",
      content: "You are Maple, a concise, dry portfolio bear. Return exactly one spoken line for Maple only. Never write Smokey's line, your name, his name, speaker labels, stage directions, or a multi-character script. Add useful detail or gently correct Smokey. Choose interrupt only when a factual correction or genuinely good joke is worth cutting him off; do not interrupt for minor wording. For interruptAfter, copy an exact phrase of at least four words from Smokey that ends before his response ends. For handoffContext, provide the short fact or idea Smokey must explicitly repeat to show he heard you, such as 'staff engineer'; use null for a non-interrupting follow-up. Start interruption text with a short direct reaction. Otherwise choose follow and null for both interruption fields.",
    }, ...session.mapleHistory, {
      role: "user",
      content: `Visitor: ${prompt}\n\nSmokey: ${smokey}`,
    }],
  });
  const rawPlan = mapleCompletion.choices[0]?.message.content;
  let mapleText = "I agree with that.";
  let interruptAfter: string | undefined;
  let handoffContext: string | undefined;
  if (rawPlan) {
    try {
      const parsed = JSON.parse(rawPlan) as {
        text?: unknown;
        delivery?: unknown;
        interruptAfter?: unknown;
        handoffContext?: unknown;
      };
      if (typeof parsed.text === "string") mapleText = cleanSpokenLine(parsed.text.slice(0, 600), mapleText);
      if (parsed.delivery === "interrupt" && typeof parsed.interruptAfter === "string") {
        interruptAfter = validInterruptTarget(smokey, parsed.interruptAfter);
        if (typeof parsed.handoffContext === "string" && parsed.handoffContext.trim()) {
          handoffContext = parsed.handoffContext.trim().slice(0, 160);
        }
      }
    } catch {
      console.warn("Maple reply plan was invalid JSON", { callSid: session.callSid });
    }
  }
  session.mapleHistory.push({ role: "user", content: `Visitor: ${prompt}\n\nSmokey: ${smokey}` });
  session.mapleHistory.push({ role: "assistant", content: mapleText });
  keepBoundedHistory(session.mapleHistory);
  const smokeyContinuation = interruptAfter
    ? cleanSpokenLine(await completePersona(
      session.smokeyHistory,
      "You are Smokey, a friendly but slightly stubborn portfolio bear. Maple just interrupted you. Write only the short continuation after your acknowledgement; the application will prepend the exact context you must acknowledge. Continue your point or return to the visitor's question. Sound dry and mildly annoyed, never apologetic. Do not begin with right, yes, fine, or noted. Never write names, speaker labels, stage directions, markdown, or dialogue for another character.",
      `Visitor: ${prompt}\n\nYour lead: ${smokey}\n\nMaple's correction: ${mapleText}`,
    ), "What else would you like to know?")
    : undefined;
  const smokeyResume = smokeyContinuation
    ? contextAwareResume(mapleText, smokeyContinuation, handoffContext)
    : undefined;
  if (smokeyResume) {
    const lastHistoryMessage = session.smokeyHistory.at(-1);
    if (lastHistoryMessage?.role === "assistant") lastHistoryMessage.content = smokeyResume;
  }
  return {
    smokey: { bear: "bear1", text: smokey },
    maple: { bear: "bear2", text: mapleText },
    smokeyResume: smokeyResume ? { bear: "bear1", text: smokeyResume } : undefined,
    interruptAfter,
  };
}

function publicUrl(request: Request, protocol: "https" | "wss"): string {
  return `${agentBaseUrl.replace(/^https:/, `${protocol}:`)}${request.originalUrl}`;
}

function validTwilioRequest(request: Request, protocol: "https" | "wss"): boolean {
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
app.get("/health", (_request, response) => response.status(200).json({
  ok: true,
  environment: appEnv,
  dialogueProtocol,
}));
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
  if (session.activeSpeech) {
    publishSpeechEvent(
      session,
      activeSpeechSnapshotEvent(session.activeSpeechStarted),
      session.activeSpeech,
      [response],
    );
  }
  request.on("close", () => session.eventSubscribers.delete(response));
});
app.post("/fish-reaction/:callSid", (request, response) => {
  if (!allowPortfolioOrigin(request, response)) return response.sendStatus(403);
  if (appEnv === "PROD" && request.query.token !== bearEventToken) return response.sendStatus(401);
  const session = matchingSession(request.params.callSid);
  if (!session?.relaySocket || session.activeSpeech) return response.sendStatus(409);
  const generation = ++session.generation;
  const line = { bear: "bear1" as const, text: "You owe us a fish, pal." };
  sendTalkCycle(session.relaySocket, session, line, false, () => session.generation === generation);
  void waitForPlayedText(session, line.text, playbackTimeoutMs(line.text)).then((played) => {
    if (!played || session.generation !== generation || session.activeSpeech?.bear !== "bear1") return;
    publishSpeechEvent(session, "bear.speech.ended", session.activeSpeech);
    session.activeSpeech = undefined;
    session.activeSpeechStarted = false;
  });
  return response.sendStatus(202);
});
app.post("/call", (request, response) => {
  if (!validTwilioRequest(request, "https")) return response.sendStatus(403);
  const callReference = randomUUID();
  const relayUrl = `${agentBaseUrl.replace(/^https:/, "wss:")}/conversation-relay`;
  const voiceResponse = new twilio.twiml.VoiceResponse();
  const connect = voiceResponse.connect();
  const relayOptions: Parameters<typeof connect.conversationRelay>[0] & { events: string } = {
    url: relayUrl,
    ttsLanguage: smokeyLanguage,
    ttsProvider: "ElevenLabs",
    voice: smokeyVoiceId,
    transcriptionLanguage: "en-US",
    interruptible: "speech",
    reportInputDuringAgentSpeech: "speech" as unknown as boolean,
    events: "speaker-events tokens-played",
  };
  const relay = connect.conversationRelay(relayOptions);
  relay.language({ code: smokeyLanguage, ttsProvider: "ElevenLabs", voice: smokeyVoiceId });
  relay.language({ code: mapleLanguage, ttsProvider: "ElevenLabs", voice: mapleVoiceId });
  relay.parameter({ name: "callReference", value: callReference });
  console.log("Created per-bear ConversationRelay TwiML", {
    smokey: { language: smokeyLanguage, voice: redactId(smokeyVoiceId) },
    maple: { language: mapleLanguage, voice: redactId(mapleVoiceId) },
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
      if (!session) {
        const setupId = reference || message.sessionId || message.callSid;
        if (!setupId) return ws.close(1008, "Unknown session");
        session = createSession(setupId);
        sessions.set(setupId, session);
      }
      if (session.expiresAt < Date.now()) return ws.close(1008, "Unknown session");
      if (message.callSid) session.callSid = message.callSid;
      session.relaySocket = ws;
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
        if (session.activeSpeechStarted) {
          publishSpeechEvent(session, "bear.speech.interrupted", session.activeSpeech);
        }
        session.activeSpeech = undefined;
        session.activeSpeechStarted = false;
      }
      return;
    }
    if (message.type === "info") {
      if (message.name === "tokensPlayed" && typeof message.value === "string") {
        session.playedText += message.value;
        const activeSpeech = session.activeSpeech;
        if (shouldPublishSpeechStarted(Boolean(activeSpeech), session.activeSpeechStarted, message.value) && activeSpeech) {
          session.activeSpeechStarted = true;
          console.log("Bear speech audible", {
            callSid: session.callSid,
            bear: activeSpeech.bear,
            firstChunkCharacters: message.value.length,
          });
          publishSpeechEvent(session, "bear.speech.started", activeSpeech);
        }
        for (const waiter of [...session.playbackWaiters]) waiter();
      }
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
    const generation = ++session.generation;
    void generateReply(session, message.voicePrompt.trim())
      .then((plan) => {
        if (session?.generation === generation) void sendBearReply(ws, plan, generation, session);
      })
      .catch((error: unknown) => {
        console.error("OpenAI response failed", error instanceof Error ? error.message : "unknown error");
        if (session?.generation === generation) {
          void sendBearReply(ws, {
            smokey: { bear: "bear1", text: "I am sorry, I missed that." },
            maple: { bear: "bear2", text: "Please try asking us again in a moment." },
          }, generation, session);
        }
      });
  });

  ws.on("close", () => {
    if (session) {
      closeEventSubscribers(session);
      session.relaySocket = undefined;
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

const server = app.listen(port, () => console.log(`Bear agent listening on port ${port} (${appEnv})`));
const shutdown = () => server.close(() => process.exit(0));
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
console.log("Per-bear ConversationRelay voice configuration", {
  smokey: { language: smokeyLanguage, voice: redactId(smokeyVoiceId) },
  maple: { language: mapleLanguage, voice: redactId(mapleVoiceId) },
});
