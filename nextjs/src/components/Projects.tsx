// src/components/Projects.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Project = {
  name: string;
  description: string;
  logo: string;
  arch: string;
  tech: string[];
  github: string;
};

const projects: Project[] = [
  {
    name: "AWS SaaS DevOps Template",
    description:
      "Fully automated template deploying a Next.js + FastAPI SaaS stack on AWS ECS, Terraform, GitHub Actions.",
    logo: "/projects/saas.png",
    arch: "/projects/saas-arch.png",
    tech: ["Next.js", "FastAPI", "Terraform", "ECS"],
    github: "https://github.com/mfkimbell/aws-saas-webapp-template",
  },
  // add more …
];

const tags = ["All", ...new Set(projects.flatMap((p) => p.tech))];

export default function Projects() {
  const [active, setActive] = useState<string>("All");
  const visible = projects.filter(
    (p) => active === "All" || p.tech.includes(active)
  );

  return (
    <section id="projects" className="py-24">
      <h2 className="text-3xl font-bold neon-text mb-12 text-center">Projects</h2>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-3 justify-center mb-10">
        {tags.map((t) => (
          <button
            key={t}
            className={`px-3 py-1 rounded-full text-sm ${
              active === t
                ? "bg-[var(--primary)] text-black"
                : "bg-[var(--border)] text-[var(--foreground)]"
            }`}
            onClick={() => setActive(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
        {visible.map((p) => (
          <ProjectCard key={p.name} project={p} />
        ))}
      </div>
    </section>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="border-[var(--border)]">
      <CardHeader className="flex items-center gap-3">
        <Image
          src={project.logo}
          alt={`${project.name} logo`}
          width={40}
          height={40}
          className="rounded"
        />
        <h3 className="font-semibold">{project.name}</h3>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm">{project.description}</p>

        <div className="flex flex-wrap gap-2">
          {project.tech.map((t) => (
            <span
              key={t}
              className="bg-[var(--border)] text-xs px-2 py-1 rounded"
            >
              {t}
            </span>
          ))}
        </div>

        <button
          className="text-sm neon-text"
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide Architecture ⇧" : "View Architecture ⇩"}
        </button>

        {open && (
          <Image
            src={project.arch}
            alt="Architecture diagram"
            width={600}
            height={350}
            className="rounded border border-[var(--border)]"
          />
        )}
      </CardContent>
    </Card>
  );
}
