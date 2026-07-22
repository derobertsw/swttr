import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/faq",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/trips/invite(.*)",
  "/api/geocode(.*)",
  "/api/weather(.*)",
  "/api/v1(.*)",
  // Paid agent API — gated by MPP (HTTP 402), not Clerk auth.
  "/api/agent(.*)",
]);

// Clerk-gated even though /api/v1 is otherwise public: anonymous callers would
// get the same response the paid /api/agent mirror charges for. The agent
// routes invoke the v1 handlers in-process, so this gate never runs for them.
// The signed-out frontend degrades gracefully to static recommendations
// (useBiophysicsRecommendation swallows non-OK responses).
const isGatedRecommendationRoute = createRouteMatcher([
  "/api/v1/recommendations(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isGatedRecommendationRoute(request)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        {
          error:
            "Authentication required — machine callers should use the paid /api/agent/recommendations endpoints",
        },
        { status: 401 }
      );
    }
    return;
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
