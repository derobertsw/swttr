"use client";

import Link from "next/link";

/** Packing opens on the person's own list, with the crew's shared items one tap away (#336). */
export function PackingNav({ tripId, current }: { tripId: string; current: "mine" | "shared" }) {
  const base = `/trips/${encodeURIComponent(tripId)}`;
  const linkClassName = "flex min-h-11 items-center border-b-2 border-transparent text-base text-muted-foreground hover:border-input hover:text-foreground focus-visible:-outline-offset-2 aria-[current=page]:border-primary aria-[current=page]:font-semibold aria-[current=page]:text-foreground";
  return <nav aria-label="Packing lists" className="flex gap-6 border-b border-border">
    <Link href={`${base}/pack`} aria-current={current === "mine" ? "page" : undefined} className={linkClassName}>My packing</Link>
    <Link href={`${base}/gear`} aria-current={current === "shared" ? "page" : undefined} className={linkClassName}>Shared items</Link>
  </nav>;
}
