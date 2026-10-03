"use client";

import { useId, useState } from "react";
import { AlertTriangle, RotateCw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const UPDATING = "Updating comfort check…";
const UPDATED = "Comfort check updated.";
const FAILED = "Couldn't check these layers.";

interface EvaluationStatusProps {
  /** A check of the current layers is running. */
  pending: boolean;
  /** The check of the current layers failed. */
  failed: boolean;
  /** A failed check is being sent again. */
  retrying: boolean;
  /** A check of earlier layers is on screen. */
  hasPreviousCheck: boolean;
  onRetry: () => void;
  /** Undoes the last change, when there is one. */
  onUndo?: () => void;
}

/**
 * How the comfort check relates to the layers on screen. Screen readers hear
 * when a check starts, finishes or fails, without focus moving. A failed check
 * offers Try again and Undo change.
 */
export function EvaluationStatus({ pending, failed, retrying, hasPreviousCheck, onRetry, onUndo }: EvaluationStatusProps) {
  const titleId = useId();
  const [message, setMessage] = useState("");

  // The first check after the result loads isn't announced; later ones are,
  // and once one is, so is its outcome.
  const live = failed ? FAILED : pending && (hasPreviousCheck || retrying) ? UPDATING : null;
  const settled = message === UPDATING || message === FAILED ? (pending ? message : UPDATED) : message;
  const nextMessage = live ?? settled;
  if (nextMessage !== message) setMessage(nextMessage);

  return (
    <>
      <p role="status" className="sr-only">{nextMessage}</p>
      {(failed || retrying) && (
        <Card asChild variant="muted">
          <section aria-labelledby={titleId} className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0">
              <h3 id={titleId} className="text-base font-semibold text-foreground">
                Couldn&apos;t check these layers
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {hasPreviousCheck
                  ? "The comfort check shown is for your layers before the last change."
                  : "Try again to see whether they'll keep you comfortable."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={onRetry} loading={retrying}>
                  {!retrying && <RotateCw aria-hidden="true" />}
                  Try again
                </Button>
                {onUndo && (
                  <Button type="button" size="sm" variant="ghost" onClick={onUndo}>
                    <Undo2 aria-hidden="true" />
                    Undo change
                  </Button>
                )}
              </div>
            </div>
          </section>
        </Card>
      )}
    </>
  );
}
