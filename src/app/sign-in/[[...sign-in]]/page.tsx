import type { Metadata } from "next";
import { headers } from "next/headers";
import { SignIn } from "@clerk/nextjs";
import PageLayout from "@/components/PageLayout";
import { AUTH_CARD_APPEARANCE } from "@/lib/clerk-appearance";
import { detectNativeShell } from "@/lib/native-shell";
import { safeReturnPath } from "@/lib/outingReturn";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Back to where sign-in was asked for, like an outing or a protected page.
  const requestHeaders = await headers();
  const returnTo = safeReturnPath((await searchParams).redirect_url, requestHeaders.get("host"));
  const nativeShell = detectNativeShell(requestHeaders.get("user-agent"));
  return (
    <PageLayout>
      <SignIn
        appearance={AUTH_CARD_APPEARANCE}
        forceRedirectUrl={returnTo}
        signUpForceRedirectUrl={returnTo}
        {...(nativeShell ? {
          signUpUrl: `/sign-up?redirect_url=${encodeURIComponent(returnTo)}`,
        } : {})}
      />
    </PageLayout>
  );
}
