import "server-only";
import { isUuid } from "@/lib/trip-lodging";

/** The longest day notes migration 20261028130000 stores, in characters. */
const NOTES_MAX = 2000;

/** A day's notes as the organizer saves them (#334): see docs/trip-workspace.md#day-notes. */
interface TripDayNotesEdit {
  /** The day the editor opened for: after a date change another day can hold the date. */
  day_id: string;
  /** Plain text, trimmed, or null to clear them. */
  notes: string | null;
  /** The day's notes as the editor showed them. */
  expected: { notes: string | null };
}

/** The organizer's notes for a day, or what to fix. */
export function parseDayNotesEdit(value: unknown): TripDayNotesEdit | { error: string; field?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Invalid request." };
  const input = value as Record<string, unknown>;
  if (input.notes != null && typeof input.notes !== "string") return { error: "Enter the notes as text.", field: "notes" };
  const notes = typeof input.notes === "string" ? input.notes.replace(/\r\n?/g, "\n").trim() || null : null;
  if (notes && notes.length > NOTES_MAX) return { error: `Use up to ${NOTES_MAX.toLocaleString("en-US")} characters for the notes.`, field: "notes" };
  const expected = input.expected as Record<string, unknown> | null | undefined;
  if (!isUuid(input.day_id) || !expected || typeof expected !== "object" || Array.isArray(expected)
    || (expected.notes !== null && typeof expected.notes !== "string")) {
    return { error: "Reload the trip before changing the notes." };
  }
  return { day_id: input.day_id, notes, expected: { notes: expected.notes } };
}
