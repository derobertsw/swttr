import { headers } from "next/headers";
import { SignUp } from "@clerk/nextjs";
import { detectNativeShell } from "@/lib/native-shell";
import { safeReturnPath } from "@/lib/outingReturn";

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
    <div className="flex min-h-screen items-center justify-center">
      <SignUp
        forceRedirectUrl={returnTo}
        signInForceRedirectUrl={returnTo}
        {...(nativeShell ? {
          signInUrl: `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`,
        } : {})}
      />
    </div>
  );
}
