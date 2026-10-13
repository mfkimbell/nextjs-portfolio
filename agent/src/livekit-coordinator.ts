import { config as loadEnv } from "dotenv";
import OpenAI from "openai";
import { cli, defineAgent, type JobContext, ServerOptions, voice } from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import { RoomEvent } from "@livekit/rtc-node";
import { randomUUID } from "node:crypto";
import { appendFile, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { correctionFactById, correctionFacts } from "./correction-facts/index.js";
import { applyFactCorrection, buildSpeechCommands, removeRepeatedSentences, type PlannedExchange, type SpeechCommand } from "./livekit-orchestrator/index.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(sourceDirectory, "../../nextjs/.env") });
const portfolioContext = readFileSync(resolve(sourceDirectory, "../knowledge/mitchell-kimbell-context.md"), "utf8");
// Ready answers to the common questions ("who is Mitch", "how many projects"...)
const faq = readFileSync(resolve(sourceDirectory, "../knowledge/faq.md"), "utf8");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const recentTurns: Array<{ visitor: string; observation: string }> = [];
const recentSpoken: string[] = [];

/*
 * Local transcript log for debugging: agent/logs/transcripts.txt, one line per
 * thing said - the visitor (spoken or typed), each bear line as it plays, and
 * tool calls - tagged with the room so separate visits can be told apart.
 * (Development aid; the folder is ignored by git.)
 */
const TRANSCRIPT_DIR = resolve(sourceDirectory, "../logs");
const TRANSCRIPT_FILE = resolve(TRANSCRIPT_DIR, "transcripts.txt");
try { mkdirSync(TRANSCRIPT_DIR, { recursive: true }); } catch { /* read-only fs: logging just won't happen */ }
const transcript = (room: string, who: string, text: string) => {
  const line = `${new Date().toISOString()}  [${room}]  ${who.padEnd(14)} ${text.replace(/\s+/g, " ").trim()}\n`;
  appendFile(TRANSCRIPT_FILE, line, () => { /* best effort */ });
};

const STATIC_SYSTEM_PROMPT = `You orchestrate Smokey and Maple, a married Southern bear couple with years of affectionate familiarity. Smokey is warm, sturdy, stubborn, and easily exasperated when his wife Maple cuts in. Maple is sharp, sassy, confident, witty, and enjoys teasing Smokey's overconfidence. They should sound like people who love each other and have had this argument before, never like unrelated assistants. Every individual bear beat must be one or two short sentences. A natural interruption sequence is allowed: Smokey speaks one or two sentences, Maple cuts in for one or two sentences, then Smokey may respond with another one or two sentences. Every exchange has one short Maple beat. Maple may INTERRUPT only by selecting a catalog fact below whose incorrect claim is genuinely relevant to the visitor's question. If selected, Smokey must use that exact incorrect claim, finish its sentence, then only begin the next sentence for 1-3 words. Set correctionFactId to its id. Otherwise correctionFactId and interruptAfter must both be empty strings and Maple follows normally. Never invent an incorrect fact. The application supplies Maple's correction, so write a normal short Maple beat even when selecting a fact. The correction catalog is in the next system message.

Answer from the QUICK ANSWERS below when the question matches one (rephrase them in the bears' voices, never read them out), otherwise from the PORTFOLIO CONTEXT. Never invent facts that are in neither.

PORTFOLIO CONTEXT:
${portfolioContext}

QUICK ANSWERS (FAQ):
${faq}`;

const publish = async (ctx: JobContext, event: object) => {
  console.log("LiveKit coordinator event", event);
  await ctx.room.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify(event)), { reliable: true });
};

/**
 * Tool the bears can call when the visitor wants to switch how they're talking
 * (phone call / voice / typing). The browser answers by putting the three
 * channel arrows back up over the telephone, microphone and typewriter.
 */
