"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Github,
  Download,
  Mail,
  Linkedin,
  Award,
  Folder,
  Briefcase,
  BarChart,
  Send,     // paper-airplane
  Search,   // Google icon
} from "lucide-react";
import Image from "next/image";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 transition-all duration-300
        ${
          scrolled
            ? "backdrop-blur-md bg-[rgba(13,17,23,0.35)] shadow-[0_1px_4px_rgba(0,0,0,0.6)]"
            : "bg-transparent"
        }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Brand Left */}
        <Link href="/" className="pointer-events-auto text-lg font-semibold text-accent">
          Mitchell&nbsp;Kimbell
        </Link>

        {/* Icons Right */}
        <div className="hidden md:flex items-center pointer-events-auto">
          {/* Page-nav icons */}
          <div className="flex items-center space-x-4">
            {/* 🔹 NEW — home / top of page */}
            <Link href="#home" aria-label="Home">
  <Send
    className="
      w-5 h-5
      -rotate-45 scale-[1] translate-y-[4px] translate-x-[2px]    /* 👈 align + size */
      text-muted hover:text-accent transition-colors
    "
  />
</Link>
            <Link href="#skills" aria-label="Skills">
              <Award className="w-5 h-5 text-muted hover:text-accent transition-colors" />
            </Link>
            <Link href="#projects" aria-label="Projects">
              <Folder className="w-5 h-5 text-muted hover:text-accent transition-colors" />
            </Link>
            <Link href="#experience" aria-label="Experience">
              <Briefcase className="w-5 h-5 text-muted hover:text-accent transition-colors" />
            </Link>
            <Link href="#metrics" aria-label="Metrics">
              <BarChart className="w-5 h-5 text-muted hover:text-accent transition-colors" />
            </Link>
          </div>

          {/* Separator */}
          <div className="mx-6 h-6 w-px bg-muted/50" />

          {/* Social / utility icons */}
          <div className="flex items-center space-x-4">
            <Link
              href="https://github.com/mfkimbell"
              target="_blank"
              aria-label="GitHub"
              className="text-muted hover:text-accent transition-colors"
            >
              <Github className="w-5 h-5" />
            </Link>

            <Link
              href="/resume.pdf"
              download
              aria-label="Download Resume"
              className="text-muted hover:text-accent transition-colors"
            >
              <Download className="w-5 h-5" />
            </Link>

            <a
              href="mailto:mfkimbell@gmail.com"
              aria-label="Email"
              className="text-muted hover:text-accent transition-colors"
            >
              <Mail className="w-5 h-5" />
            </a>

            <Link
              href="https://www.linkedin.com/in/mfkimbell"
              target="_blank"
              aria-label="LinkedIn"
              className="text-muted hover:text-accent transition-colors"
            >
              <Linkedin className="w-5 h-5" />
            </Link>

            {/* 🔹 NEW — Google search */}
            <Link
  href="https://www.google.com/search?q=Mitchell+Kimbell"
  target="_blank"
  rel="noopener noreferrer"
  aria-label="Google Search"
  className="flex items-center translate-y-[1px] -translate-x-[3px] "           /* keeps it vertically centred */
>
  <Image
    src="/google.svg"
    alt="Google logo"
    width={18}
    height={18}
    className="opacity-100 hover:opacity-100 transition-opacity"
  />
</Link>
          </div>
        </div>
      </div>
    </header>
  );
}
