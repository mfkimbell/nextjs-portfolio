"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import CanvasBoard from "@/components/CanvasBoard";
import BulletinBoard from "@/components/BulletinBoard";
import FooterAnimalScene from "@/components/FooterAnimalScene";
import FooterButterflies from "@/components/FooterButterflies";
import FooterFlowers from "@/components/FooterFlowers";
import { FOOTER_ANIMALS, rotationDegreesToRadians } from "@/config/footerAnimals";
import { CONTACT_BOARD_UI_INSET } from "@/config/signs";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

const CONTACT_IMAGE = "/signs/contactme.png";
const DEFAULT_CONTACT_TITLE = "Contact Me";
const SKETCH_CONTACT_TITLE = "Sketch an Image";
const MAILTO =
  "mailto:mfkimbell@gmail.com?subject=Portfolio%20contact&body=Hi%20Mitch%2C%0D%0A%0D%0AI%20saw%20your%20portfolio%20and%20wanted%20to%20reach%20out.%0D%0A%0D%0A";

const FOOTER_LAYER_BASE_Z = 20;
const FOOTER_FARTHEST_DEPTH = 12;
// Grass depth is authored as: 0 = closest/front, higher = farther/back.
const footerDepthZ = (depth: number) =>
  FOOTER_LAYER_BASE_Z + Math.round((FOOTER_FARTHEST_DEPTH - depth) * 10);