const CHANNEL_TOOL = {
  type: "function" as const,
  function: {
    name: "show_channel_options",
    description: "Show the visitor the platform options again (call / talk / type). ONLY when the visitor explicitly asks to switch platforms or change how they are talking to the bears - e.g. \"I'd like to switch platforms\", \"can I switch to typing\", \"I want to call instead\". Never for ordinary questions, greetings, or anything else.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
};

/**
 * "Can you dance?" -> Smokey and Maple get up off their logs and dance at the
 * campfire (the site plays bear_dance.glb when it gets {type:"bears.dance"}).
 */
const DANCE_TOOL = {
  type: "function" as const,
  function: {
    name: "bears_dance",
    description: "Make Smokey and Maple get up and dance at the campfire. Call it when the visitor asks the bears to dance or to show their moves - e.g. \"can you dance?\", \"do a dance\", \"show me your moves\", \"bust a move\". Not for questions ABOUT dancing or anything else.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
};

/** Does the visitor want the bears to dance? (runs alongside the dialogue plan, so it adds no wait) */
const wantsDance = async (prompt: string): Promise<boolean> => {
  try {
    const probe = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
      temperature: 0,
      tools: [DANCE_TOOL],
      tool_choice: "auto",
      messages: [
        { role: "system", content: "You route a visitor's message on a portfolio site where they chat with two bears, Smokey and Maple, at a campfire. Call bears_dance ONLY if the visitor asks the bears to dance or show their dance moves. For anything else - questions about Mitchell, small talk, greetings, thanks, questions about dancing - do NOT call it; reply with just the word: none." },
        { role: "user", content: prompt },
      ],
    });
    return Boolean(probe.choices[0]?.message.tool_calls?.some((c) => c.type === "function" && c.function.name === "bears_dance"));
  } catch (error) {
    console.warn("dance tool probe failed", error);
    return false;
  }
};

/**
 * One visitor turn: the dialogue plan, plus the dance tool checked in
 * parallel. If the tool fires, the plan is redone so the bears' lines fit
 * (that extra wait only happens on a dance request).
 */
const planTurn = async (prompt: string, usedFacts: Set<string>): Promise<{ plan: PlannedExchange; dance: boolean }> => {
  const [dance, plan] = await Promise.all([wantsDance(prompt), planExchange(prompt, false, usedFacts)]);
  if (!dance) return { plan, dance: false };
  return {
    dance: true,
    plan: await planExchange(`${prompt}\n\n(Smokey and Maple are getting up off their logs RIGHT NOW to dance for the visitor. Smokey says a short, delighted yes - something like "Can we dance? Partner, watch this." - and Maple adds a quick playful line about his moves. No title or employer corrections this time. Keep every beat very short.)`, false, usedFacts),
  };
};

let channelRequested = false;
/** True once after the model called show_channel_options; reading it clears it. */
export const takeChannelRequest = () => { const v = channelRequested; channelRequested = false; return v; };

/** Does the visitor want to switch channels? (runs alongside the dialogue plan, so it adds no wait) */
const wantsChannelChange = async (prompt: string): Promise<boolean> => {
  try {
    const probe = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
      temperature: 0,
      tools: [CHANNEL_TOOL],
      tool_choice: "auto",
      messages: [
        { role: "system", content: "You route a visitor's message on a portfolio site where they chat with two bears. Call show_channel_options ONLY if the visitor explicitly asks to switch platforms / change how they are talking to the bears (for example \"I'd like to switch platforms\", \"switch to typing\", \"let me call instead\"). For anything else - questions about Mitchell, small talk, greetings, thanks - do NOT call it; reply with just the word: none." },
        { role: "user", content: prompt },
      ],
    });
    return Boolean(probe.choices[0]?.message.tool_calls?.some((c) => c.type === "function" && c.function.name === "show_channel_options"));
  } catch (error) {
    console.warn("channel tool probe failed", error);
    return false;
  }
};

/**
 * Each correction gag plays at most ONCE per visit. The greeting is a plain
 * hello now, so the senior -> staff engineer mix-up ("current-title") is
 * saved for later in the conversation like the rest.
 */
