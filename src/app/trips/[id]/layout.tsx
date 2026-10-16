import type { ReactNode } from "react";
import { TripProvider } from "@/components/trips/TripProvider";

export default async function TripLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TripProvider tripId={id}>{children}</TripProvider>;
}
