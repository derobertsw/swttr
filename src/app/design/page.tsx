import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DesignReference } from "./DesignReference";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

// A working reference for the shared tokens and components. It ships to local
// and preview builds only; docs/design-system.md describes the same rules.
export default function DesignPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <DesignReference />;
}
