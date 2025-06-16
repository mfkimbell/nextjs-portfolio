/* ------------------------------------------------------------------
   src/components/ProjectsSection.tsx – Individual Floating Balloons with Wind Sway
   • Each balloon has its own independent string and anchor point
   • Strings sway naturally in the wind with unique physics
   • No central tie point - completely avoiding bouquet effect
   • Balloons float freely with individual wind patterns
-------------------------------------------------------------------*/
"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { projects, Project } from "@/lib/projects";
import { Github } from "lucide-react";

export default function ProjectsSection() {
  const [active, setActive] = useState<Project>(projects[0]);

  return (
    <section id="projects" className="py-24">
      <h2 className="text-4xl font-bold neon-text text-center mb-12">
        Projects
      </h2>

      <div className="max-w-7xl mx-auto px-4 lg:flex lg:space-x-10">
        {/* ICON GRID PANEL */}
        <div
          className="
            grid flex-1
            grid-cols-8 gap-1
            sm:grid-cols-10 sm:gap-1
            md:grid-cols-10 md:gap-6
            lg:grid-cols-6 lg:gap-6
            lg:h-25
          "
        >
          {projects.map((p) => (
            <button
              key={p.name}
              onClick={() => setActive(p)}
              className={`flex flex-col items-center focus:outline-none
                 transform transition-transform duration-150
                 ${active.name === p.name
                  ? "scale-110"
                  : "hover:scale-105"
                }`}
            >
              {/* icon container */}
              <div
                className={`rounded-md bg-gradient-to-br ${p.gradient}
                   w-10 h-10
                   sm:w-12 sm:h-12 
                   md:w-16 md:h-16 md:rounded-2xl
                   flex items-center justify-center`}
              >
                <Image
                  src={p.logo}
                  alt={p.name}
                  width={42}
                  height={42}
                  className={`
                     w-9 h-9
                     sm:w-10 sm:h-10
                     md:w-12 md:h-12
                     filter brightness-0 invert
                   `}
                />
              </div>

              {/* label hidden on mobile (<md) */}
              <span className="hidden md:block mt-2 text-xs text-center truncate w-16">
                {p.name}
              </span>
            </button>
          ))}
        </div>

        {/* CONTENT PANEL */}
        <div className="flex-1 space-y-4 mt-10 lg:mt-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={active.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{
                duration: 0.4,
                ease: [0.4, 0.0, 0.2, 1],
                type: "tween"
              }}
              className="space-y-4"
            >
              <motion.h3
                className="text-xl font-semibold"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
              >
                {active.name}
              </motion.h3>

              {/* Architecture diagram with darker background */}
              <motion.div
                className="w-full my-4 p-4 rounded-lg border border-white"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15, duration: 0.35 }}
              >
                <Image
                  src={`${active.logo.replace(/(\.[^.]+)$/, "_arch$1")}`}
                  alt={`${active.name} architecture diagram`}
                  width={1000}
                  height={600}
                  className="w-full h-auto rounded-lg"
                  priority
                />
              </motion.div>

              <motion.p
                className="text-sm text-muted-foreground"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                {active.description}
              </motion.p>

              <motion.div
                className="flex flex-wrap gap-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.3 }}
              >
                {active.tech.map((tech, idx) => (
                  <motion.span
                    key={tech}
                    className="text-xs px-2 py-1 rounded bg-[var(--border)]"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      delay: 0.3 + (idx * 0.05),
                      duration: 0.2,
                      type: "spring",
                      stiffness: 200
                    }}
                  >
                    {tech}
                  </motion.span>
                ))}
              </motion.div>

              <motion.a
                href={active.github}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-4 text-sm neon-text underline"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.3 }}
              >
                <Github size={16} className="inline-block" aria-hidden="true" />
                <span>View on GitHub</span>
              </motion.a>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
