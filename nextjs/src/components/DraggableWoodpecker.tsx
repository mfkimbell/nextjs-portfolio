"use client";

import { useEffect, useState } from "react";
import WoodpeckerScene from "@/components/WoodpeckerScene";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

const TARGET_SECTION_ID = "experience";

type Anchor = { x: number; y: number; ready: boolean };

function getPageRelativeTop(element: HTMLElement) {
  return element.getBoundingClientRect().top + window.scrollY;
}

interface DraggableWoodpeckerProps {
  side?: "left" | "right";
}

export default function DraggableWoodpecker({ side = "left" }: DraggableWoodpeckerProps) {
  const { layout } = useResponsiveLayout();
  const woodpecker = layout.woodpecker;
  const [anchor, setAnchor] = useState<Anchor>({
    x: woodpecker.xPx,
    y: woodpecker.fallbackYPx,
    ready: false,
  });

  useEffect(() => {
    const updateAnchor = () => {
      const target = document.getElementById(TARGET_SECTION_ID);

      if (!target) {
        setAnchor({ x: woodpecker.xPx, y: woodpecker.fallbackYPx, ready: true });
        return;
      }

      setAnchor({
        x: woodpecker.xPx,
        y: Math.max(
          woodpecker.minYPx,
          getPageRelativeTop(target) + woodpecker.experienceSectionOffsetYPx
        ),
        ready: true,
      });
    };

    const frame = requestAnimationFrame(updateAnchor);
    const resizeObserver = new ResizeObserver(updateAnchor);
    const target = document.getElementById(TARGET_SECTION_ID);

    if (target) resizeObserver.observe(target);
    window.addEventListener("resize", updateAnchor);
    window.addEventListener("load", updateAnchor);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("load", updateAnchor);
    };
  }, [
    woodpecker.experienceSectionOffsetYPx,
    woodpecker.fallbackYPx,
    woodpecker.minYPx,
    woodpecker.xPx,
  ]);

  const isRight = side === "right";

  return (
    <div
      className="pointer-events-none absolute z-[1100] select-none"
      style={{
        [isRight ? "right" : "left"]: anchor.x,
        top: anchor.y,
        opacity: anchor.ready ? 1 : 0,
        transform: isRight ? "scaleX(-1)" : undefined,
      }}
      aria-hidden="true"
    >
      <WoodpeckerScene />
    </div>
  );
}
