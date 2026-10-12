"use client";

import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type ReactElement } from "react";
import localFont from "next/font/local";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CornerDownLeft, Mic, Pencil } from "lucide-react";
import { type BearDialogueProps } from "./bear-dialogue.types";
import DialoguePlaque from "./dialogue-plaque";
import { headTextReserve, NO_TEXT_RESERVE, SMOKEY_ICON_CLASS, smokeyIconStyle, type HeadCorner, type SmokeyIconSettings } from "./smokey-icon";
import SmokeyTextFlow from "./smokey-text-flow";
import { useArtworkOutline } from "./artwork-outline";
import { jellyCornerFraction } from "./jelly-path";
import JellyBackdrop from "./jelly-backdrop";

type DialogueMode = "speak" | "type";

const fredokaOne = localFont({
  src: "../../../font/fredoka-one.one-regular.otf",
  display: "swap",
});
const finkHeavy = localFont({ src: "../../../public/font/FinkHeavy.ttf", display: "swap" });
const superSmash = localFont({ src: "../../../public/fonts/super-smash-4-1.ttf", display: "swap" });
const dialogueFonts = [fredokaOne, finkHeavy, superSmash];

// Compatible cloud contours give the bubbles a gentle, polished living outline
// without pushing the text box around while someone is speaking.
const bubblePathVariants = [
  "M116 38 C74 31 44 56 49 94 C14 113 19 162 53 175 C38 216 70 253 116 248 C143 277 198 272 220 248 C268 270 321 261 344 238 C393 264 451 258 475 232 C523 260 578 260 607 234 C650 259 710 263 739 238 C775 265 831 274 860 247 C909 255 948 224 939 184 C975 167 981 117 947 97 C956 58 925 31 882 39 C832 19 783 30 756 54 C699 23 640 28 606 53 C553 25 499 28 470 54 C416 24 357 29 331 55 C274 26 212 28 187 55 C164 41 139 35 116 38 Z",
  "M114 40 C73 29 46 58 51 96 C17 115 21 160 55 174 C40 215 72 251 118 247 C146 276 199 270 222 246 C268 268 320 260 347 236 C396 262 448 257 478 234 C523 258 580 261 610 237 C653 261 708 260 742 235 C779 264 832 271 862 245 C911 253 946 222 937 182 C974 165 978 119 944 99 C954 57 923 33 880 41 C831 20 786 31 754 56 C701 26 642 30 608 55 C555 27 500 29 468 56 C417 26 360 31 329 57 C274 29 214 30 185 57 C161 42 137 36 114 40 Z",
  "M118 36 C78 32 45 54 48 92 C15 111 20 163 54 177 C39 218 69 255 114 250 C142 279 196 274 218 250 C266 272 324 264 346 241 C395 266 452 260 474 235 C522 262 576 259 605 236 C652 263 712 267 740 241 C778 267 830 276 858 249 C907 257 950 226 941 186 C977 168 982 116 948 95 C958 56 928 30 884 37 C835 17 781 28 758 52 C700 21 639 27 604 51 C553 23 497 26 472 52 C416 22 355 27 333 53 C274 24 211 27 189 53 C164 39 139 33 118 36 Z",
];

