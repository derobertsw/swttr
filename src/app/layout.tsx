import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@/assets/styles/globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ClerkProvider } from "@clerk/nextjs";

import React from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SWTTR — What to Wear Outside",
    template: "%s | SWTTR",
  },
  description:
    "Science-backed clothing recommendations for outdoor activities. Get layering advice for skiing, running, biking, and more based on real-time weather and thermal comfort models.",
  openGraph: {
    title: "SWTTR — What to Wear Outside",
    description:
      "Science-backed clothing recommendations for outdoor activities.",
    siteName: "SWTTR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "SWTTR — What to Wear Outside",
    description:
      "Science-backed clothing recommendations for outdoor activities.",
  },
};

// Matches the pinned dark canvas in globals.css.
export const viewport: Viewport = {
  themeColor: "#0f1d2a",
};

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <ClerkProvider>
      {/* Pinned to dark until every screen reads the design tokens (#119);
          then the app follows the system appearance. */}
      <html
        lang="en"
        data-appearance="dark"
        className={`${geistSans.variable} ${geistMono.variable}`}
      >
        <head>
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, viewport-fit=cover"
          />
        </head>
        <body className="antialiased">
          {children}
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
};

export default RootLayout;
