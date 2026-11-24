import { format } from "date-fns";
import { toPickerDate } from "@/lib/timeZones";
import { cn } from "@/lib/utils";
import type { OutingTime } from "@/types/outing";

/** The requested local time, kept separate from a provider's rounded forecast hour. */
export function OutingTimeSummary({ when, className }: { when: OutingTime; className?: string }) {
  if (when.mode === "now") return null;
  return <p className={cn("text-sm text-muted-foreground", className)}>Requested start: {format(toPickerDate(when.date), "MMM d, yyyy")} at {when.time}, local time.</p>;
}
