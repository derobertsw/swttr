import Link from "next/link";
import { AlertTriangle, Backpack, Loader2, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BODY_PART_LABELS, LAYER_LABELS } from "@/lib/layers";
import { BODY_PART_ORDER, LAYER_TYPE_ORDER, type PackingListData, type PackingListWardrobe } from "@/lib/packingList";

/** A packing list request: loading, failed, or the list and how it was matched. */
export type PackingState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; list: PackingListData; wardrobe: PackingListWardrobe };

interface PlanPackingProps {
  state: PackingState;
  onRetry: () => void;
  /** A refetch is in flight while the previous list stays on screen. */
  retrying?: boolean;
}

interface PackingRow {
  key: string;
  name: string;
  detail: string;
  unmatched: boolean;
}

/** One row per item, base to outer, whether or not it matched the wardrobe. */
function rowsFor(list: PackingListData, bodyPart: (typeof BODY_PART_ORDER)[number], wardrobe: PackingListWardrobe): PackingRow[] {
  const matched = wardrobe === "matched";
  return LAYER_TYPE_ORDER.flatMap((layerType) => {
    const layer = LAYER_LABELS[layerType];
    const assigned = list.byBodyPart[bodyPart][layerType].map((entry) => ({
      key: entry.mappingKey,
      name: entry.specificItem,
      detail: entry.specificItem === entry.standardOption
        ? layer
        : `${layer} · ${entry.source === "mapped" ? "Your item for" : "Likely match for"} ${entry.standardOption}`,
      unmatched: false,
    }));
    const unassigned = list.gaps
      .filter((gap) => gap.bodyPart === bodyPart && gap.layerType === layerType)
      .map((gap) => ({ key: gap.mappingKey, name: gap.standardOption, detail: layer, unmatched: matched }));
    return [...assigned, ...unassigned];
  });
}

function WardrobeNote({
  list,
  wardrobe,
  onRetry,
  retrying,
}: {
  list: PackingListData;
  wardrobe: PackingListWardrobe;
  onRetry: () => void;
  retrying?: boolean;
}) {
  if (wardrobe === "signedOut") {
    return (
      <p className="text-sm text-muted-foreground">
        <Link href="/sign-in" className="font-medium text-primary underline underline-offset-4">Sign in</Link>{" "}
        to match these to your wardrobe.
      </p>
    );
  }
  if (wardrobe === "unavailable") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm text-muted-foreground">Your wardrobe couldn&apos;t be checked, so these aren&apos;t matched to your items.</p>
        <Button type="button" size="sm" variant="ghost" onClick={onRetry} loading={retrying}>
          {!retrying && <RotateCw aria-hidden="true" />}
          Try again
        </Button>
      </div>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      {list.gaps.length === 0
        ? "Everything is matched to your wardrobe."
        : `${list.gaps.length} of ${list.totalRequiredSlots} not matched to your wardrobe.`}
    </p>
  );
}

/**
 * Everything the plan's days call for, once each, by body area, then what to
 * carry. Signed in, each item is matched to the wardrobe or marked as not
 * matched; a failed request says so instead of showing an empty list.
 */
export function PlanPacking({ state, onRetry, retrying }: PlanPackingProps) {
  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="text-sm text-muted-foreground">Loading packing list…</p>
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <Card asChild variant="muted">
        <section role="alert" className="flex gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">Packing list unavailable</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Something went wrong building it. The daily plan isn&apos;t affected.
            </p>
            <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRetry} loading={retrying}>
              {!retrying && <RotateCw aria-hidden="true" />}
              Try again
            </Button>
          </div>
        </section>
      </Card>
    );
  }

  const { list, wardrobe } = state;
  const sections = BODY_PART_ORDER
    .map((bodyPart) => ({ bodyPart, rows: rowsFor(list, bodyPart, wardrobe) }))
    .filter((section) => section.rows.length > 0);

  return (
    <div aria-busy={retrying || undefined} className="flex flex-col gap-4">
      {retrying && (
        <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Updating packing list…
        </p>
      )}
      {list.totalRequiredSlots > 0 ? (
        <>
          <WardrobeNote list={list} wardrobe={wardrobe} onRetry={onRetry} retrying={retrying} />
          <Card padding="none" className="divide-y divide-border px-4">
            {sections.map(({ bodyPart, rows }) => (
              <section key={bodyPart} aria-label={BODY_PART_LABELS[bodyPart]} className="py-4">
                <h4 className="text-base font-semibold text-foreground">{BODY_PART_LABELS[bodyPart]}</h4>
                <ul className="mt-2 flex flex-col gap-2.5">
                  {rows.map((row) => (
                    <li key={row.key} className="flex flex-col">
                      <span className="text-base font-medium text-foreground">
                        {row.name}
                        {row.unmatched && (
                          <Badge size="sm" variant="outline" className="ml-2 align-middle font-medium">
                            Not matched to your wardrobe
                          </Badge>
                        )}
                      </span>
                      <span className="text-sm text-muted-foreground">{row.detail}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </Card>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">There&apos;s no clothing list without general layers for these days.</p>
      )}

      {list.extras.length > 0 && (
        <section aria-label="Carry" className="flex flex-col gap-2">
          <h4 className="text-base font-semibold text-foreground">Carry</h4>
          <Card>
            <ul className="flex flex-col gap-2">
              {list.extras.map((item) => (
                <li key={item} className="flex items-center gap-2 text-base text-foreground">
                  <Backpack className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}
