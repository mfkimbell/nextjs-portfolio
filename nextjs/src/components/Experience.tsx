// src/components/Experience.tsx
import Image from "next/image";

type Role = {
  company: string;
  logo: string;
  title: string;
  dates: string;
  bullets: string[];
};

const roles: Role[] = [
  {
    company: "Regions Bank",
    logo: "/experience/regions.png",
    title: "Full-Stack Software Engineer",
    dates: "May 2024 – Present",
    bullets: [
      "Overhauled legacy check-processing using AWS serverless.",
      "Built React/.NET portals serving 1800+ corporate clients.",
      "Implemented Harness + Terraform pipelines for zero-downtime deploys.",
    ],
  },
  // add more …
];

export default function Experience() {
  return (
    <section id="experience" className="py-24">
      <h2 className="text-3xl font-bold neon-text mb-12 text-center">
        Experience
      </h2>

      <div className="max-w-4xl mx-auto space-y-10">
        {roles.map((r) => (
          <div key={r.company} className="flex items-start gap-4">
            <Image
              src={r.logo}
              alt={`${r.company} logo`}
              width={48}
              height={48}
              className="rounded-sm flex-shrink-0"
            />
            <div>
              <h3 className="font-semibold">
                {r.title} <span className="text-sm text-gray-400">@ {r.company}</span>
              </h3>
              <p className="text-xs text-gray-500">{r.dates}</p>
              <ul className="list-disc list-inside text-sm mt-2 space-y-1">
                {r.bullets.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
