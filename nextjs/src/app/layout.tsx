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
  openGraph: {
    title: "Mitchell Kimbell",
    description: "Software Engineer Portfolio",
    url: "https://mitchellkimbell.com/",
    images: [
      {
        url: "https://mitchellkimbell.com/backdrop.png",
        width: 1200,
        height: 630,
        alt: "Mitchell Kimbell Portfolio",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["https://mitchellkimbell.com/backdrop.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
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
