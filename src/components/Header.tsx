"use client";

import { useState } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Shirt } from "lucide-react";

const Navigation = () => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="relative flex w-full items-center justify-center">
      <SignedOut>
        <div className="absolute left-0">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 hover:bg-gray-100 rounded-md"
            aria-label="Menu"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute top-full left-0 mt-2 bg-white border rounded-md shadow-lg z-50 min-w-40">
              <nav className="py-2">
                <Link
                  href="/wardrobe"
                  className="block px-4 py-2 hover:bg-gray-100"
                  onClick={() => setMenuOpen(false)}
                >
                  Wardrobe
                </Link>
              </nav>
            </div>
          )}
        </div>
      </SignedOut>
      <Link href="/"><h1 className="site-header">SWTTR</h1></Link>
      <div className="absolute right-0 flex items-center gap-4">
        <SignedIn>
          <UserButton>
            <UserButton.MenuItems>
              <UserButton.Link label="Wardrobe" labelIcon={<Shirt size={16} />} href="/wardrobe" />
            </UserButton.MenuItems>
          </UserButton>
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
