import type { ReactNode } from "react";
import { TripProvider } from "@/components/trips/TripProvider";
import { TripWorkspace } from "@/components/trips/TripWorkspace";

export default async function TripLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <TripProvider tripId={id}>
      <TripWorkspace tripId={id}>{children}</TripWorkspace>
    </TripProvider>
  );
}
