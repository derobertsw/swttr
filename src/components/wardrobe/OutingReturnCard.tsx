"use client";

import { useId, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useUserId } from "@/hooks/useUserId";
import { readGearUpDraft } from "@/lib/gearUpDraft";
import { FROM_PARAM, RESUME_OUTING_PATH, RESUME_PACKING_PATH } from "@/lib/outingReturn";
import { outingSummary } from "@/lib/outingSummary";

/**
 * On Wardrobe opened from an outing's results (/wardrobe?from=outing): the
 * way back to that outing, whose layers are then worked out again with the
 * gear in the wardrobe, or to a multi-day plan's packing list, matched again.
 * Shown only for the outing this account kept in the tab.
 */
export function OutingReturnCard() {
  const titleId = useId();
  const fromOuting = useSearchParams().get(FROM_PARAM) === "outing";
  // Unknown until sign-in loads, which is also after the page hydrates.
  const userId = useUserId();
  const outing = useMemo(
    () => (fromOuting && userId ? (readGearUpDraft(userId)?.lastOuting ?? null) : null),
    [fromOuting, userId]
  );
  if (!outing) return null;
  const isPlan = outing.when.mode === "later" && outing.when.durationDays > 1;

  return (
    <Card asChild variant="muted">
      <section aria-labelledby={titleId} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            Back to your outing
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {outingSummary(outing)}.{" "}
            {isPlan
              ? "Add what you'd pack, then match the packing list to your gear again."
              : "Add what you'd wear, then get layers worked out again with your gear."}
          </p>
        </div>
        {/* Outline: adding gear is the page's main action, and this is the way back after it. */}
        <Button asChild variant="outline" className="shrink-0 self-start sm:self-auto">
          {isPlan ? (
            <Link href={RESUME_PACKING_PATH}>Get my packing list</Link>
          ) : (
            <Link href={RESUME_OUTING_PATH}>Get my layers</Link>
          )}
        </Button>
      </section>
    </Card>
  );
}
