"use client";

import Link from "next/link";
import Image from "next/image";

/**
 * Cloud1 duplicates Header spacing with invisible placeholders but swaps the
 * "Projects" link for a decorative cloud. The component remains behind Header
 * and Hero content using `z-1` and does not block any interaction.
 */
export default function Cloud1() {
  return (
    <header className="absolute inset-x-0 top-0 z-1 pointer-events-none select-none">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Invisible brand for spacing */}
        <Link href="/" className="text-lg font-semibold invisible">
          Mitchell&nbsp;Kimbell
        </Link>

        {/* Nav replica */}
        <nav className="hidden md:flex gap-6">
          <Link href="#skills"     className="text-muted invisible">Skills</Link>
          <Link href="#metrics"    className="text-muted invisible">Metrics</Link>

          {/* Cloud replaces "Projects" */}
          <div className="relative w-[500px] h-[500px]">
            <Image
              src="/clouds/cloud3.png"
              alt="Decorative cloud"
              fill
              priority
              className="opacity-100 pointer-events-none scale-105 drop-shadow-md"
            />
          </div>

          <Link href="#experience" className="text-muted invisible">Experience</Link>
        </nav>
      </div>

      {/* Extra clouds with refined styling, layered and scattered vertically */}
      <div className="absolute top-0 left-0 w-full pointer-events-none z-[-1]">
        <div className="absolute left-[4%] top-60 scale-100 opacity-100 blur-xs">
          <Image src="/clouds/cloud3.png" alt="Cloud A" width={240} height={240} priority />
        </div>
        <div className="absolute left-[18%] top-12 scale-85 opacity-100 blur-xs">
          <Image src="/clouds/cloud2.png" alt="Cloud B" width={260} height={260} priority />
        </div>
        <div className="absolute left-[34%] top-4 scale-110 opacity-100">
          <Image src="/clouds/cloud4.png" alt="Cloud C" width={220} height={220} priority />
        </div>
        <div className="absolute left-[52%] top-100 scale-90 opacity-100 blur-xs">
          <Image src="/clouds/cloud3.png" alt="Cloud D" width={200} height={200} priority />
        </div>
        <div className="absolute left-[68%] top-14 scale-95 opacity-100">
          <Image src="/clouds/cloud2.png" alt="Cloud E" width={280} height={280} priority />
        </div>
        <div className="absolute left-[82%] top-100 scale-100 opacity-100 blur-sm">
          <Image src="/clouds/cloud5.png" alt="Cloud F" width={230} height={230} priority />
        </div>

        {/* Lower clouds, closer and clearer */}
        <div className="absolute left-[12%] top-[60%] scale-[1.2] opacity-100">
          <Image src="/clouds/cloud3.svg" alt="Cloud G" width={260} height={260} priority />
        </div>
        <div className="absolute left-[45%] top-[68%] scale-[1.4] opacity-100">
          <Image src="/clouds/cloud2.png" alt="Cloud H" width={300} height={300} priority />
        </div>
        <div className="absolute left-[75%] top-[58%] scale-[1.15] opacity-100">
          <Image src="/clouds/cloud3.png" alt="Cloud I" width={250} height={250} priority />
        </div>
      </div>
    </header>
  );
}
