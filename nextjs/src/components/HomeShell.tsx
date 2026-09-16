"use client";

import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { SWRConfig } from "swr";
import Header from "@/components/Header";
import LeftBird from "@/components/LeftBird";
import RightBird from "@/components/RightBird";
import SkillsCarousel from "@/components/SkillsCarousel";
import ProjectsSection from "@/components/Projects";
import ExperienceSection from "@/components/Experience";
import SkyBackground from "@/components/SkyBackground";
import TalkToTheBirds from "@/components/TalkToTheBirds";
import DraggableWoodpecker from "@/components/DraggableWoodpecker";
import ForestFooter from "@/components/ForestFooter";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import type { HomeSectionFrameLayout } from "@/config/responsiveLayout";
import type { InitialGalleryResponse } from "@/lib/getInitialDrawings";

const GALLERY_ENDPOINT = "/api/drawing-submissions";
const MIN_SIDE_TREE_VISIBLE_WIDTH_PX = 24;
const TREE_CONTENT_GAP_PX = 8;
const FOOTER_LAYER_BASE_Z = 20;
const FOOTER_FARTHEST_DEPTH = 12;
const footerDepthZ = (depth: number) =>
  FOOTER_LAYER_BASE_Z + Math.round((FOOTER_FARTHEST_DEPTH - depth) * 10);

const SECTION_FRAME_JUSTIFY: Record<Required<HomeSectionFrameLayout>["align"], CSSProperties["justifyContent"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
};

interface HomeShellProps {
  initialGallery: InitialGalleryResponse;
}

function SectionFrame({
  children,
  layout,
  contentZIndex = 90,
}: {
  children: ReactNode;
  layout: HomeSectionFrameLayout;
  /** Use "auto" when child z-indexes need to interleave with page decorations. */
  contentZIndex?: number | "auto";
}) {
  return (
    <div
      className="relative flex w-full flex-col"
      style={{
        minHeight: layout.minHeightPx,
        marginTop: layout.marginTopPx,
        marginBottom: layout.marginBottomPx,
        justifyContent: SECTION_FRAME_JUSTIFY[layout.align ?? "start"],
      }}
    >
      <div
        className="relative w-full"
        style={{ zIndex: contentZIndex === "auto" ? undefined : contentZIndex }}
      >
        {children}
      </div>
    </div>
  );
}

