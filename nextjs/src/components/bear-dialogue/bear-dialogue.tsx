"use client";

import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import localFont from "next/font/local";
import { motion, useReducedMotion } from "framer-motion";
import { Mic, Pencil } from "lucide-react";
import { type BearDialogueProps } from "./bear-dialogue.types";
import DialoguePlaque from "./dialogue-plaque";
import { smokeyIconClassName, smokeyIconStyle, smokeyTextPadding, type SmokeyIconSettings } from "./smokey-icon";
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

const BearDialogue = ({ agent, opacity, blurPx, scale, bottomRem, font, motionOn, popStiffness, leftTiltDeg, rightTiltDeg, widthRem, minHeightRem, roundness, waveAmplitude, waveSpeed, waveSpacing, textSizeRem, textPaddingXRem, textPaddingYRem, textColor, borderOn, borderWidthPx, borderColor, nameTagXRem, nameTagYRem, nameTagScale, nameTagAnchor, nameTagInsetXRem, nameTagInsetYRem, nameTagWaveAmplitude, nameTagWaveSpeed, nameTagWaveSpacing, nameTagRoundness, nameTagOutlineOn, nameTagOutlineWidthPx, nameTagOutlineColor, smokeyTagFill, smokeyTagShadow, mapleTagFill, mapleTagShadow, youTagFill, youTagShadow, smokeyNameTiltDeg, mapleNameTiltDeg, smokeyIconSizeRem, smokeyIconAnchor, smokeyIconInsetXRem, smokeyIconInsetYRem, smokeyIconKeepInside, smokeyIconXRem, smokeyIconYRem, smokeyIconTiltDeg, smokeyIconTextClearanceRem, smokeyIconOpacity, smokeyIconBorderOn, smokeyIconBorderWidthPx, smokeyIconBorderColor, smokeyIconShadowXRem, smokeyIconShadowYRem, smokeyIconShadowBlurPx, smokeyIconShadowLayers, smokeyIconShadowOpacity, smokeyIconShadowColor, smokeyIconGlowPx, smokeyIconGlowPasses, smokeyIconGlowOpacity, smokeyIconGlowColor, smokeyIconAutoClearanceOn }: BearDialogueProps) => {
  const [mode, setMode] = useState<DialogueMode>("speak");
  const [message, setMessage] = useState("");
  const [typedReply, setTypedReply] = useState<string | null>(null);
  const [typedError, setTypedError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const lastSpeakerRef = useRef<string | null>(null);
  const lastSpokenTextRef = useRef<string | null>(null);
  const reducedMotion = useReducedMotion();
  const { activeSpeakerName, dialoguePhase, error, isRemoteSpeaking, microphonePermission, requestMicrophone, sendTextMessage, spokenText, start, status } = agent;
  const needsMicrophone = microphonePermission !== "granted" && microphonePermission !== "unsupported";
  const isActive = status === "active";
  const isConnecting = status === "connecting";
  if (activeSpeakerName) lastSpeakerRef.current = activeSpeakerName;
  if (spokenText) lastSpokenTextRef.current = spokenText;
  const displaySpeakerName = activeSpeakerName ?? lastSpeakerRef.current;
  const speaker = displaySpeakerName ?? "Smokey & Maple";
  const isMaple = displaySpeakerName === "Maple";
  const nameTagPosition = displaySpeakerName
    ? isMaple ? "right-7 rotate-[3deg]" : "left-7 rotate-[-3deg]"
    : "left-1/2 -translate-x-1/2 rotate-[-1deg]";
  // Pinned to the plaque's own top corner by the tag's edge, so a narrower
  // bubble moves the tag with it instead of letting it drift off the side.
  // Insets measure corner to tag edge, so a negative value overhangs on purpose.
  const nameTagAnchored = nameTagAnchor >= 0.5 && Boolean(displaySpeakerName);
  const nameTagAnchorStyle = nameTagAnchored
    ? isMaple
      ? { right: `${nameTagInsetXRem}rem`, top: `${nameTagInsetYRem}rem` }
      : { left: `${nameTagInsetXRem}rem`, top: `${nameTagInsetYRem}rem` }
    : undefined;
  const nameTagPlacement = nameTagAnchored ? "absolute" : `absolute -top-1 ${nameTagPosition}`;
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
    anchor: smokeyIconAnchor,
    insetXRem: smokeyIconInsetXRem,
    insetYRem: smokeyIconInsetYRem,
    keepInside: smokeyIconKeepInside,
    xRem: smokeyIconXRem,
    yRem: smokeyIconYRem,
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
  const textPadding = displaySpeakerName === "Smokey"
    ? smokeyTextPadding(smokeyIcon, { widthRem, minHeightRem, paddingXRem: textPaddingXRem, paddingYRem: textPaddingYRem, clearanceRem: smokeyIconTextClearanceRem, autoClearanceOn: smokeyIconAutoClearanceOn })
    : { padding: `${textPaddingYRem}rem ${textPaddingXRem}rem` };
  void bubblePathVariants;

  useEffect(() => {
    if (status === "connecting" || status === "active") setMode("speak");
  }, [status]);

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

  if (!isRemoteSpeaking && mode !== "type" && dialoguePhase === "idle") return null;

  if (!isRemoteSpeaking && mode !== "type" && dialoguePhase === "your-turn") {
    return (
      <motion.section
        aria-label="Your turn to talk to the bears"
        initial={animateDialogue ? { opacity: 0, scaleX: 0.79, scaleY: 0.79 } : false}
        animate={{ opacity: 1, scaleX: 1, scaleY: 1 }}
        transition={animateDialogue ? { duration: Math.max(0.35, Math.min(0.9, 0.64 * 340 / Math.max(80, popStiffness))), times: [0, 0.48, 1], ease: [[0.16, 1, 0.3, 1], [0.4, 0, 0.2, 1]] } : { duration: 0 }}
        style={{ "--bear-dialogue-font": dialogueFont.style.fontFamily, bottom: `${bottomRem}rem`, width: `min(84vw, ${Math.min(widthRem, 24)}rem)`, minWidth: "min(78vw, 18rem)" } as CSSProperties}
        className={`${dialogueFont.className} bear-dialogue-font pointer-events-auto absolute left-1/2 z-30 -translate-x-1/2 text-stone-700`}
      >
        <DialoguePlaque opacity={opacity} blurPx={blurPx} scale={scale} borderOn={borderOn} borderWidthPx={borderWidthPx} borderColor={borderColor} motionOn={motionOn} waveAmplitude={waveAmplitude} waveSpeed={waveSpeed} waveSpacing={waveSpacing} roundness={roundness} minHeight={`clamp(9rem, 15vh, ${Math.min(minHeightRem, 18)}rem)`}>
            <p style={{ fontSize: "clamp(1rem, 2.25vw, 2.25rem)", lineHeight: 1.1 }} className="relative px-14 pt-14 text-center font-normal text-[#6e6b5c] sm:px-18">Your turn, partner.</p>
            <div className="relative mt-4 flex justify-center gap-3">
              <button type="button" onClick={handleSpeak} aria-label="Speak to the bears" className="rounded-full border-2 border-[#51493a] bg-[#ffe78f] p-3 text-[#51493a] shadow-[0_3px_0_#b9904e] transition hover:-translate-y-0.5"><Mic size={20} strokeWidth={2.5} /></button>
              <button type="button" onClick={handleType} aria-label="Type to the bears" className="rounded-full border-2 border-[#51493a] bg-[#fff8e5] p-3 text-[#51493a] shadow-[0_3px_0_#b9904e] transition hover:-translate-y-0.5"><Pencil size={20} strokeWidth={2.5} /></button>
            </div>
             <div style={nameTagAnchor >= 0.5 ? { right: `${nameTagInsetXRem}rem`, bottom: `${nameTagInsetYRem}rem`, transform: "rotate(3deg)" } : undefined} className={`${nameTagAnchor >= 0.5 ? "absolute" : "absolute -bottom-3 right-7 rotate-[3deg]"} px-5 py-1.5 text-sm font-normal text-[#fffdf4]`}>
               <JellyBackdrop fill={youTagFill} shadowColor={youTagShadow} phaseOffset={1.9} stroke={nameTagOutlineColor} strokeWidthPx={nameTagOutlineOn >= 0.5 ? nameTagOutlineWidthPx : 0} shadowYPx={3} amplitude={nameTagWaveAmplitude} speed={nameTagWaveSpeed} spacing={nameTagWaveSpacing} roundness={nameTagRoundness} motionOn={motionOn} />
               <span className="relative">You</span>
             </div>
         </DialoguePlaque>
      </motion.section>
    );
  }

  return (
    <motion.section
      aria-label="Talk to the bears"
      initial={animateDialogue ? { opacity: 0, rotate: bubbleTilt, scaleX: 0.79, scaleY: 0.79 } : false}
      animate={{ opacity: 1, rotate: bubbleTilt, scaleX: 1, scaleY: 1 }}
      transition={animateDialogue ? { duration: Math.max(0.35, Math.min(0.9, 0.64 * 340 / Math.max(80, popStiffness))), times: [0, 0.48, 1], ease: [[0.16, 1, 0.3, 1], [0.4, 0, 0.2, 1]] } : { duration: 0 }}
      style={{ "--bear-dialogue-font": dialogueFont.style.fontFamily, bottom: `${bottomRem}rem`, width: `min(92vw, ${widthRem}rem)`, minWidth: "min(78vw, 18rem)" } as CSSProperties}
      className={`${dialogueFont.className} bear-dialogue-font pointer-events-auto absolute z-30 text-stone-700 ${bubblePosition}`}
    >
        <DialoguePlaque opacity={opacity} blurPx={blurPx} scale={scale} borderOn={borderOn} borderWidthPx={borderWidthPx} borderColor={borderColor} motionOn={motionOn} waveAmplitude={waveAmplitude} waveSpeed={waveSpeed} waveSpacing={waveSpacing} roundness={roundness} minHeight={`clamp(9rem, 15vh, ${Math.max(minHeightRem, 18)}rem)`}>
          {!isMaple && displaySpeakerName === "Smokey" ? <img src="/smokey_head.png" alt="" style={smokeyIconStyle(smokeyIcon)} className={smokeyIconClassName(smokeyIcon)} /> : null}
        <motion.div layout transition={{ type: "spring", stiffness: 500, damping: 30 }} style={{ ...nameTagAnchorStyle, transform: `translate(${nameTagXRem}rem, ${nameTagYRem}rem) rotate(${isMaple ? mapleNameTiltDeg : smokeyNameTiltDeg}deg) scale(${nameTagScale})` }} className={`${nameTagPlacement} px-5 py-1.5 text-sm font-normal tracking-wide text-[#fffdf4]`}>
          <JellyBackdrop fill={nameTagFill} shadowColor={nameTagShadow} phaseOffset={isMaple ? Math.PI : 0} {...nameTagJelly} />
          <span className="relative">{speaker}</span>
        </motion.div>
        <div className="relative" style={textPadding}>
        {mode === "speak" ? (
          <div>
            <p aria-live="polite" style={{ fontSize: `clamp(1rem, 2.25vw, ${textSizeRem}rem)`, lineHeight: 1.1, color: textColor }} className="font-normal">{error ?? (spokenText ?? lastSpokenTextRef.current ?? (needsMicrophone ? "We need to hear you first." : isActive ? `${speaker} is listening.` : isConnecting ? "Getting the campfire phone ready..." : "Ready when you are."))}</p>
          </div>
        ) : null}
        {mode === "type" ? (
          <div>
            <p style={{ fontSize: `clamp(1rem, 2.25vw, ${textSizeRem}rem)`, lineHeight: 1.1, color: textColor }} className="font-normal">{typedReply ?? "Leave us a question, and we will read it by the fire."}</p>
            <textarea value={message} onChange={handleMessageChange} placeholder="Ask Smokey and Maple about Mitch..." rows={2} className="mt-4 w-full resize-none rounded-[1.2rem] border-2 border-[#b68f60] bg-[#fffdf4] px-4 py-3 text-sm text-stone-800 outline-none placeholder:text-stone-400 focus:border-[#4d7658]" />
            {typedError ? <p className="mt-2 text-sm font-normal text-[#a63e32]">{typedError}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2 text-sm font-normal">
              <button type="button" onClick={handleSubmitMessage} disabled={!message.trim() || isSending} className="rounded-full bg-[#4d7658] px-4 py-2 text-white shadow-[0_3px_0_#294a32] disabled:opacity-45">{isSending ? "Thinking..." : "Send to the bears"}</button>
              <button type="button" onClick={handleBack} className="rounded-full border-2 border-[#96754a] bg-[#fff8df] px-4 py-2 text-[#6f5839]">Back</button>
            </div>
          </div>
        ) : null}
        </div>
        </DialoguePlaque>
    </motion.section>
  );
};

export default BearDialogue;
