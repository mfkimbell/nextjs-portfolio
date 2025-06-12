// src/app/page.tsx
"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import AirplaneTracking from "@/components/AirplaneTracking";
import LeftBird from "@/components/LeftBird";
import RightBird from "@/components/RightBird";
import SkillsCarousel from "@/components/SkillsCarousel";
import Metrics from "@/components/Metrics";
import ProjectsSection from "@/components/Projects";
import ExperienceSection from "@/components/Experience";
import SkyBackground from "@/components/SkyBackground";

import WebsiteMetricsTracker from "@/components/WebsiteMetricsTracker";


export default function Home() {
  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true),);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <WebsiteMetricsTracker />

      <div
        className={`
    fixed inset-0 z-[100]
    bg-gradient-to-b from-[#8AD1FC] via-[#78C2F3] to-[#5CA7DF]   /* solid HEX at the end */
    flex items-center justify-center
    transition-opacity duration-700
    ${isLoaded ? "opacity-0 pointer-events-none" : "opacity-100"}
  `}

      />




      {/* clickable floating rat */}
      <a
        href="https://www.google.com/search?q=cute+rats+eating+sandwiches&tbm=isch"
        target="_blank"
        rel="noopener noreferrer"
        className="group absolute left-[3%] top-[15%] -translate-y-1/2 z-[55] pointer-events-auto cursor-pointer"
      >

      </a>

      {/* clouds */}
      <SkyBackground />
      <Header />

      {/* main content — no need to reapply gradient here */}
      <main className="relative z-10 text-white">
        <AirplaneTracking />
        <SkillsCarousel />
        <LeftBird />
        <ProjectsSection />
        <RightBird />
        <ExperienceSection />
        <Metrics />
      </main>

      <style jsx global>{`
        @keyframes ratFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
      `}</style>
    </>
  );
}
