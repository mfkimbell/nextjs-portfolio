"use client";

import type { CSSProperties } from "react";
import localFont from "next/font/local";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import DialoguePlaque from "./dialogue-plaque";
import JellyBackdrop from "./jelly-backdrop";
import { jellyCornerFraction } from "./jelly-path";
import { darkenedRgb } from "./color";
import type { CampfireSceneConfig } from "@/components/scene-lab/sceneConfig";

const fredokaOne = localFont({ src: "../../../font/fredoka-one.one-regular.otf", display: "swap" });
const finkHeavy = localFont({ src: "../../../public/font/FinkHeavy.ttf", display: "swap" });
const superSmash = localFont({ src: "../../../public/fonts/super-smash-4-1.ttf", display: "swap" });
const dialogueFonts = [fredokaOne, finkHeavy, superSmash];

/** The tent's own name tag: a canvas colour, so it reads as neither bear. */
const TENT_TAG = { r: 0.55, g: 0.47, b: 0.33 };

/**
 * The speech bubble over the A-frame tent while one of its voices plays - the
 * bears' plaque and name tag, read from the same config so it matches them.
 * The words come from src/config/tentVoices.json. Rendered inside a drei
 * <Html> pinned above the tent, so it is sized smaller than the bears' bubbles.
 */
export default function TentDialogue({ line, config }: { line: { speaker: string; text: string; key: number } | null; config: CampfireSceneConfig }) {
  const reducedMotion = useReducedMotion();
  const animate = config.bearDialogueMotionOn >= 0.5 && !reducedMotion;
  const font = dialogueFonts[Math.round(config.bearDialogueFont)] ?? fredokaOne;
  const widthRem = 18;
  const textColor = `rgb(${config.bearDialogueTextColorR * 255} ${config.bearDialogueTextColorG * 255} ${config.bearDialogueTextColorB * 255})`;
  const corner = jellyCornerFraction(config.bearDialogueRoundness);
  const tagFill = `rgb(${TENT_TAG.r * 255} ${TENT_TAG.g * 255} ${TENT_TAG.b * 255})`;
  const tagShadow = darkenedRgb(TENT_TAG.r, TENT_TAG.g, TENT_TAG.b, config.bearDialogueNameTagShadowDarken);
  return (
    <AnimatePresence>
      {line ? (
        <motion.section
          key={line.key}
          aria-live="polite"
          aria-label="From the tent"
          initial={animate ? { opacity: 0, scale: 0.35, y: 18, rotate: -2 } : false}
          animate={{ opacity: 1, scale: 1, y: 0, rotate: -2 }}
          exit={animate ? { opacity: 0, scale: 0.4, y: 12, transition: { duration: 0.18 } } : { opacity: 0, transition: { duration: 0 } }}
          transition={animate ? { type: "spring", stiffness: Math.max(120, config.bearDialoguePopStiffness), damping: 16, mass: 0.7 } : { duration: 0 }}
          style={{ "--bear-dialogue-font": font.style.fontFamily, width: `${widthRem}rem`, containerType: "inline-size", transformOrigin: "bottom center" } as CSSProperties}
          className={`${font.className} bear-dialogue-font pointer-events-none select-none text-stone-700`}
        >
          <DialoguePlaque
            opacity={config.bearDialogueOpacity} blurPx={config.bearDialogueBlurPx} scale={1}
            borderOn={config.bearDialogueBorderOn} borderWidthPx={config.bearDialogueBorderWidthPx}
            borderColor={`rgb(${config.bearDialogueBorderColorR * 255} ${config.bearDialogueBorderColorG * 255} ${config.bearDialogueBorderColorB * 255})`}
            motionOn={config.bearDialogueMotionOn} waveAmplitude={config.bearDialogueWaveAmplitude} waveSpeed={config.bearDialogueWaveSpeed}
            waveSpacing={config.bearDialogueWaveSpacing} roundness={config.bearDialogueRoundness}
            designWidthRem={widthRem} minHeight="7em"
          >
            {line.speaker ? (
              <div className="absolute z-20 h-0 w-0" style={{ left: `${(corner.x * 100).toFixed(2)}%`, top: `${(corner.y * 100).toFixed(2)}%` }}>
                <div style={{ padding: "0.375em 1.25em", fontSize: "0.875em", transformOrigin: "bottom right", transform: `translate(${config.bearDialogueNameTagXRem + config.bearDialogueNameTagInsetXRem}em, ${config.bearDialogueNameTagYRem + config.bearDialogueNameTagInsetYRem}em) rotate(-3deg) scale(${config.bearDialogueNameTagScale})` }} className="absolute bottom-0 right-0 whitespace-nowrap font-normal tracking-wide text-[#fffdf4]">
                  <JellyBackdrop
                    fill={tagFill} shadowColor={tagShadow} phaseOffset={2.4}
                    stroke={`rgb(${config.bearDialogueNameTagOutlineColorR * 255} ${config.bearDialogueNameTagOutlineColorG * 255} ${config.bearDialogueNameTagOutlineColorB * 255} / ${config.bearDialogueNameTagOutlineOpacity})`}
                    strokeWidthPx={config.bearDialogueNameTagOutlineOn >= 0.5 ? config.bearDialogueNameTagOutlineWidthPx : 0} shadowYPx={3}
                    amplitude={config.bearDialogueNameTagWaveAmplitude} speed={config.bearDialogueNameTagWaveSpeed}
                    spacing={config.bearDialogueNameTagWaveSpacing} roundness={config.bearDialogueNameTagRoundness} motionOn={config.bearDialogueMotionOn}
                  />
                  <span className="relative">{line.speaker}</span>
                </div>
              </div>
            ) : null}
            <div className="relative" style={{ padding: "2.2em 2.4em 2em 2.4em" }}>
              <p style={{ fontSize: "1.25em", lineHeight: 1.1, color: textColor }} className="font-normal">{line.text}</p>
            </div>
          </DialoguePlaque>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