export default function ForestFooter() {
  const { breakpoint, layout } = useResponsiveLayout();
  const footer = layout.footer;
  const sketchInset = CONTACT_BOARD_UI_INSET;
  const [mode, setMode] = useState<"menu" | "sketch">("menu");
  const [hoverContactTitle, setHoverContactTitle] = useState<string | null>(null);
  // Per-animal click ticks. Incrementing a value tells the corresponding
  // FooterAnimalGLB to play its click clip once (the model's shipped
  // lying-down animation) and fade back to idle.
  const [clickTicks, setClickTicks] = useState<Record<string, number>>({});
  const triggerAnimalClick = useCallback((id: string) => {
    setClickTicks((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  }, []);
  const bulletinTopPct = 85;
  const bulletinTopZIndex = footerDepthZ(footer.depths.raccoonDepth + 0.25);
  const bulletinBottomZIndex = footerDepthZ(footer.depths.billboardDepth);

  const contactTitle =
    mode === "sketch" ? SKETCH_CONTACT_TITLE : hoverContactTitle ?? DEFAULT_CONTACT_TITLE;

  // Scene-lock cap: the pixel width at which the bulletin hits its 820px
  // maxWidth. Everything that should visually stay pinned to the same blade
  // scale (grass tiles, flowers) uses this cap so blades never squish and
  // props never grow past the reference scene when the viewport gets wide.
  const grassMaxWidthPx = (820 * 100) / footer.billboard.widthPct;

  const handleBoardHoverTitle = useCallback((title: string, active: boolean) => {
    setHoverContactTitle((current) => {
      if (active) return title;
      return current === title ? null : current;
    });
  }, []);

  const openSketch = useCallback(() => {
    setHoverContactTitle(null);
    setMode("sketch");
  }, []);

  const closeSketch = useCallback(() => {
    setHoverContactTitle(null);
    setMode("menu");
  }, []);

  return (
    <footer
      id="metrics"
      aria-label="Contact Me"
      className="relative mt-16 flex w-screen max-w-[100vw] flex-col items-center overflow-visible sm:mt-24"
      data-breakpoint={breakpoint}
      style={{
        marginLeft: "calc(50% - 50vw)",
        paddingBottom: `${footer.bottomPaddingPct}%`,
      }}
    >
      {[...footer.butterflies]
        .sort((a, b) => b.layerDepth - a.layerDepth)
        .map((layer) => (
          <FooterButterflies
            key={`${layer.seed}-${layer.layerDepth}`}
            count={layer.count}
            depth={layer.sceneDepth}
            seed={layer.seed}
            scaleMin={layer.scaleMin}
            scaleMax={layer.scaleMax}
            className="inset-0"
            style={{ zIndex: footerDepthZ(layer.layerDepth) }}
          />
        ))}

      {FOOTER_ANIMALS.filter(
        (animal) => animal.enabled && "fullFooter" in animal && animal.fullFooter
      ).flatMap((animal) => {
        const sharedSceneProps = {
          animationName: animal.animationName,
          animationTimeOffset:
            "animationTimeOffset" in animal
              ? (animal.animationTimeOffset as number | undefined)
              : undefined,
          animationTimeScale:
            "animationTimeScale" in animal
              ? (animal.animationTimeScale as number | undefined)
              : undefined,
          cameraFov: animal.cameraFov,
          position: animal.scene.position,
          rotation: rotationDegreesToRadians(animal.scene.rotationDeg),
          scale: animal.scene.scale,
        };
        const backModelUrl =
          "backModelUrl" in animal
            ? (animal.backModelUrl as string | undefined)
            : undefined;
        const backDepth =
          "backDepth" in animal
            ? (animal.backDepth as number | undefined)
            : undefined;
        const interactive =
          "interactive" in animal ? !!animal.interactive : false;
        const clickAnimationName =
          "clickAnimationName" in animal
            ? (animal.clickAnimationName as string | undefined)
            : undefined;
        const clickHoldsFinalFrame =
          "clickHoldsFinalFrame" in animal
            ? !!animal.clickHoldsFinalFrame
            : false;
        const clickHitbox =
          "clickHitbox" in animal
            ? (animal.clickHitbox as
                | { leftPct: number; topPct: number; widthPct: number; heightPct: number }
                | undefined)
            : undefined;
        const nodes = [
          <FooterAnimalScene
            key={`${animal.id}-front`}
            {...sharedSceneProps}
            modelUrl={animal.modelUrl}
            clickAnimationName={clickAnimationName}
            clickHoldsFinalFrame={clickHoldsFinalFrame}
            clickTrigger={clickTicks[animal.id] ?? 0}
            interactive={interactive}
            onClick={interactive ? () => triggerAnimalClick(animal.id) : undefined}
            clickHitbox={clickHitbox}
            className="inset-0"
            style={{ zIndex: footerDepthZ(animal.depth) }}
          />,
        ];
        if (backModelUrl && backDepth !== undefined) {
          nodes.push(
            <FooterAnimalScene
              key={`${animal.id}-back`}
              {...sharedSceneProps}
              modelUrl={backModelUrl}
              clickAnimationName={clickAnimationName}
              clickHoldsFinalFrame={clickHoldsFinalFrame}
              clickTrigger={clickTicks[animal.id] ?? 0}
              className="inset-0"
              style={{ zIndex: footerDepthZ(backDepth) }}
            />
          );
        }
        return nodes;
      })}

      <h2 className="relative z-30 mb-8 text-center text-4xl font-bold text-white neon-text" aria-live="polite">
        {contactTitle}
      </h2>
      <div
        className="relative"
        style={{
          width: `${footer.billboard.widthPct}%`,
          maxWidth: 820,
          left: `${footer.billboard.leftPct - 50}vw`,
          marginBottom: `${footer.billboard.bottomPct}%`,
        }}
      >
        <div
          className="relative"
          style={{
            aspectRatio: "1162 / 1354",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              zIndex: bulletinTopZIndex,
              clipPath: `inset(0 0 ${100 - bulletinTopPct}% 0)`,
            }}
          >
            <Image
              src={CONTACT_IMAGE}
              alt="Contact Mitch sign"
              fill
              priority
              sizes="(max-width: 640px) 92vw, 820px"
              className="select-none object-contain"
            />

            {FOOTER_ANIMALS.filter(
              (a) => a.enabled && "shadowCatcher" in a && a.shadowCatcher
            ).map((animal) => (
              <FooterAnimalScene
                key={`shadow-${animal.id}`}
                modelUrl={animal.modelUrl}
                animationName={animal.animationName}
                cameraFov={animal.cameraFov}
                position={animal.scene.position}
                rotation={rotationDegreesToRadians(animal.scene.rotationDeg)}
                scale={animal.scene.scale}
                shadowCatcher={"shadowCatcher" in animal ? animal.shadowCatcher : undefined}
                shadowOnly
                className="inset-0"
                style={{
                  zIndex: 20,
                  maskImage: `url(${CONTACT_IMAGE})`,
                  WebkitMaskImage: `url(${CONTACT_IMAGE})`,
                  maskRepeat: "no-repeat",
                  WebkitMaskRepeat: "no-repeat",
                  maskSize: "100% 100%",
                  WebkitMaskSize: "100% 100%",
                  maskPosition: "center",
                  WebkitMaskPosition: "center",
                }}
              />
            ))}
          </div>

          <div
            className="pointer-events-none absolute inset-0"
            style={{
              zIndex: bulletinBottomZIndex,
              clipPath: `inset(${bulletinTopPct - 1}% 0 0 0)`,
            }}
          >
            <Image
              src={CONTACT_IMAGE}
              alt=""
              fill
              sizes="(max-width: 640px) 92vw, 820px"
              className="select-none object-contain"
            />
          </div>

          <div
            className="absolute inset-0"
            style={{ zIndex: bulletinBottomZIndex + 1 }}
          >
            {mode === "menu" ? (
              <BulletinBoard
                mailto={MAILTO}
                onSketch={openSketch}
                onHoverTitleChange={handleBoardHoverTitle}
              />
            ) : (
              <div
                className="absolute z-30 flex flex-col items-center justify-center overflow-hidden rounded-sm px-4 py-4 text-center"
                style={{
                  top: `${sketchInset.topPct}%`,
                  right: `${sketchInset.rightPct}%`,
                  bottom: `${sketchInset.bottomPct}%`,
                  left: `${sketchInset.leftPct}%`,
                }}
              >
                <div className="h-full w-full min-h-0 overflow-hidden rounded-[3px]">
                  <CanvasBoard
                    visits={0}
                    clicks={0}
                    mouseMiles={0}
                    embedded
                    onBack={closeSketch}
                  />
                </div>
              </div>
            )}

            {/* The old inline drawing papers are gone - submitted sketches now
                hang on the 3D board above. */}
          </div>
        </div>

        {FOOTER_ANIMALS.filter(
          (animal) => animal.enabled && !("fullFooter" in animal && animal.fullFooter)
        ).map((animal) => {
          const placement = animal.placement[breakpoint];
          const sideStyle =
            animal.anchor === "left"
              ? { left: `${placement.sideOffsetPct}%` }
              : { right: `${placement.sideOffsetPct}%` };

          const animationTimeOffset =
            "animationTimeOffset" in animal
              ? (animal.animationTimeOffset as number | undefined)
              : undefined;
          const animationTimeScale =
            "animationTimeScale" in animal
              ? (animal.animationTimeScale as number | undefined)
              : undefined;
          const interactive =
            "interactive" in animal ? !!animal.interactive : false;
          const clickAnimationName =
            "clickAnimationName" in animal
              ? (animal.clickAnimationName as string | undefined)
              : undefined;
          const clickHoldsFinalFrame =
            "clickHoldsFinalFrame" in animal
              ? !!animal.clickHoldsFinalFrame
              : false;
          const clickHitbox =
            "clickHitbox" in animal
              ? (animal.clickHitbox as
                  | { leftPct: number; topPct: number; widthPct: number; heightPct: number }
                  | undefined)
              : undefined;

          return (
            <FooterAnimalScene
              key={animal.id}
              modelUrl={animal.modelUrl}
              animationName={animal.animationName}
              animationTimeOffset={animationTimeOffset}
              animationTimeScale={animationTimeScale}
              cameraFov={animal.cameraFov}
              position={animal.scene.position}
              rotation={rotationDegreesToRadians(animal.scene.rotationDeg)}
              scale={animal.scene.scale}
              interactive={interactive}
              clickAnimationName={clickAnimationName}
              clickHoldsFinalFrame={clickHoldsFinalFrame}
              clickTrigger={clickTicks[animal.id] ?? 0}
              clickHitbox={clickHitbox}
              onClick={
                interactive ? () => triggerAnimalClick(animal.id) : undefined
              }
              style={{
                ...sideStyle,
                bottom: `${placement.bottomPct}%`,
                width: `${placement.widthPct}%`,
                height: `${placement.heightPct}%`,
                minWidth: animal.minWidthPx,
                zIndex: footerDepthZ(animal.depth),
              }}
            />
          );
        })}
      </div>

      {(() => {
        return [...footer.grassLayers]
          .sort((a, b) => b.depth - a.depth)
          .map((layer) => (
            <div
              key={layer.src}
              className="pointer-events-none absolute bottom-0 left-1/2 overflow-hidden bg-bottom"
              style={{
                zIndex: footerDepthZ(layer.depth),
                width: `${layer.widthPct}vw`,
                height: `${layer.heightPct}%`,
                bottom: `${layer.bottomOffsetPct ?? 0}%`,
                transform: `translateX(calc(-50% + ${layer.xOffsetVw ?? 0}vw))`,
                backgroundImage: `url(${layer.src})`,
                // Height is the visible dimension we care about (grass is
                // bottom-anchored + overflow-hidden); width is `auto` so
                // it's derived from the height using the PNG's natural
                // aspect ratio. Result: blades NEVER change aspect ratio,
                // and the visible height stays roughly what it was before.
                // Excess width is tiled/clipped by overflow-hidden +
                // repeat-x, not stretched.
                backgroundSize: `auto ${layer.tileHeightPct ?? 100}%`,
                backgroundPosition: "center bottom",
                backgroundRepeat: "repeat-x",
              }}
            />
          ));
      })()}

      <FooterFlowers depthToZ={footerDepthZ} maxWidthPx={grassMaxWidthPx} />
    </footer>
  );
}
