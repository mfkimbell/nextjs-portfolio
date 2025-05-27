// src/components/ProjectsSection.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { projects, Project } from "@/lib/projects";

export default function ProjectsSection() {
  const [active, setActive] = useState<Project>(projects[0]);

  return (
    <section id="projects" className="py-10">
      <h2 className="text-3xl font-bold neon-text text-center mb-12">
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
                 ${
                   active.name === p.name
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
          <h3 className="text-xl font-semibold">{active.name}</h3>

          {/* Architecture diagram with darker background */}
          <div className="w-full my-4 p-4 rounded-lg border border-white">
            <Image
              src={`${active.logo.replace(/(\.[^.]+)$/, "_arch$1")}`}
              alt={`${active.name} architecture diagram`}
              width={1000}
              height={600}
              className="w-full h-auto rounded-lg "
              priority
            />
          </div>

          <p className="text-sm text-muted-foreground">
            {active.description}
          </p>

          <div className="flex flex-wrap gap-2">
            {active.tech.map((tech) => (
              <span
                key={tech}
                className="text-xs px-2 py-1 rounded bg-[var(--border)]"
              >
                {tech}
              </span>
            ))}
          </div>

          <a
            href={active.github}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-4 text-sm neon-text underline"
          >
            View on GitHub →
          </a>
        </div>
      </div>
    </section>
  );
}
