import { format } from "date-fns";
import { ACTIVITIES } from "@/data/activities";
import { Button } from "@/components/ui/button";
import { formatLocationName } from "@/hooks/useLocationSearch";
import { EXERTION_LABELS } from "@/lib/biophysics/exertion";
import { toPickerDate } from "@/lib/timeZones";
import type { Outing, OutingRequestState } from "@/types/outing";

function describeOuting(outing: Outing): string {
  const activity = ACTIVITIES.find(({ value }) => value === outing.activity)?.name ?? outing.activity;
  const { when } = outing;
  const time = when.mode === "now"
    ? "Now"
    : `${format(toPickerDate(when.date), "MMM d, yyyy")} at ${when.time} local time${when.durationDays > 1 ? ` · ${when.durationDays} days` : ""}`;
  return `${activity} · ${EXERTION_LABELS[outing.exertion]} effort · ${formatLocationName(outing.place)} · ${time}`;
}

/** Pending inputs never label the advice that is still on screen. */
export function OutingRequestNotice({ request, shownOuting, onRetry }: {
  request: OutingRequestState;
  shownOuting?: Outing;
  onRetry: () => Promise<boolean>;
}) {
  if (request.status === "idle") return null;
  const loading = request.status === "loading";
  return (
    <div className="flex w-full flex-col gap-3 rounded-control border border-border bg-card px-4 py-3 text-sm text-foreground">
      <div role={loading ? "status" : "alert"} aria-atomic="true" className="space-y-2 break-words">
        <p className="font-medium">{loading ? "Updating outing…" : "Outing update failed"}</p>
        <p>{describeOuting(request.outing)}</p>
        {request.status === "error" && <p>{request.message}</p>}
        {shownOuting && <p className="text-muted-foreground">Still showing the previous result: {describeOuting(shownOuting)}.</p>}
      </div>
      {shownOuting && (
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-11 max-w-full self-start whitespace-normal py-2"
          loading={loading}
          onClick={async (event) => {
            const button = event.currentTarget;
            const shown = await onRetry();
            // A successful update removes this notice. Keep keyboard focus in the result.
            if (shown && (document.activeElement === button || document.activeElement === document.body)) {
              document.getElementById("outing-result-heading")?.focus({ preventScroll: true });
            }
          }}
        >
          {loading ? "Updating…" : "Try update again"}
        </Button>
      )}
    </div>
  );
}
