import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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

export default clerkMiddleware(async (auth, request) => {
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
