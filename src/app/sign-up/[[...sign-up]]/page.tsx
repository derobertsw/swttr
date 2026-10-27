import type { Metadata } from "next";
import { headers } from "next/headers";
import { SignUp } from "@clerk/nextjs";
import PageLayout from "@/components/PageLayout";
import { AUTH_CARD_APPEARANCE } from "@/lib/clerk-appearance";
import { detectNativeShell } from "@/lib/native-shell";
import { safeReturnPath } from "@/lib/outingReturn";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Back to where an account was asked for, like an outing or a protected page.
  const requestHeaders = await headers();
  const returnTo = safeReturnPath((await searchParams).redirect_url, requestHeaders.get("host"));
  const nativeShell = detectNativeShell(requestHeaders.get("user-agent"));
  return (
    <PageLayout>
      <SignUp
        appearance={AUTH_CARD_APPEARANCE}
        forceRedirectUrl={returnTo}
        signInForceRedirectUrl={returnTo}
        {...(nativeShell ? {
          signInUrl: `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`,
        } : {})}
      />
    </PageLayout>
  );
}