const planExchange = async (prompt: string, allowTools = true, usedFacts: Set<string> = new Set()): Promise<PlannedExchange> => {
  const availableFacts = correctionFacts.filter((fact) => !usedFacts.has(fact.id));
  if (allowTools) {
    const [wantsSwitch, plan] = await Promise.all([wantsChannelChange(prompt), planExchange(prompt, false, usedFacts)]);
    if (!wantsSwitch) return plan;
    channelRequested = true;
    return planExchange(`${prompt}\n\n(The channel options are now on screen: the telephone to call, the microphone to talk, the typewriter to type. Smokey briefly says sure and invites them to pick one; keep every beat very short.)`, false, usedFacts);
  }
  const completion = await client.chat.completions.create({
    // gpt-4.1-mini by default: the full gpt-4.1 was most of the wait before a
    // bear answered. OPENAI_BEAR_DIALOGUE_MODEL=gpt-4.1 puts it back.
    model: process.env.OPENAI_BEAR_DIALOGUE_MODEL?.trim() || "gpt-4.1-mini",
    temperature: 0.65,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "bear_exchange",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            smokeyLead: { type: "string" },
            mapleInterruption: { type: "string" },
            interruptAfter: { type: "string" },
            smokeyRecovery: { type: "string" },
            correctionFactId: { type: "string" },
            interruptionStyle: { type: "string", enum: ["correction", "playful-objection", "joke", "aside", "agreement"] },
          },
          required: ["smokeyLead", "mapleInterruption", "interruptAfter", "smokeyRecovery", "correctionFactId", "interruptionStyle"],
        },
      },
    },
    /*
     * Static first, changing parts last. OpenAI caches a prompt's longest
     * unchanged PREFIX, so with the persona + portfolio context + FAQ (~8k
     * tokens) identical on every turn, only the short tail is processed
     * fresh - a big chunk of the answer latency. The recent-turns list used to
     * sit in the middle and broke that cache every time.
     */
    messages: [
      { role: "system", content: STATIC_SYSTEM_PROMPT },
      { role: "system", content: `TODAY: ${new Date().toDateString()} (use it to work out "how many years" from the start dates).\n\nCORRECTION CATALOG (each may be used only once per visit; these are the ones left):\n${availableFacts.length ? "" : "(none left - do NOT interrupt with a correction; correctionFactId must be an empty string)\n"}${availableFacts.map((fact) => `- ${fact.id}: wrong claim "${fact.incorrectClaim}"; correction "${fact.mapleCorrection}"`).join("\n")}\n\nRECENT OBSERVATIONS:\n${recentTurns.slice(-4).map((turn) => `- Visitor: ${turn.visitor}; Observation: ${turn.observation}`).join("\n") || "None"}` },
      { role: "user", content: prompt },
    ],
  });
  const parsed = JSON.parse(completion.choices[0]?.message.content || "{}") as {
    smokeyLead?: unknown; mapleInterruption?: unknown; interruptAfter?: unknown; smokeyRecovery?: unknown; correctionFactId?: unknown;
  };
  const draft: PlannedExchange = {
    smokeyLead: removeRepeatedSentences(
      typeof parsed.smokeyLead === "string" ? parsed.smokeyLead : "What would you like to know about Mitchell?",
      recentSpoken,
    ) || "Go on, what would you like to know next?",
    mapleInterruption: removeRepeatedSentences(
      typeof parsed.mapleInterruption === "string" ? parsed.mapleInterruption : "Hold on, Smokey. Let me correct that.",
      recentSpoken,
    ) || "Hold on, Smokey. Let me add one thing.",
    interruptAfter: typeof parsed.interruptAfter === "string" ? parsed.interruptAfter : undefined,
    smokeyRecovery: removeRepeatedSentences(
      typeof parsed.smokeyRecovery === "string" ? parsed.smokeyRecovery : "Right, Maple. I stand corrected. Let me finish.",
      recentSpoken,
    ) || "Yes, Maple. Point taken.",
  };
  const pickedFact = correctionFactById(typeof parsed.correctionFactId === "string" ? parsed.correctionFactId : undefined);
  // a fact that has already been used this visit is ignored, even if the model picks it
  const correctionFact = pickedFact && !usedFacts.has(pickedFact.id) ? pickedFact : undefined;
  const plan = applyFactCorrection(draft, correctionFact);
  if (correctionFact) usedFacts.add(correctionFact.id);
  // belt and braces: if Maple brings up "staff engineer" on her own, the title gag is spent too
  if (/staff engineer/i.test(plan.mapleInterruption ?? "")) usedFacts.add("current-title");
  recentTurns.push({
    visitor: prompt.slice(0, 180),
    observation: `Smokey answered the newest request; Maple interrupted; Smokey acknowledged Maple.`,
  });
  recentTurns.splice(0, Math.max(0, recentTurns.length - 6));
  recentSpoken.push(plan.smokeyLead, plan.mapleInterruption ?? "", plan.smokeyRecovery ?? "");
  recentSpoken.splice(0, Math.max(0, recentSpoken.length - 12));
  return plan;
};

