import React from "react";
import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

const Navigation = () => {
  return (
    <header className="grid w-full grid-cols-3 items-center">
      <div />
      <h1 className="site-header text-center">SWTTR</h1>
      <div className="flex items-center justify-end gap-4">
        <SignedIn>
          <UserButton />
        </SignedIn>
        <SignedOut>
          <Link href="/sign-in" className="text-sm hover:underline">
            Sign In
          </Link>
        </SignedOut>
      </div>
    </header>
  );
};

export default Navigation;
