export type Role = {
    company: string;
    logo: string; // /gifs/*.gif
    title: string;
    dates: string;
    bullets: string[];
  };

export const roles: Role[] = [
    {
      company: "Twilio",
      logo: "/gifs/twilio.gif",
      title: "Demo Engineer",
      dates: "May 2025 – Present",
      bullets: [
        "TBD"
      ],
    },
    {
      company: "Regions Bank",
      logo: "/gifs/regions.gif",
      title: "Full-Stack Software Engineer",
      dates: "May 2023 – May 2025",
      bullets: [
        "Overhauled legacy check processing systems leveraging serverless AWS cloud technology.",
        "Lead Developer for a client-facing React/.NET app for 1800+ companies with a yearly revenue of over $3,000,000",
        "Implemented scalable infrastructure with Harness and Terraform for seamless deployments.",
        "Decreased closed-account handling time by 75 %."
      ],
    },
   
    {
      company: "Summit Technology Consulting",
      logo: "/gifs/summit.gif",
      title: "CEO & Founder",
      dates: "Jan 2024 – Present",
      bullets: [
        "Closed & delivered AI / cloud projects on GCP & AWS.",
        "Scoped work and managed small contractor teams.",
      ],
    },
    {
      company: "Dark Tower",
      logo: "/gifs/darktower.gif",
      title: "Software Developer",
      dates: "Dec 2022 – May 2023",
      bullets: [
        "Dockerised Facebook web-scraping pipelines.",
        "Built NLP tooling to enrich analyst data (TDD, Agile).",
      ],
    },
    {
      company: "BioGX",
      logo: "/gifs/biogx.gif",
      title: "Data Analyst",
      dates: "Feb 2022 – Sep 2022",
      bullets: [
        "Automated Tecan-driven assays with Python.",
        "Migrated research data from PDF → Excel using Pandas.",
      ],
    },
  ];
  