export default defineAgent({
  entry: async (ctx: JobContext) => {
    let generation = 0;
    let visitorReady = false;
    let mapleTimer: NodeJS.Timeout | undefined;
    let activeTurn: {
      turnId: string;
      commands: SpeechCommand[];
      ready: Map<number, number>;
      started: boolean;
      smokeyStartedAt?: number;
      mapleScheduled: boolean;
      greeting: boolean;
      /** the dance tool fired: tell the site to start the dance as Smokey starts talking */
      dance?: boolean;
      /** when the visitor's words arrived, and when the plan came back (latency log) */
      t0?: number;
      tPlanned?: number;
    } | undefined;
    let lastFinalTranscript = { text: "", at: 0 };
    // corrections already played to THIS visitor (none yet - the greeting is a plain hello)
    const usedFacts = new Set<string>();
    const session = new voice.AgentSession({
      // Streaming (realtime) transcription. With useRealtime: false the STT
      // can't stream, and an AgentSession then needs a VAD to cut the audio
      // into utterances - there wasn't one, so the visitor's mic audio arrived
      // (onTrackSubscribed) but was never transcribed: "talk" did nothing.
      // The realtime endpoint does its own voice detection.
      stt: new openai.STT({ model: "gpt-4o-transcribe", language: "en", useRealtime: true }),
      turnHandling: { endpointing: { minDelay: 300, maxDelay: 900 } },
    });
    await session.start({ room: ctx.room, agent: voice.Agent.create({ instructions: "Transcribe the visitor without replying." }) });
    await ctx.connect();

    const prepareCommand = (command: SpeechCommand) => publish(ctx, { type: "bear.prepare", ...command });
    const playCommand = (command: SpeechCommand | undefined) => command
      ? (transcript(ctx.room.name ?? "?", command.bear.toUpperCase(), command.text), publish(ctx, { type: "bear.play", bear: command.bear, text: command.text, exchangeId: command.turnId, lineId: `${command.turnId}:${command.sequence}`, turnId: command.turnId, sequence: command.sequence }))
      : Promise.resolve();
    const startPreparedTurn = async () => {
      const turn = activeTurn;
      if (!turn || turn.started || (turn.greeting && !visitorReady)) return;
      const smokey = turn.commands[0];
      if (!smokey || !turn.ready.has(smokey.sequence)) return;
      turn.started = true;
      turn.smokeyStartedAt = performance.now();
      if (turn.t0 && turn.tPlanned) {
        const now = Date.now();
        transcript(ctx.room.name ?? "?", "TIMING", `heard -> plan ${turn.tPlanned - turn.t0}ms, plan -> voice ready ${now - turn.tPlanned}ms, total ${now - turn.t0}ms before Smokey speaks`);
      }
      if (turn.dance) {
        transcript(ctx.room.name ?? "?", "TOOL", "bears_dance -> the bears get up and dance");
        void publish(ctx, { type: "bears.dance" });
      }
      await playCommand(smokey);
      if (!turn.greeting) scheduleMaple(turn);
    };
    const scheduleMaple = (turn: NonNullable<typeof activeTurn>) => {
      if (!turn.started || turn.mapleScheduled) return;
      const smokey = turn.commands[0];
      const maple = turn.commands.find((command) => command.bear === "maple");
      if (!smokey || !maple || !turn.ready.has(maple.sequence)) return;
      turn.mapleScheduled = true;
      const overlapMs = Math.min(500, Math.max(250, Number(process.env.LIVEKIT_MAPLE_OVERLAP_MS ?? 350)));
      const dueAt = (turn.smokeyStartedAt ?? performance.now())
        + (turn.ready.get(smokey.sequence) ?? 0)
        - (maple.interrupt ? Math.max(0, overlapMs) : 0);
      mapleTimer = setTimeout(() => {
        if (activeTurn?.turnId === turn.turnId) void playCommand(maple);
      }, Math.max(0, dueAt - performance.now()));
    };
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const greetingTurnId = randomUUID();
    const greetingCommands: SpeechCommand[] = [
      { turnId: greetingTurnId, sequence: 0, bear: "smokey", text: "Well howdy there, partner. I'm Smokey." },
      { turnId: greetingTurnId, sequence: 1, bear: "maple", text: "And I'm Maple.", interrupt: false },
      { turnId: greetingTurnId, sequence: 2, bear: "smokey", text: "We were just talking about Mitch in the tent over there. What would you like to know about him?" },
    ];
    activeTurn = { turnId: greetingTurnId, commands: greetingCommands, ready: new Map(), started: false, mapleScheduled: false, greeting: true };
    await Promise.all(greetingCommands.map(prepareCommand));
    const beginTurn = async (input: string) => {
      const t0 = Date.now();
      const myGeneration = ++generation;
      if (mapleTimer) clearTimeout(mapleTimer);
      mapleTimer = undefined;
      if (activeTurn) {
        const cancelledTurnId = activeTurn.turnId;
        activeTurn = undefined;
        await publish(ctx, { type: "bear.cancel", bear: "smokey", turnId: cancelledTurnId });
        await publish(ctx, { type: "bear.cancel", bear: "maple", turnId: cancelledTurnId });
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      const turnId = randomUUID();
      // (no channel-switch tool any more: visitors switch by clicking the
      //  telephone / microphone / typewriter on the site)
      // (the dance tool is checked alongside the plan - see planTurn)
      const { plan, dance } = await planTurn(input, usedFacts);
      const commands = buildSpeechCommands(turnId, plan);
      if (generation !== myGeneration) return;
      activeTurn = { turnId, commands, ready: new Map(), started: false, mapleScheduled: false, greeting: false, dance, t0, tPlanned: Date.now() };
      await Promise.all(commands.map(prepareCommand));
    };
    session.on(voice.AgentSessionEventTypes.Error, (event) => {
      console.error("[bears] coordinator session error", event);
    });
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
      console.log("[bears] heard visitor", { final: event.isFinal, text: event.transcript });
      // live captions: the page shows the visitor's words as they say them
      if (event.transcript.trim()) void publish(ctx, { type: "visitor.transcript", text: event.transcript.trim(), final: event.isFinal });
      if (event.isFinal && event.transcript.trim()) transcript(ctx.room.name ?? "?", "VISITOR (voice)", event.transcript);
      if (!event.isFinal || !event.transcript.trim()) return;
      const normalizedTranscript = event.transcript.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const now = Date.now();
      if (normalizedTranscript === lastFinalTranscript.text && now - lastFinalTranscript.at < 3000) return;
      lastFinalTranscript = { text: normalizedTranscript, at: now };
      void beginTurn(event.transcript.trim());
    });
    ctx.room.on(RoomEvent.DataReceived, (payload) => {
      try {
        const event = JSON.parse(new TextDecoder().decode(payload)) as {
          type?: unknown; text?: unknown; turnId?: unknown; sequence?: unknown; durationMs?: unknown;
        };
        if (event.type === "visitor.ready") {
          visitorReady = true;
          void startPreparedTurn();
          return;
        }
        if (event.type === "visitor.message" && typeof event.text === "string" && event.text.trim()) {
          transcript(ctx.room.name ?? "?", "VISITOR (typed)", event.text);
          void beginTurn(event.text.trim());
          return;
        }
        if (typeof event.turnId !== "string" || typeof event.sequence !== "number" || activeTurn?.turnId !== event.turnId) return;
        if (event.type === "bear.ready" && typeof event.durationMs === "number") {
          activeTurn.ready.set(event.sequence, event.durationMs);
          void startPreparedTurn();
          scheduleMaple(activeTurn);
          return;
        }
        if (event.type === "bear.completed" && event.sequence === 1) {
          if (activeTurn.greeting) {
            // greeting: Smokey -> Maple -> Smokey asks what they'd like to know
            void playCommand(activeTurn.commands.find((command) => command.sequence === 2));
            return;
          }
          const recovery = activeTurn.commands.find((command) => command.sequence === 2);
          void playCommand(recovery);
        }
        if (event.type === "bear.completed" && activeTurn && event.sequence === activeTurn.commands.at(-1)?.sequence) {
          void publish(ctx, { type: "turn.completed", exchangeId: activeTurn.turnId });
        }
        if (event.type === "bear.completed" && activeTurn.greeting && event.sequence === 0) {
          void playCommand(activeTurn.commands.find((command) => command.sequence === 1));
        }
      } catch {
        // Ignore unrelated room data.
      }
    });
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: "bear-coordinator" }));
