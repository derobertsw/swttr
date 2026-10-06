import { format } from "date-fns";
import { toPickerDate } from "@/lib/timeZones";
import type { OutingTime } from "@/types/outing";

/** The requested local time, kept separate from a provider's rounded forecast hour. */
export function OutingTimeSummary({ when }: { when: OutingTime }) {
  if (when.mode === "now") return null;
  return <p className="text-sm text-muted-foreground">Requested start: {format(toPickerDate(when.date), "MMM d, yyyy")} at {when.time}, local time.</p>;
}
