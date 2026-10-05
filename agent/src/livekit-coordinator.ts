import { config as loadEnv } from "dotenv";
import OpenAI from "openai";
import { cli, defineAgent, type JobContext, ServerOptions, voice } from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import { RoomEvent } from "@livekit/rtc-node";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSpeechCommands, removeRepeatedSentences, type PlannedExchange, type SpeechCommand } from "./livekit-orchestrator/index.js";

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
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
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
            interruptionStyle: { type: "string", enum: ["correction", "playful-objection", "joke", "aside", "agreement"] },
          },
          required: ["smokeyLead", "mapleInterruption", "interruptAfter", "smokeyRecovery", "interruptionStyle"],
        },
      },
    },
    messages: [{
      role: "system",
      content: `You orchestrate Smokey and Maple, a married Southern bear couple with years of affectionate familiarity. Smokey is warm, sturdy, stubborn, and easily exasperated when his wife Maple cuts in. Maple is sharp, sassy, confident, witty, and enjoys teasing Smokey's overconfidence. They should sound like people who love each other and have had this argument before, never like unrelated assistants. Every exchange has one short Maple beat. Maple only INTERRUPTS for a genuine factual correction. Otherwise Maple follows after Smokey with a joke, aside, agreement, or playful objection and interruptAfter must be an empty string. For a correction, Smokey must finish the incorrect sentence and begin the next sentence for 2–5 words before Maple cuts him off. interruptAfter must copy the exact text through those opening words. Example shape only: '...wrong claim. And he was also—' then Maple says 'Actually, Smokey...' and corrects the previous sentence. Do not reuse the senior/staff engineer title gag in generated conversation unless the visitor explicitly asks about Mitchell's title; that gag belongs to the authored greeting. Do not invent factual errors just to create an interruption. Answer only the newest visitor turn and never repeat earlier sentences. Smokey's recovery must sound exasperated but affectionate while acknowledging Maple's actual point. Use relaxed Southern phrasing naturally, without caricature. Return spoken text only, no labels inside lines.\n\nRECENT OBSERVATIONS:\n${recentTurns.slice(-4).map((turn) => `- Visitor: ${turn.visitor}; Observation: ${turn.observation}`).join("\n") || "None"}\n\nPORTFOLIO CONTEXT:\n${portfolioContext}`,
    }, { role: "user", content: prompt }],
  });
  const parsed = JSON.parse(completion.choices[0]?.message.content || "{}") as {
    smokeyLead?: unknown; mapleInterruption?: unknown; interruptAfter?: unknown; smokeyRecovery?: unknown;
  };
  const plan: PlannedExchange = {
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
      ? publish(ctx, { type: "bear.play", bear: command.bear, turnId: command.turnId, sequence: command.sequence })
      : Promise.resolve();
    const startPreparedTurn = async () => {
      const turn = activeTurn;
      if (!turn || turn.started) return;
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
      const overlapMs = Number(process.env.LIVEKIT_MAPLE_OVERLAP_MS ?? 850);
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
      { turnId: greetingTurnId, sequence: 2, bear: "smokey", text: "And we were just talking about Mitch, our favorite senior engineer." },
      { turnId: greetingTurnId, sequence: 3, bear: "maple", text: "Actually, staff engineer, Smokey.", interrupt: true },
      { turnId: greetingTurnId, sequence: 4, bear: "smokey", text: "Right, staff engineer. What would you like to know about Mitch?" },
    ];
    activeTurn = { turnId: greetingTurnId, commands: greetingCommands, ready: new Map(), started: false, mapleScheduled: false, greeting: true };
    await Promise.all(greetingCommands.map(prepareCommand));
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
      if (!event.isFinal || !event.transcript.trim()) return;
      const normalizedTranscript = event.transcript.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const now = Date.now();
      if (normalizedTranscript === lastFinalTranscript.text && now - lastFinalTranscript.at < 3000) return;
      lastFinalTranscript = { text: normalizedTranscript, at: now };
      void (async () => {
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
        const commands = buildSpeechCommands(turnId, await planExchange(event.transcript.trim()));
        if (generation !== myGeneration) return;
        activeTurn = { turnId, commands, ready: new Map(), started: false, mapleScheduled: false, greeting: false };
        await Promise.all(commands.map(prepareCommand));
      })();
    });
    ctx.room.on(RoomEvent.DataReceived, (payload) => {
      try {
        const event = JSON.parse(new TextDecoder().decode(payload)) as {
          type?: unknown; turnId?: unknown; sequence?: unknown; durationMs?: unknown;
        };
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
              const overlapMs = Number(process.env.LIVEKIT_MAPLE_OVERLAP_MS ?? 850);
              mapleTimer = setTimeout(() => {
                if (activeTurn?.turnId === event.turnId) void playCommand(mapleCorrection);
              }, Math.max(120, (activeTurn.ready.get(seniorLine.sequence) ?? 0) - overlapMs));
            }
            return;
          }
          const recovery = activeTurn.commands.find((command) => command.sequence === 2);
          void playCommand(recovery);
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
