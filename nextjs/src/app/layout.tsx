import type { Metadata, Viewport } from "next";
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
  metadataBase: new URL("https://mitchellkimbell.com"),
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon.png", type: "image/png", sizes: "180x180" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Mitchell Kimbell",
    description: "Software Engineer Portfolio",
    url: "https://mitchellkimbell.com/",
    siteName: "Mitchell Kimbell Portfolio",
    type: "website",
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
    title: "Mitchell Kimbell",
    description: "Software Engineer Portfolio",
    images: ["https://mitchellkimbell.com/backdrop.png"],
  },
  other: {
    "theme-color": "#000000",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`
          ${geistSans.variable} ${geistMono.variable} antialiased
          bg-black
        `}
      >
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
