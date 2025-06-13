import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import StoreProvider from "./StoreProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mitchell Kimbell",
  description: "Portfolio and interactive resume",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta property="og:title" content="Mitchell Kimbell" />
        <meta property="og:description" content="Software Engineer Portfolio" />
        <meta
          property="og:image"
          content="https://mitchellkimbell.com/backdrop.png"
        />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:url" content="https://mitchellkimbell.com/" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:image"
          content="https://mitchellkimbell.com/backdrop.png"
        />
      </head>
      {/* gradient follows the document scroll (no bg-fixed!) */}
      <body
        className={`
          ${geistSans.variable} ${geistMono.variable} antialiased
          bg-gradient-to-b from-sky-300 via-sky-400 to-sky-500
        `}
      >
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