export default function HomeShell({ initialGallery }: HomeShellProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [pageHeightPx, setPageHeightPx] = useState(0);
  const [viewportHeightPx, setViewportHeightPx] = useState(0);
  const pageContentRef = useRef<HTMLElement>(null);
  const { layout } = useResponsiveLayout();
  const leftTree = layout.leftTree;
  const leftTreeHeightPx = pageHeightPx
    ? Math.max(0, pageHeightPx - leftTree.topOffsetPx - leftTree.bottomOffsetPx)
    : 0;
  const renderedSideTreeHeightPx = leftTreeHeightPx || viewportHeightPx;
  const leftTreeWidthPx = renderedSideTreeHeightPx
    ? Math.round((renderedSideTreeHeightPx * leftTree.nativeWidthPx) / leftTree.nativeHeightPx)
    : leftTree.fallbackWidthPx;
  const scaledTransparentEdgeInsetPx =
    (leftTreeWidthPx * leftTree.transparentEdgeInsetPx) / leftTree.nativeWidthPx;
  const sideTreeVisibleWidthPx = Math.round(
    Math.min(
      Math.max(
        scaledTransparentEdgeInsetPx + leftTree.treeVisiblePeekPx,
        MIN_SIDE_TREE_VISIBLE_WIDTH_PX
      ),
      leftTreeWidthPx
    )
  );
  const sideTreeEdgeOffsetPx = Math.round(
    Math.min(0, sideTreeVisibleWidthPx - leftTreeWidthPx)
  );
  const contentSidePaddingPx = Math.round(
    Math.max(
      MIN_SIDE_TREE_VISIBLE_WIDTH_PX,
      leftTree.treeVisiblePeekPx + TREE_CONTENT_GAP_PX - leftTree.contentOverlapIntoTreePx
    )
  );
  const sideTreeZIndex = footerDepthZ(layout.footer.depths.treesDepth);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true));
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const updateTreeHeight = () => {
      setViewportHeightPx(window.innerHeight);
      if (!pageContentRef.current) return;
      setPageHeightPx(Math.ceil(pageContentRef.current.getBoundingClientRect().height));
    };

    const animationFrame = requestAnimationFrame(updateTreeHeight);
    const resizeObserver = new ResizeObserver(updateTreeHeight);

    if (pageContentRef.current) {
      resizeObserver.observe(pageContentRef.current);
    }

    window.addEventListener("resize", updateTreeHeight);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateTreeHeight);
    };
  }, []);

  return (
    <SWRConfig value={{ fallback: { [GALLERY_ENDPOINT]: initialGallery } }}>
      <div className="relative overflow-x-clip overflow-y-clip">
        <div
          className="rotate-prompt bg-gradient-to-b from-[#8AD1FC] via-[#78C2F3] to-[#5CA7DF]"
          aria-hidden="true"
        >
          <div className="rotate-prompt__inner">
            <div className="rotate-prompt__icon" aria-hidden="true">📱↻</div>
            <div className="rotate-prompt__title">Please rotate your phone</div>
            <div className="rotate-prompt__body">
              This site is best viewed in landscape.
            </div>
          </div>
        </div>

        <div
          className={`
            fixed inset-0 z-[2000]
            bg-gradient-to-b from-[#8AD1FC] via-[#78C2F3] to-[#5CA7DF]
            flex items-center justify-center
            transition-opacity duration-700
            ${isLoaded ? "opacity-0 pointer-events-none" : "opacity-100"}
          `}
        />

        <a
          href="https://www.google.com/search?q=cute+rats+eating+sandwiches&tbm=isch"
          target="_blank"
          rel="noopener noreferrer"
          className="group absolute left-[3%] top-[15%] -translate-y-1/2 z-[55] pointer-events-auto cursor-pointer"
        />

        <SkyBackground />

        <Header />

        <DraggableWoodpecker side="left" />
        <DraggableWoodpecker side="right" />

        <main ref={pageContentRef} className="relative z-10 text-white">
          <div
            className="pointer-events-none absolute select-none"
            aria-hidden="true"
            style={{
              top: leftTree.topOffsetPx,
              left: sideTreeEdgeOffsetPx,
              width: leftTreeWidthPx,
              height: renderedSideTreeHeightPx || "100vh",
              zIndex: sideTreeZIndex,
              overflow: "hidden",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/fauna/left_tree.png"
              alt=""
              aria-hidden="true"
              width={leftTree.nativeWidthPx}
              height={leftTree.nativeHeightPx}
              draggable={false}
              className="h-full w-full select-none object-fill"
            />
          </div>

          <div
            className="pointer-events-none absolute select-none"
            aria-hidden="true"
            style={{
              top: leftTree.topOffsetPx,
              right: sideTreeEdgeOffsetPx,
              width: leftTreeWidthPx,
              height: renderedSideTreeHeightPx || "100vh",
              // Right tree sits BEHIND the skills carousel birds so they can
              // fly out in front of it. Left tree stays above (birds enter
              // from behind it). If you need it back in front, restore
              // `sideTreeZIndex` and lift SkillsCarousel's contentZIndex.
              zIndex: 30,
              overflow: "hidden",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/fauna/right_tree.png?v=6"
              alt=""
              aria-hidden="true"
              width={leftTree.nativeWidthPx}
              height={leftTree.nativeHeightPx}
              draggable={false}
              className="h-full w-full select-none object-fill"
            />
          </div>

          <div
            className="relative"
            style={{
              paddingLeft: contentSidePaddingPx,
              paddingRight: contentSidePaddingPx,
            }}
          >
            <SectionFrame layout={layout.sections.talkToTheBirds}>
              <TalkToTheBirds />
            </SectionFrame>
            <SectionFrame layout={layout.sections.experience}>
              <ExperienceSection />
            </SectionFrame>
            <LeftBird />
            <SectionFrame layout={layout.sections.skills} contentZIndex={40}>
              <SkillsCarousel />
            </SectionFrame>
            <RightBird />
            <SectionFrame layout={layout.sections.projects}>
              <ProjectsSection />
            </SectionFrame>
            <SectionFrame layout={layout.sections.contact} contentZIndex="auto">
              <ForestFooter />
            </SectionFrame>
          </div>
        </main>

        <style jsx global>{`
          @keyframes ratFloat {
            0%, 100% { transform: translateY(0); }
            50%      { transform: translateY(-6px); }
          }

          .rotate-prompt {
            display: none;
          }
          @media (orientation: portrait) and (max-width: 900px) {
            .rotate-prompt {
              position: fixed;
              inset: 0;
              z-index: 3000;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              text-align: center;
              padding: 24px;
            }
            .rotate-prompt__inner {
              max-width: 320px;
            }
            .rotate-prompt__icon {
              font-size: 64px;
              margin-bottom: 16px;
              animation: rotateHint 2s ease-in-out infinite;
            }
            .rotate-prompt__title {
              font-size: 22px;
              font-weight: 700;
              margin-bottom: 8px;
            }
            .rotate-prompt__body {
              font-size: 15px;
              opacity: 0.9;
              line-height: 1.4;
            }
            /* Lock scroll while overlay is visible */
            html, body {
              overflow: hidden !important;
            }
          }
          @keyframes rotateHint {
            0%, 100% { transform: rotate(0deg); }
            50%      { transform: rotate(90deg); }
          }
        `}</style>
      </div>
    </SWRConfig>
  );
}
