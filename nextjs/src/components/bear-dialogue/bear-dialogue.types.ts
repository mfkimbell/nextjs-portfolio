import type { BearVoiceAgent } from "@/hooks/useBearVoiceAgent";

export type BearDialogueProps = {
  agent: BearVoiceAgent;
  /** How the visitor chose to talk (the arrows over the mic / typewriter).
   *  Set, it skips the old mic-or-pencil picker. */
  chatMode?: "mic" | "type" | "phone";
  /** Shown in the "call us" bubble when chatMode is "phone". */
  phoneNumber?: string;
  /** "Back" from the phone bubble: put the channel choices up again. */
  onChangeChannel?: () => void;
  /** this visitor's phone call is live: the call bubble says so instead of showing the number */
  onCall?: boolean;
  opacity: number;
  blurPx: number;
  scale: number;
  bottomRem: number;
  font: number;
  motionOn: number;
  popStiffness: number;
  popDamping: number;
  leftTiltDeg: number;
  rightTiltDeg: number;
  widthRem: number;
  minHeightRem: number;
  cloudFlow: number;
  cloudCycleSec: number;
  roundness: number;
  waveDirection: number;
  rippleScale: number;
  waveAmplitude: number;
  waveSpeed: number;
  waveSpacing: number;
  textSizeRem: number;
  textPadTopRem: number;
  textPadRightRem: number;
  textPadBottomRem: number;
  textPadLeftRem: number;
  textColor: string;
  borderOn: number;
  borderWidthPx: number;
  borderColor: string;
  nameTagXRem: number;
  nameTagYRem: number;
  nameTagScale: number;
  nameTagAnchor: number;
  nameTagInsetXRem: number;
  nameTagInsetYRem: number;
  /** Maple's own name-tag placement (her tag hangs off the top-RIGHT corner,
   *  so positive X moves it outward - it needs its own numbers). */
  mapleNameTagXRem?: number;
  mapleNameTagYRem?: number;
  mapleNameTagScale?: number;
  mapleNameTagInsetXRem?: number;
  mapleNameTagInsetYRem?: number;
  nameTagWaveAmplitude: number;
  nameTagWaveSpeed: number;
  nameTagWaveSpacing: number;
  nameTagRoundness: number;
  nameTagOutlineOn: number;
  nameTagOutlineWidthPx: number;
  nameTagOutlineColor: string;
  smokeyTagFill: string;
  smokeyTagShadow: string;
  mapleTagFill: string;
  mapleTagShadow: string;
  youTagFill: string;
  youTagShadow: string;
  smokeyNameTiltDeg: number;
  mapleNameTiltDeg: number;
  smokeyIconSizeRem: number;
  smokeyIconInsetXRem: number;
  smokeyIconInsetYRem: number;
  smokeyIconMarginXRem: number;
  smokeyIconMarginYRem: number;
  smokeyIconKeepInside: number;
  smokeyIconTiltDeg: number;
  smokeyIconOpacity: number;
  smokeyIconBorderOn: number;
  smokeyIconBorderWidthPx: number;
  smokeyIconBorderColor: string;
  smokeyIconShadowXRem: number;
  smokeyIconShadowYRem: number;
  smokeyIconShadowBlurPx: number;
  smokeyIconShadowLayers: number;
  smokeyIconShadowOpacity: number;
  smokeyIconShadowColor: string;
  smokeyIconGlowPx: number;
  smokeyIconGlowPasses: number;
  smokeyIconGlowOpacity: number;
  smokeyIconGlowColor: string;
};
