import React from "react";
import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

const Navigation = () => {
  return (
    <header className="flex w-full items-center justify-between">
      <h1 className="site-header">SWTTR</h1>
      <div className="flex items-center gap-4">
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
