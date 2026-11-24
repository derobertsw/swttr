"use client";

import { useEffect, useId, useState } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { WardrobeCoverage } from "@/types/wardrobe-coverage";

/** Waits for a burst of adds and removes to settle before asking again. */
const REFRESH_DELAY_MS = 600;
const SHOWN_GAPS = 3;
const SHOWN_WORKHORSES = 3;

type State =
  | { status: "loading" }
  | { status: "ready"; coverage: WardrobeCoverage }
  | { status: "error" }
  /** Signed out: guests have no wardrobe to measure. */
  | { status: "hidden" };

const percent = (share: number) => `${Math.round(share * 100)}%`;

/**
 * How far the wardrobe goes (#93): the share of a fixed grid of activities
 * and weather it dresses for, how much of it does that work, and the largest
 * gaps. Everything is worked out by GET /api/wardrobe/coverage.
 *
 * `contentsKey` changes whenever the wardrobe's included items change, which
 * asks for the coverage again.
 */
export function WardrobeCoverageCard({ contentsKey }: { contentsKey: string }) {
  const titleId = useId();
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/wardrobe/coverage", { signal: controller.signal });
        if (response.status === 401) {
          setState({ status: "hidden" });
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setState({ status: "ready", coverage: (await response.json()) as WardrobeCoverage });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    }, REFRESH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [contentsKey, attempt]);

  if (state.status === "hidden") return null;

  return (
    <Card asChild>
      <section aria-labelledby={titleId} aria-busy={state.status === "loading"} className="flex flex-col gap-3">
        <div>
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            How far your gear goes
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {state.status === "ready"
              ? `Your gear across ${state.coverage.grid_description}.`
              : "Your gear across a fixed set of activities and weather."}
          </p>
        </div>

        {state.status === "loading" && (
          <div className="flex flex-col gap-2" aria-label="Working out your coverage">
            <Skeleton className="h-14 w-full rounded-control" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {state.status === "error" && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Couldn&apos;t work out your coverage.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setState({ status: "loading" });
                setAttempt((n) => n + 1);
              }}
            >
              <RotateCw />
              Retry
            </Button>
          </div>
        )}

        {state.status === "ready" && <CoverageDetails coverage={state.coverage} />}
      </section>
    </Card>
  );
}

function CoverageDetails({ coverage }: { coverage: WardrobeCoverage }) {
  const { efficiency } = coverage;
  const gaps = coverage.gaps.slice(0, SHOWN_GAPS);
  const moreGaps = coverage.gaps.length - gaps.length;
  const workhorses = coverage.workhorses.slice(0, SHOWN_WORKHORSES);

  return (
    <>
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-control bg-muted p-3">
          <dt className="text-sm text-muted-foreground">Coverage</dt>
          <dd className="text-title font-semibold text-foreground">{percent(coverage.coverage)}</dd>
          <dd className="text-sm text-muted-foreground">
            {coverage.covered_count} of {coverage.scenario_count} conditions
          </dd>
        </div>
        <div className="rounded-control bg-muted p-3">
          <dt className="text-sm text-muted-foreground">Efficiency</dt>
          <dd className="text-title font-semibold text-foreground">{percent(efficiency.score)}</dd>
          <dd className="text-sm text-muted-foreground">
            {efficiency.used_items} of {efficiency.modeled_items} items used
          </dd>
        </div>
      </dl>

      {gaps.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-foreground">Biggest gaps</h3>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
            {gaps.map((gap) => (
              <li key={gap.scenario_ids[0]}>{gap.message}</li>
            ))}
          </ul>
          {moreGaps > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              And {moreGaps} more {moreGaps === 1 ? "gap" : "gaps"}.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No gaps: every condition has an outfit.</p>
      )}

      {workhorses.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground">Doing the most work</h3>
          <ul className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground">
            {workhorses.map((item) => (
              <li key={item.key} className="flex justify-between gap-3">
                <span className="min-w-0">{item.name}</span>
                <span className="shrink-0">
                  {item.covered_scenarios} {item.covered_scenarios === 1 ? "condition" : "conditions"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">How this is measured</summary>
        <p className="mt-1">
          Each condition gets the outfit your recommendations would pick from your gear, at moderate effort. It counts as
          covered when that outfit is likely comfortable, or only a little warm, and nothing required is missing.
          Efficiency is the share of your gear that&apos;s worn in at least one covered condition. Custom items
          aren&apos;t counted yet.
        </p>
      </details>
    </>
  );
}
