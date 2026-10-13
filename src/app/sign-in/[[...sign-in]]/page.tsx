import { headers } from "next/headers";
import { SignIn } from "@clerk/nextjs";
import { detectNativeShell, NATIVE_SHELL_AUTH_APPEARANCE } from "@/lib/native-shell";
import { safeReturnPath } from "@/lib/outingReturn";

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
    <div className="flex min-h-screen items-center justify-center">
      <SignIn
        forceRedirectUrl={returnTo}
        signUpForceRedirectUrl={returnTo}
        {...(nativeShell ? {
          appearance: NATIVE_SHELL_AUTH_APPEARANCE,
          signUpUrl: `/sign-up?redirect_url=${encodeURIComponent(returnTo)}`,
        } : {})}
      />
    </div>
  );
}
