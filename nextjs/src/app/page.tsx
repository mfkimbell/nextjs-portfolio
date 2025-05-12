// src/app/page.tsx
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Hero2 from "@/components/Hero2";
import SkillsCarousel from "@/components/SkillsCarousel";
import Metrics from "@/components/Metrics";
import ProjectsSection from "@/components/Projects";
import ExperienceSection from "@/components/Experience";
import Cloud1 from "@/components/Cloud1"

export default function Home() {
  return (
    <>
      <Header />
      <Cloud1></Cloud1>
      <main
        className="
          bg-gradient-to-b
            from-sky-300   /* light sky at very top */
            via-sky-600    /* mid‑sky */
            to-sky-900     /* deep sky at bottom */
          text-white
          z-1
        "
      >
        <Hero />
        <SkillsCarousel />
        <Hero2 />
        <Metrics />
        <ProjectsSection />
        <ExperienceSection />
      </main>
    </>
  );
}
