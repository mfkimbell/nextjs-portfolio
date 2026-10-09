import { config as loadEnv } from "dotenv";
import OpenAI from "openai";
import { cli, defineAgent, type JobContext, ServerOptions, voice } from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import { RoomEvent } from "@livekit/rtc-node";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { correctionFactById, correctionFacts } from "./correction-facts/index.js";
import { applyFactCorrection, buildSpeechCommands, removeRepeatedSentences, type PlannedExchange, type SpeechCommand } from "./livekit-orchestrator/index.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(sourceDirectory, "../../nextjs/.env") });
const portfolioContext = readFileSync(resolve(sourceDirectory, "../knowledge/mitchell-kimbell-context.md"), "utf8");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const recentTurns: Array<{ visitor: string; observation: string }> = [];
const recentSpoken: string[] = [];

const publish = async (ctx: JobContext, event: object) => {
  console.log("LiveKit coordinator event", event);
  await ctx.room.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify(event)), { reliable: true });
};

const planExchange = async (prompt: string): Promise<PlannedExchange> => {
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_BEAR_DIALOGUE_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4.1",
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
    messages: [{
      role: "system",
      content: `You orchestrate Smokey and Maple, a married Southern bear couple with years of affectionate familiarity. Smokey is warm, sturdy, stubborn, and easily exasperated when his wife Maple cuts in. Maple is sharp, sassy, confident, witty, and enjoys teasing Smokey's overconfidence. They should sound like people who love each other and have had this argument before, never like unrelated assistants. Every individual bear beat must be one or two short sentences. A natural interruption sequence is allowed: Smokey speaks one or two sentences, Maple cuts in for one or two sentences, then Smokey may respond with another one or two sentences. Every exchange has one short Maple beat. Maple may INTERRUPT only by selecting a catalog fact below whose incorrect claim is genuinely relevant to the visitor's question. If selected, Smokey must use that exact incorrect claim, finish its sentence, then only begin the next sentence for 1-3 words. Set correctionFactId to its id. Otherwise correctionFactId and interruptAfter must both be empty strings and Maple follows normally. Never invent an incorrect fact. The application supplies Maple's correction, so write a normal short Maple beat even when selecting a fact.\n\nCORRECTION CATALOG:\n${correctionFacts.map((fact) => `- ${fact.id}: wrong claim "${fact.incorrectClaim}"; correction "${fact.mapleCorrection}"`).join("\n")}\n\nRECENT OBSERVATIONS:\n${recentTurns.slice(-4).map((turn) => `- Visitor: ${turn.visitor}; Observation: ${turn.observation}`).join("\n") || "None"}\n\nPORTFOLIO CONTEXT:\n${portfolioContext}`,
    }, { role: "user", content: prompt }],
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
  const correctionFact = correctionFactById(typeof parsed.correctionFactId === "string" ? parsed.correctionFactId : undefined);
  const plan = applyFactCorrection(draft, correctionFact);
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
    } | undefined;
    let lastFinalTranscript = { text: "", at: 0 };
    const session = new voice.AgentSession({
      stt: new openai.STT({ model: "gpt-4o-transcribe", language: "en", useRealtime: false }),
      turnHandling: { endpointing: { minDelay: 300, maxDelay: 900 } },
    });
    await session.start({ room: ctx.room, agent: voice.Agent.create({ instructions: "Transcribe the visitor without replying." }) });
    await ctx.connect();

    const prepareCommand = (command: SpeechCommand) => publish(ctx, { type: "bear.prepare", ...command });
    const playCommand = (command: SpeechCommand | undefined) => command
      ? publish(ctx, { type: "bear.play", bear: command.bear, text: command.text, exchangeId: command.turnId, lineId: `${command.turnId}:${command.sequence}`, turnId: command.turnId, sequence: command.sequence })
      : Promise.resolve();
    const startPreparedTurn = async () => {
      const turn = activeTurn;
      if (!turn || turn.started || (turn.greeting && !visitorReady)) return;
      const smokey = turn.commands[0];
      if (!smokey || !turn.ready.has(smokey.sequence)) return;
      turn.started = true;
      turn.smokeyStartedAt = performance.now();
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
      { turnId: greetingTurnId, sequence: 2, bear: "smokey", text: "And we were just talking about Mitch, our favorite senior engineer. So—", interrupt: true },
      { turnId: greetingTurnId, sequence: 3, bear: "maple", text: "Actually, Smokey, Mitchell is a staff engineer.", interrupt: true },
      { turnId: greetingTurnId, sequence: 4, bear: "smokey", text: "Right, our favorite staff engineer. So what would you like to know about him?" },
    ];
    activeTurn = { turnId: greetingTurnId, commands: greetingCommands, ready: new Map(), started: false, mapleScheduled: false, greeting: true };
    await Promise.all(greetingCommands.map(prepareCommand));
    const beginTurn = async (input: string) => {
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
      const commands = buildSpeechCommands(turnId, await planExchange(input));
      if (generation !== myGeneration) return;
      activeTurn = { turnId, commands, ready: new Map(), started: false, mapleScheduled: false, greeting: false };
      await Promise.all(commands.map(prepareCommand));
    };
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
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
            const seniorLine = activeTurn.commands.find((command) => command.sequence === 2);
            const mapleCorrection = activeTurn.commands.find((command) => command.sequence === 3);
            if (seniorLine && mapleCorrection) {
              void playCommand(seniorLine);
              const overlapMs = Math.min(500, Math.max(250, Number(process.env.LIVEKIT_MAPLE_OVERLAP_MS ?? 350)));
              mapleTimer = setTimeout(() => {
                if (activeTurn?.turnId === event.turnId) void playCommand(mapleCorrection);
              }, Math.max(120, (activeTurn.ready.get(seniorLine.sequence) ?? 0) - overlapMs));
            }
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
        if (event.type === "bear.completed" && activeTurn.greeting && event.sequence === 3) {
          void playCommand(activeTurn.commands.find((command) => command.sequence === 4));
        }
      } catch {
        // Ignore unrelated room data.
      }
    });
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: "bear-coordinator" }));
