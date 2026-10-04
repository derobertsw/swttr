import { headers } from "next/headers";
import { SignIn } from "@clerk/nextjs";
import { safeReturnPath } from "@/lib/outingReturn";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Back to where sign-in was asked for, like an outing or a protected page.
  const returnTo = safeReturnPath((await searchParams).redirect_url, (await headers()).get("host"));
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn forceRedirectUrl={returnTo} signUpForceRedirectUrl={returnTo} />
    </div>
  );
}
