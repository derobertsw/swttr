import { auth } from "@clerk/nextjs/server";

/**
 * Get the authenticated Clerk user ID from the current request context.
 * Returns the userId string, or null if the user is not signed in.
 * Use this for endpoints that require authentication (wardrobe, preferences).
 */
export async function getAuthUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}
