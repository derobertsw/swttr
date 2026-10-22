import type { ReactNode } from "react";
import { PlanWorkspace } from "@/components/trips/PlanWorkspace";

/** Plan's own page and its days share the days list, which stays put while the day changes. */
export default async function PlanLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PlanWorkspace tripId={id}>{children}</PlanWorkspace>;
}
