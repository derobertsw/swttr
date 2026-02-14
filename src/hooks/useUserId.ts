"use client";

import { useAuth } from "@clerk/nextjs";

/**
 * Hook that returns the Clerk user ID when signed in, or null otherwise.
 * Replaces the previous localStorage UUID approach so data syncs across devices.
 */
export function useUserId(): string | null {
  const { userId, isLoaded } = useAuth();

  if (!isLoaded) return null;
  return userId ?? null;
}
