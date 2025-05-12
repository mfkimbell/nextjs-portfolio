"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const NAV = [
  { href: "#skills",     label: "Skills" },
  { href: "#metrics",    label: "Metrics" },
  { href: "#projects",   label: "Projects" },
  { href: "#experience", label: "Experience" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`pointer-events-none fixed inset-x-0 top-0 z-45 transition-all duration-300
        ${scrolled ? "backdrop-blur-md bg-[rgba(13,17,23,0.35)] shadow-[0_1px_4px_rgba(0,0,0,0.6)]" : "bg-transparent"}
      `}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Brand */}
        <Link href="/" className="text-lg font-semibold text-accent">
          Mitchell&nbsp;Kimbell
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex gap-6">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="pointer-events-auto text-muted hover:text-accent transition-colors"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