const BearDialogue = ({ agent, chatMode, phoneNumber, onChangeChannel, opacity, blurPx, scale, bottomRem, font, motionOn, popStiffness, leftTiltDeg, rightTiltDeg, widthRem, minHeightRem, roundness, waveAmplitude, waveSpeed, waveSpacing, textSizeRem, textPadTopRem, textPadRightRem, textPadBottomRem, textPadLeftRem, textColor, borderOn, borderWidthPx, borderColor, nameTagXRem, nameTagYRem, nameTagScale, nameTagAnchor, nameTagInsetXRem, nameTagInsetYRem, mapleNameTagXRem, mapleNameTagYRem, mapleNameTagScale, mapleNameTagInsetXRem, mapleNameTagInsetYRem, nameTagWaveAmplitude, nameTagWaveSpeed, nameTagWaveSpacing, nameTagRoundness, nameTagOutlineOn, nameTagOutlineWidthPx, nameTagOutlineColor, smokeyTagFill, smokeyTagShadow, mapleTagFill, mapleTagShadow, youTagFill, youTagShadow, smokeyNameTiltDeg, mapleNameTiltDeg, smokeyIconSizeRem, smokeyIconInsetXRem, smokeyIconInsetYRem, smokeyIconMarginXRem, smokeyIconMarginYRem, smokeyIconKeepInside, smokeyIconTiltDeg, smokeyIconOpacity, smokeyIconBorderOn, smokeyIconBorderWidthPx, smokeyIconBorderColor, smokeyIconShadowXRem, smokeyIconShadowYRem, smokeyIconShadowBlurPx, smokeyIconShadowLayers, smokeyIconShadowOpacity, smokeyIconShadowColor, smokeyIconGlowPx, smokeyIconGlowPasses, smokeyIconGlowOpacity, smokeyIconGlowColor }: BearDialogueProps) => {
  const [mode, setMode] = useState<DialogueMode>("speak");
  const [message, setMessage] = useState("");
  const [typedReply, setTypedReply] = useState<string | null>(null);
  const [typedError, setTypedError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const lastSpeakerRef = useRef<string | null>(null);
  const lastSpokenTextRef = useRef<string | null>(null);
  const reducedMotion = useReducedMotion();
  const { activeSpeakerName, dialoguePhase, error, isRemoteSpeaking, microphonePermission, requestMicrophone, sendTextMessage, spokenText: anySpokenText, spokenByBear, start, status } = agent;
  const needsMicrophone = microphonePermission !== "granted" && microphonePermission !== "unsupported";
  const isActive = status === "active";
  const isConnecting = status === "connecting";
  if (activeSpeakerName) lastSpeakerRef.current = activeSpeakerName;

  const displaySpeakerName = activeSpeakerName ?? lastSpeakerRef.current;
  const speaker = displaySpeakerName ?? "Smokey & Maple";
  const isMaple = displaySpeakerName === "Maple";
  const nameTagPosition = displaySpeakerName
    ? isMaple ? "right-7 rotate-[3deg]" : "left-7 rotate-[-3deg]"
    : "left-1/2 -translate-x-1/2 rotate-[-1deg]";
  // Pinned to the plaque's own top corner by the tag's edge, so a narrower
  // bubble moves the tag with it instead of letting it drift off the side.
  // Insets measure corner to tag edge, so a negative value overhangs on purpose.
  // The tag hangs off the blob's own corner, never the box corner.
  const plaqueCorner = jellyCornerFraction(roundness);
  const nameTagAnchored = nameTagAnchor >= 0.5 && Boolean(displaySpeakerName);
  // A zero-size marker sitting on the blob's corner; the tag hangs off it by
  // its own corner, so scaling grows it onto the bubble, never away from it.
  // both tags hang off the bubble's top-LEFT corner (Maple keeps her own sliders)
  const nameTagMarker = { left: `${(plaqueCorner.x * 100).toFixed(2)}%`, top: `${(plaqueCorner.y * 100).toFixed(2)}%` };
  const tagX = isMaple ? (mapleNameTagXRem ?? nameTagXRem) + (mapleNameTagInsetXRem ?? nameTagInsetXRem) : nameTagXRem + nameTagInsetXRem;
  const tagY = isMaple ? (mapleNameTagYRem ?? nameTagYRem) + (mapleNameTagInsetYRem ?? nameTagInsetYRem) : nameTagYRem + nameTagInsetYRem;
  const tagScale = isMaple ? (mapleNameTagScale ?? nameTagScale) : nameTagScale;
  const nameTagTransform = `translate(${tagX}em, ${tagY}em) rotate(${isMaple ? mapleNameTiltDeg : smokeyNameTiltDeg}deg) scale(${tagScale})`;
  const nameTagFill = isMaple ? mapleTagFill : smokeyTagFill;
  const nameTagShadow = isMaple ? mapleTagShadow : smokeyTagShadow;
  const nameTagJelly = { stroke: nameTagOutlineColor, strokeWidthPx: nameTagOutlineOn >= 0.5 ? nameTagOutlineWidthPx : 0, shadowYPx: 3, amplitude: nameTagWaveAmplitude, speed: nameTagWaveSpeed, spacing: nameTagWaveSpacing, roundness: nameTagRoundness, motionOn };
  const bubblePosition = displaySpeakerName
    ? isMaple ? "right-4 sm:right-8" : "left-4 sm:left-8"
    : "left-1/2 -translate-x-1/2";
  const bubbleTilt = displaySpeakerName ? isMaple ? rightTiltDeg : leftTiltDeg : 0;
  const dialogueFont = dialogueFonts[Math.round(font)] ?? fredokaOne;
  const animateDialogue = motionOn >= 0.5 && !reducedMotion;
  const smokeyIcon: SmokeyIconSettings = {
    sizeRem: smokeyIconSizeRem,
    insetXRem: smokeyIconInsetXRem,
    insetYRem: smokeyIconInsetYRem,
    marginXRem: smokeyIconMarginXRem,
    marginYRem: smokeyIconMarginYRem,
    keepInside: smokeyIconKeepInside,
    tiltDeg: smokeyIconTiltDeg,
    opacity: smokeyIconOpacity,
    outlineOn: smokeyIconBorderOn,
    outlineWidthPx: smokeyIconBorderWidthPx,
    outlineColor: smokeyIconBorderColor,
    shadowXRem: smokeyIconShadowXRem,
    shadowYRem: smokeyIconShadowYRem,
    shadowBlurPx: smokeyIconShadowBlurPx,
    shadowLayers: smokeyIconShadowLayers,
    shadowOpacity: smokeyIconShadowOpacity,
    shadowColor: smokeyIconShadowColor,
    glowPx: smokeyIconGlowPx,
    glowPasses: smokeyIconGlowPasses,
    glowOpacity: smokeyIconGlowOpacity,
    glowColor: smokeyIconGlowColor,
  };
  // Each bear's head sits in the corner of their own bubble (same placement
  // sliders for both), and the text flows around its actual outline.
  const smokeyOutline = useArtworkOutline("/smokey_head.png");
  const mapleOutline = useArtworkOutline("/maple-head.png");
  const headSrc = displaySpeakerName === "Smokey" ? "/smokey_head.png" : displaySpeakerName === "Maple" ? "/maple-head.png" : null;
  // both heads sit in the bottom-RIGHT corner of their bubble
  // (headTextReserve / smokeyIconStyle can also do "left" if that's wanted again)
  const headCorner: HeadCorner = "right";
  const textReserve = headSrc
    ? headTextReserve(smokeyIcon, { widthRem, paddingRightRem: textPadRightRem, paddingLeftRem: textPadLeftRem, paddingBottomRem: textPadBottomRem }, isMaple ? mapleOutline : smokeyOutline, headCorner)
    : NO_TEXT_RESERVE;
  void bubblePathVariants;

  const yourTurn = dialoguePhase === "your-turn" && !isRemoteSpeaking;
  /*
   * Every time a bear STARTS a line the bubble pops up fresh (a new key), and
   * when they stop it pops away - no sliding the box or the name tag from one
   * side to the other. A short hold after the voice drops bridges the gaps
   * between words/sentences so it doesn't flicker mid-line.
   */
  const [utterance, setUtterance] = useState(0);
  const [bubbleSpeaker, setBubbleSpeaker] = useState<string | null>(null);
  const [talking, setTalking] = useState(false);
  useEffect(() => {
    if (isRemoteSpeaking) {
      if (!talking || (activeSpeakerName && activeSpeakerName !== bubbleSpeaker)) {
        setUtterance((n) => n + 1);
        setBubbleSpeaker(activeSpeakerName ?? bubbleSpeaker);
      }
      setTalking(true);
      return;
    }
    if (!talking) return;
    const t = window.setTimeout(() => setTalking(false), 650);
    return () => window.clearTimeout(t);
  }, [isRemoteSpeaking, activeSpeakerName, talking, bubbleSpeaker]);
  // the bubble's own bear's line - never the other bear's
  const lineSpeaker = (talking ? bubbleSpeaker : null) ?? activeSpeakerName ?? lastSpeakerRef.current;
  const spokenText = spokenByBear
    ? (lineSpeaker === "Smokey" || lineSpeaker === "Maple" ? spokenByBear[lineSpeaker] : null)
    : anySpokenText;
  // (only fall back to "the last line" when there is no per-bear text at all)
  if (spokenText && !spokenByBear) lastSpokenTextRef.current = spokenText;
  useEffect(() => {
    if (chatMode === "type") return;
    if (status === "connecting" || status === "active") setMode("speak");
  }, [status, chatMode]);
  /*
   * Typing mode: the typing bubble is up whenever the bears aren't talking.
   * It used to wait for the agent's "your turn" signal, which never came if
   * the greeting ended some other way - so picking the typewriter could leave
   * no box at all. After a send it stays down until the bears have answered
   * (they start and stop talking), or 25 s if they never do.
   */
  const awaitingReply = useRef(false);
  const heardReply = useRef(false);
  useEffect(() => {
    if (chatMode !== "type") return;
    if (talking) { if (awaitingReply.current) heardReply.current = true; return; }
    if (awaitingReply.current && !heardReply.current) return;
    awaitingReply.current = false;
    heardReply.current = false;
    setMode("type");
  }, [chatMode, talking]);
  useEffect(() => {
    if (chatMode !== "type" || mode === "type" || !awaitingReply.current) return;
    const t = window.setTimeout(() => { awaitingReply.current = false; heardReply.current = false; if (!talking) setMode("type"); }, 25000);
    return () => window.clearTimeout(t);
  }, [chatMode, mode, talking]);

  useEffect(() => {
    if (isRemoteSpeaking) {
      setMode("speak");
    }
  }, [isRemoteSpeaking]);

  const handleSpeak = () => {
    setMode("speak");
    if (needsMicrophone) {
      void requestMicrophone();
      return;
    }
    void start();
  };

  const handleType = () => {
    setMode("type");
  };

  const handleMessageChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(event.target.value);
  };

  const handleSubmitMessage = async () => {
    if (!message.trim()) return;
    setIsSending(true);
    setTypedError(null);
    try {
      if (sendTextMessage) {
        const sent = await sendTextMessage(message);
        if (!sent) throw new Error("Start a conversation before sending a message.");
        setMessage("");
        awaitingReply.current = true;
        heardReply.current = false;
        setMode("speak");
        return;
      }
      const response = await fetch("/api/bears/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const payload = await response.json() as { reply?: unknown; error?: unknown };
      if (!response.ok || typeof payload.reply !== "string") {
        throw new Error(typeof payload.error === "string" ? payload.error : "The bears could not answer right now.");
      }
      setTypedReply(payload.reply);
      setMessage("");
    } catch (submitError) {
      setTypedError(submitError instanceof Error ? submitError.message : "The bears could not answer right now.");
    } finally {
      setIsSending(false);
    }
  };

  const handleBack = () => {
    setMode("speak");
  };

  const popIn = { opacity: 0, scale: 0.35, y: 18 };
  const popTransition = animateDialogue
    ? { type: "spring" as const, stiffness: Math.max(120, popStiffness), damping: 16, mass: 0.7 }
    : { duration: 0 };
  const popExit = animateDialogue
    ? { opacity: 0, scale: 0.4, y: 12, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] as [number, number, number, number] } }
    : { opacity: 0, transition: { duration: 0 } };

  let content: ReactElement | null = null;
  const showLine = talking || mode === "type" || Boolean(error);
  if (!showLine && !chatMode && dialoguePhase === "your-turn") {
    content = (
      <motion.section
        key="your-turn"
        exit={popExit}
        aria-label="Your turn to talk to the bears"
        initial={animateDialogue ? popIn : false}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={popTransition}
        style={{ "--bear-dialogue-font": dialogueFont.style.fontFamily, bottom: `${bottomRem}rem`, width: `min(84vw, ${Math.min(widthRem, 24)}rem)`, minWidth: "min(78vw, 18rem)", containerType: "inline-size" } as CSSProperties}
        className={`${dialogueFont.className} bear-dialogue-font pointer-events-auto absolute left-1/2 z-30 -translate-x-1/2 text-stone-700`}
      >
        <DialoguePlaque opacity={opacity} blurPx={blurPx} scale={scale} borderOn={borderOn} borderWidthPx={borderWidthPx} borderColor={borderColor} motionOn={motionOn} waveAmplitude={waveAmplitude} waveSpeed={waveSpeed} waveSpacing={waveSpacing} roundness={roundness} designWidthRem={Math.min(widthRem, 24)} minHeight={`${Math.min(minHeightRem, 18)}em`}>
            <p style={{ fontSize: "2.25em", lineHeight: 1.1, padding: "3.5em 3.5em 0" }} className="relative text-center font-normal text-[#6e6b5c]">Your turn, partner.</p>
            <div className="relative mt-4 flex justify-center gap-3">
              <button type="button" onClick={handleSpeak} aria-label="Speak to the bears" className="rounded-full border-2 border-[#51493a] bg-[#ffe78f] p-3 text-[#51493a] shadow-[0_3px_0_#b9904e] transition hover:-translate-y-0.5"><Mic size={20} strokeWidth={2.5} /></button>
              <button type="button" onClick={handleType} aria-label="Type to the bears" className="rounded-full border-2 border-[#51493a] bg-[#fff8e5] p-3 text-[#51493a] shadow-[0_3px_0_#b9904e] transition hover:-translate-y-0.5"><Pencil size={20} strokeWidth={2.5} /></button>
            </div>
             <div className={`${nameTagAnchor >= 0.5 ? "absolute z-20 h-0 w-0" : "absolute -bottom-3 right-7 rotate-[3deg]"} ${nameTagAnchor >= 0.5 ? "" : "px-5 py-1.5 text-sm font-normal text-[#fffdf4]"}`} style={nameTagAnchor >= 0.5 ? { right: `${(plaqueCorner.x * 100).toFixed(2)}%`, bottom: `${(plaqueCorner.y * 100).toFixed(2)}%` } : undefined}>
             <div style={{ padding: "0.375em 1.25em", fontSize: "0.875em", ...(nameTagAnchor >= 0.5 ? { transformOrigin: "top left", transform: `translate(${-nameTagInsetXRem}em, ${-nameTagInsetYRem}em) rotate(3deg)` } : {}) }} className={`${nameTagAnchor >= 0.5 ? "absolute left-0 top-0 whitespace-nowrap" : ""} font-normal text-[#fffdf4]`}>
               <JellyBackdrop fill={youTagFill} shadowColor={youTagShadow} phaseOffset={1.9} stroke={nameTagOutlineColor} strokeWidthPx={nameTagOutlineOn >= 0.5 ? nameTagOutlineWidthPx : 0} shadowYPx={3} amplitude={nameTagWaveAmplitude} speed={nameTagWaveSpeed} spacing={nameTagWaveSpacing} roundness={nameTagRoundness} motionOn={motionOn} />
               <span className="relative">You</span>
             </div>
             </div>
         </DialoguePlaque>
      </motion.section>
    );
  } else if (chatMode === "phone" && !talking) {
    /*
     * "Call us": the same plaque as the bears' and the visitor's bubbles, a
     * tag on its top-left corner, and the bears' number - tappable on a phone.
     */
    const tagTransform = `translate(${nameTagXRem + nameTagInsetXRem}em, ${nameTagYRem + nameTagInsetYRem}em) rotate(${smokeyNameTiltDeg}deg) scale(${nameTagScale})`;
    const digits = (phoneNumber ?? "").replace(/[^+\d]/g, "");
    content = (
      <motion.section
        key="phone"
        aria-label="Call the bears"
        initial={animateDialogue ? { ...popIn, rotate: leftTiltDeg } : false}
        animate={{ opacity: 1, rotate: leftTiltDeg, scale: 1, y: 0 }}
        exit={popExit}
        transition={popTransition}
        style={{ "--bear-dialogue-font": dialogueFont.style.fontFamily, bottom: `${bottomRem}rem`, width: `min(92vw, ${Math.min(widthRem, 30)}rem)`, minWidth: "min(78vw, 18rem)", containerType: "inline-size" } as CSSProperties}
        className={`${dialogueFont.className} bear-dialogue-font pointer-events-auto absolute left-1/2 z-30 -translate-x-1/2 text-stone-700`}
      >
        <DialoguePlaque opacity={opacity} blurPx={blurPx} scale={scale} borderOn={borderOn} borderWidthPx={borderWidthPx} borderColor={borderColor} motionOn={motionOn} waveAmplitude={waveAmplitude} waveSpeed={waveSpeed} waveSpacing={waveSpacing} roundness={roundness} designWidthRem={Math.min(widthRem, 30)} minHeight={`${Math.max(minHeightRem * 0.6, 10)}em`}>
          <div aria-hidden="false" className="absolute z-20 h-0 w-0" style={{ left: `${(plaqueCorner.x * 100).toFixed(2)}%`, top: `${(plaqueCorner.y * 100).toFixed(2)}%` }}>
            <div style={{ padding: "0.375em 1.25em", fontSize: "0.875em", transformOrigin: "bottom right", transform: tagTransform }} className="absolute bottom-0 right-0 whitespace-nowrap font-normal tracking-wide text-[#fffdf4]">
              <JellyBackdrop fill={smokeyTagFill} shadowColor={smokeyTagShadow} phaseOffset={0.7} {...nameTagJelly} />
              <span className="relative">Call us</span>
            </div>
          </div>
          <div className="relative text-center" style={{ padding: `${textPadTopRem}em ${textPadRightRem}em ${textPadBottomRem}em ${textPadLeftRem}em`, color: textColor }}>
            <p style={{ fontSize: `${textSizeRem}em`, lineHeight: 1.15 }} className="font-normal">Give us a ring at</p>
            {phoneNumber ? (
              <a href={`tel:${digits}`} style={{ fontSize: `${textSizeRem * 1.7}em`, color: textColor }} className="mt-1 block font-normal tracking-wide underline-offset-4 hover:underline">{phoneNumber}</a>
            ) : (
              <p style={{ fontSize: `${textSizeRem * 1.4}em` }} className="mt-1 font-normal">(number coming soon)</p>
            )}
            <p style={{ fontSize: `${textSizeRem * 0.7}em` }} className="mt-2 font-normal opacity-70">Smokey and Maple pick up on the first ring.</p>
            {onChangeChannel ? (
              <button type="button" onClick={onChangeChannel} style={{ fontSize: `${textSizeRem * 0.65}em`, color: textColor }} className="mt-3 rounded-full px-3 py-1 font-normal opacity-60 transition hover:bg-black/5 hover:opacity-100">← talk another way</button>
            ) : null}
          </div>
        </DialoguePlaque>
      </motion.section>
    );
  } else if (mode === "type" && !talking) {
    /*
     * The visitor's own bubble: the same plaque the bears talk in, a "You"
     * tag on its top-left corner, and nothing inside but an empty text box
     * with the cursor blinking in the top-left. Enter sends (Shift+Enter for a
     * new line).
     */
    const youTransform = `translate(${nameTagXRem + nameTagInsetXRem}em, ${nameTagYRem + nameTagInsetYRem}em) rotate(${smokeyNameTiltDeg}deg) scale(${nameTagScale})`;
    content = (
      <motion.section
        key="typing"
        aria-label="Type to the bears"
        initial={animateDialogue ? { ...popIn, rotate: leftTiltDeg } : false}
        animate={{ opacity: 1, rotate: leftTiltDeg, scale: 1, y: 0 }}
        exit={popExit}
        transition={popTransition}
        style={{ "--bear-dialogue-font": dialogueFont.style.fontFamily, bottom: `${bottomRem}rem`, width: `min(92vw, ${widthRem}rem)`, minWidth: "min(78vw, 18rem)", containerType: "inline-size" } as CSSProperties}
        className={`${dialogueFont.className} bear-dialogue-font pointer-events-auto absolute left-1/2 z-30 -translate-x-1/2 text-stone-700`}
      >
        <DialoguePlaque opacity={opacity} blurPx={blurPx} scale={scale} borderOn={borderOn} borderWidthPx={borderWidthPx} borderColor={borderColor} motionOn={motionOn} waveAmplitude={waveAmplitude} waveSpeed={waveSpeed} waveSpacing={waveSpacing} roundness={roundness} designWidthRem={widthRem} minHeight={`${Math.max(minHeightRem, 12)}em`}>
          <div aria-hidden="false" className="absolute z-20 h-0 w-0" style={{ left: `${(plaqueCorner.x * 100).toFixed(2)}%`, top: `${(plaqueCorner.y * 100).toFixed(2)}%` }}>
            <div style={{ padding: "0.375em 1.25em", fontSize: "0.875em", transformOrigin: "bottom right", transform: youTransform }} className="absolute bottom-0 right-0 whitespace-nowrap font-normal tracking-wide text-[#fffdf4]">
              <JellyBackdrop fill={youTagFill} shadowColor={youTagShadow} phaseOffset={1.9} {...nameTagJelly} />
              <span className="relative">You</span>
            </div>
          </div>
          <div className="relative" style={{ padding: `${textPadTopRem}em ${textPadRightRem}em ${textPadBottomRem}em ${textPadLeftRem}em` }}>
            <textarea
              autoFocus
              value={message}
              onChange={handleMessageChange}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleSubmitMessage(); }
              }}
              aria-label="Your message to the bears"
              rows={4}
              disabled={isSending}
              style={{ fontSize: `${textSizeRem}em`, lineHeight: 1.1, color: textColor, caretColor: textColor, fontFamily: "inherit" }}
              className="block w-full resize-none border-0 bg-transparent p-0 outline-none disabled:opacity-60"
            />
            {typedError ? <p className="mt-2 text-sm font-normal text-[#a63e32]">{typedError}</p> : null}
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                onClick={() => void handleSubmitMessage()}
                disabled={!message.trim() || isSending}
                aria-label="Send"
                title="Send (Enter)"
                className="rounded-full p-1 transition hover:bg-black/5 disabled:opacity-35"
                style={{ color: textColor }}
              >
                <CornerDownLeft size={22} strokeWidth={2.5} className={isSending ? "animate-pulse" : ""} />
              </button>
            </div>
          </div>
        </DialoguePlaque>
      </motion.section>
    );
  } else if (showLine) {
  content = (
    <motion.section
      key={mode === "type" ? "typing" : `line-${utterance}`}
      aria-label="Talk to the bears"
      initial={animateDialogue ? { ...popIn, rotate: bubbleTilt } : false}
      animate={{ opacity: 1, rotate: bubbleTilt, scale: 1, y: 0 }}
      exit={popExit}
      transition={popTransition}
      style={{ "--bear-dialogue-font": dialogueFont.style.fontFamily, bottom: `${bottomRem}rem`, width: `min(92vw, ${widthRem}rem)`, minWidth: "min(78vw, 18rem)", containerType: "inline-size" } as CSSProperties}
      className={`${dialogueFont.className} bear-dialogue-font pointer-events-auto absolute z-30 text-stone-700 ${bubblePosition}`}
    >
        <DialoguePlaque opacity={opacity} blurPx={blurPx} scale={scale} borderOn={borderOn} borderWidthPx={borderWidthPx} borderColor={borderColor} motionOn={motionOn} waveAmplitude={waveAmplitude} waveSpeed={waveSpeed} waveSpacing={waveSpacing} roundness={roundness} designWidthRem={widthRem} minHeight={`${Math.max(minHeightRem, 18)}em`}>
          {headSrc ? <img src={headSrc} alt="" style={smokeyIconStyle(smokeyIcon, headCorner)} className={SMOKEY_ICON_CLASS} /> : null}
        {nameTagAnchored ? (
          <div aria-hidden="false" className="absolute z-20 h-0 w-0" style={nameTagMarker}>
            <motion.div style={{ padding: "0.375em 1.25em", fontSize: "0.875em", transformOrigin: "bottom right", transform: nameTagTransform }} className="absolute bottom-0 right-0 whitespace-nowrap font-normal tracking-wide text-[#fffdf4]">
              <JellyBackdrop fill={nameTagFill} shadowColor={nameTagShadow} phaseOffset={isMaple ? Math.PI : 0} {...nameTagJelly} />
              <span className="relative">{speaker}</span>
            </motion.div>
          </div>
        ) : (
          <motion.div style={{ padding: "0.375em 1.25em", fontSize: "0.875em", transform: nameTagTransform }} className={`absolute -top-1 ${nameTagPosition} font-normal tracking-wide text-[#fffdf4]`}>
            <JellyBackdrop fill={nameTagFill} shadowColor={nameTagShadow} phaseOffset={isMaple ? Math.PI : 0} {...nameTagJelly} />
            <span className="relative">{speaker}</span>
          </motion.div>
        )}
        <SmokeyTextFlow className="relative" padTopRem={textPadTopRem} padRightRem={textPadRightRem} padBottomRem={textPadBottomRem} padLeftRem={textPadLeftRem} reserveWidthRem={textReserve.reserveWidthRem} reserveHeightRem={textReserve.reserveHeightRem} reserveShape={textReserve.shape} side={headCorner} minHeightEm={Math.max(minHeightRem, 18)}>
        {mode === "speak" ? (
          <div>
            <p aria-live="polite" style={{ fontSize: `${textSizeRem}em`, lineHeight: 1.1, color: textColor }} className="font-normal">{error ?? (spokenText ?? lastSpokenTextRef.current ?? (needsMicrophone ? "We need to hear you first." : isActive ? `${speaker} is listening.` : isConnecting ? "Getting the campfire phone ready..." : "Ready when you are."))}</p>
          </div>
        ) : null}
        {mode === "type" ? (
          <div>
            <p style={{ fontSize: `${textSizeRem}em`, lineHeight: 1.1, color: textColor }} className="font-normal">{typedReply ?? "Leave us a question, and we will read it by the fire."}</p>
            <textarea value={message} onChange={handleMessageChange} placeholder="Ask Smokey and Maple about Mitch..." rows={2} className="mt-4 w-full resize-none rounded-[1.2rem] border-2 border-[#b68f60] bg-[#fffdf4] px-4 py-3 text-sm text-stone-800 outline-none placeholder:text-stone-400 focus:border-[#4d7658]" />
            {typedError ? <p className="mt-2 text-sm font-normal text-[#a63e32]">{typedError}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2 text-sm font-normal">
              <button type="button" onClick={handleSubmitMessage} disabled={!message.trim() || isSending} className="rounded-full bg-[#4d7658] px-4 py-2 text-white shadow-[0_3px_0_#294a32] disabled:opacity-45">{isSending ? "Thinking..." : "Send to the bears"}</button>
              {chatMode !== "type" ? <button type="button" onClick={handleBack} className="rounded-full border-2 border-[#96754a] bg-[#fff8df] px-4 py-2 text-[#6f5839]">Back</button> : null}
            </div>
          </div>
        ) : null}
        </SmokeyTextFlow>
        </DialoguePlaque>
    </motion.section>
  );
  }

  return <AnimatePresence>{content}</AnimatePresence>;
};

export default BearDialogue;
