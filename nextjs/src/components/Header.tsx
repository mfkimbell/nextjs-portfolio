// src/components/Header.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Award,
  Folder,
  Briefcase,
  Bird,
  Github,
  Download,
  Mail,
  Linkedin,
} from "lucide-react";
import { sectionConfigs } from "@/config/sections";

// ——— NavIcons sub‑component ———
function NavIcons({ scrolled }: { scrolled: boolean }) {
  const navItems = [
    { href: "#talk-to-the-birds", Icon: Bird, label: "Talk to the Birds" },
    { href: "#experience", Icon: Briefcase, label: "Experience" },
    { href: "#skills", Icon: Award, label: "Skills" },
    { href: "#projects", Icon: Folder, label: "Projects" },
    { href: "#metrics", Icon: Mail, label: "Contact Me" },
  ];

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();

    const targetId = href.replace('#', '');
    const element = document.getElementById(targetId);
    if (element) {
      const config = sectionConfigs.find(c => c.id === targetId);
      const headerHeight = 80; // Approximate header height
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerHeight - (config?.offset || 0);

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <nav className="flex items-center space-x-4 pointer-events-auto">
      {navItems.map(({ href, Icon, label }) => (
        <Link
          key={href}
          href={href}
          onClick={(e) => handleClick(e, href)}
          aria-label={label}
          className="group"
        >
          <Icon
            className={`
              w-5 h-5
              transition-colors duration-200 ease-out
              ${scrolled
                ? "text-blue-300 group-hover:text-blue-400 group-hover:scale-110"
                : "text-black group-hover:text-black"
              }
            `}
          />
        </Link>
      ))}
    </nav>
  );
}

// ——— SocialIcons sub‑component ———
function SocialIcons({ scrolled }: { scrolled: boolean }) {
  const socialItems = [
    { href: "https://github.com/mfkimbell", Icon: Github, label: "GitHub", external: true },
    { href: "/resume.pdf", Icon: Download, label: "Resume", download: true },
    {
      href: "mailto:mfkimbell@gmail.com?subject=Portfolio%20contact&body=Hi%20Michael%2C%0D%0A%0D%0AI%20saw%20your%20portfolio%20and%20wanted%20to%20reach%20out.%0D%0A%0D%0AI%20also%20left%20a%20sketch%20on%20your%20site.%0D%0A%0D%0A",
      Icon: Mail,
      label: "Email",
    },
    { href: "https://www.linkedin.com/in/kimbell151/", Icon: Linkedin, label: "LinkedIn", external: true },
  ];

  return (
    <div className="flex items-center space-x-4 pointer-events-auto ml-4">
      {socialItems.map(({ href, Icon, label, external, download }) => {
        const baseColor = scrolled
          ? "text-muted group-hover:text-accent"
          : "text-black group-hover:text-black";
        return (
          <Link
            key={href}
            href={href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            {...(download ? { download: true } : {})}
            aria-label={label}
            className="group"
          >
            <Icon
              className={`
                w-5 h-5
                transition-colors duration-200 ease-out
                ${baseColor}
              `}
            />
          </Link>
        );
      })}
    </div>
  );
}

// ——— Divider sub‑component ———
function Divider() {
  return <div className="h-6 w-px bg-muted/50 pointer-events-none" />;
}

// ——— Main Header ———
export default function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`
        pointer-events-none
        fixed inset-x-0 mx-auto  
        inset-auto top-4
        md:inset-auto md:right-4  md:top-4
        z-500
        w-fit px-3 py-2 rounded-full
        flex items-center
        transition-all duration-300
        ${scrolled
          ? "backdrop-blur-md bg-[rgba(13,17,23,0.35)] shadow-md"
          : "bg-transparent"
        }
      `}
    >
      <NavIcons scrolled={scrolled} />
      <Divider />
      <SocialIcons scrolled={scrolled} />
    </header>
  );
}
