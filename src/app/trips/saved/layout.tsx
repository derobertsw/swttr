import type { Metadata } from "next";

// Its own title ("Saved on this device | SWTTR"), so a bookmark or the
// browser's history names it: with no connection, it's the one page that opens (#214).
export const metadata: Metadata = { title: "Saved on this device" };

export default function SavedBriefsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
