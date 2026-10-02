import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DesignReference } from "./DesignReference";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

// A working reference for the shared tokens and components, served only by
// the dev server and Vercel preview deployments; everywhere else, including
// `next start` without VERCEL_ENV, it 404s. docs/design-system.md describes
// the same rules.
export default function DesignPage() {
  if (process.env.NODE_ENV !== "development" && process.env.VERCEL_ENV !== "preview") {
    notFound();
  }
  return <DesignReference />;
}
