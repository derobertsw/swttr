import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@/assets/styles/globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ClerkProvider } from "@clerk/nextjs";
import { TemperatureUnitProvider } from "@/components/TemperatureUnitProvider";
import { headers } from "next/headers";
import { NativeShellProvider } from "@/components/NativeShellProvider";
import { detectNativeShell, NATIVE_SHELL_AUTH_APPEARANCE } from "@/lib/native-shell";

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

// Match the system palettes in globals.css, including browser chrome.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1d2a" },
  ],
};

const RootLayout = async ({ children }: { children: React.ReactNode }) => {
  const shell = detectNativeShell((await headers()).get("user-agent"));
  return (
    <ClerkProvider appearance={shell ? NATIVE_SHELL_AUTH_APPEARANCE : undefined}>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable}`}
      >
        <body className="antialiased">
          <NativeShellProvider shell={shell}>
            <TemperatureUnitProvider>{children}</TemperatureUnitProvider>
            <Toaster />
          </NativeShellProvider>
        </body>
      </html>
    </ClerkProvider>
  );
};

export default RootLayout;
