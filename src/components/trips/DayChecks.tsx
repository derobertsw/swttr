"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { sectionLabelClassName } from "@/components/trips/trip-primitives";
import { sharedGearStatus } from "@/lib/shared-gear-status";
import { errorMessage, timedTripRequest, TripRequestError } from "@/lib/trip-requests";
import type {
  TripDayCheck, TripDayCheckEntry, TripDayCheckKind, TripDayChecks, TripFull, TripMember, TripPreparationItem,
} from "@/types/trips";

const CHECKS: Record<TripDayCheckKind, { phase: string; label: string; hint: string; stale: string }> = {
  plan_review: {
    phase: "Before leaving", label: "Tour and backup plan reviewed",
    hint: "The route, backup plan, meet and return times and meeting point in the tour plan.",
    stale: "Plan changed — review it again",
  },
  transceiver: {
    phase: "At the trailhead", label: "Transceiver check",
    hint: "Record it at the trailhead, once your transceiver has been checked.",
    stale: "Transceiver changed — check it again",
  },
};
const linkClassName = "inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4 hover:no-underline";

/** Who saved an entry, as the viewer reads it: "you", or someone's name. */
function recorderName(data: TripFull, userId: string | null, recordedBy: string): string {
  if (recordedBy === userId) return "you";
  return data.members.find((member) => member.user_id === recordedBy)?.display_name
    ?? (recordedBy === data.trip.owner_user_id ? "the organizer" : "a former crew member");
}

/** "Recorded 6:12 AM EDT · Sat Oct 10", saying who when it wasn't the person, and the plan revision for a plan review. */
function entryLabel(data: TripFull, userId: string | null, member: TripMember, entry: TripDayCheckEntry): string {
  const by = entry.recorded_by !== member.user_id ? ` by ${recorderName(data, userId, entry.recorded_by)}` : "";
  const plan = entry.plan_revision ? ` · tour plan revision ${entry.plan_revision}` : "";
  return `${entry.action === "recorded" ? "Recorded" : "Undone"} ${entry.time_label}${by}${plan}`;
}

const checksOn = (data: TripFull, date: string) => data.day_checks?.find((day) => day.date === date);

/**
 * A Backcountry day's checks (#212): Before leaving, "Tour and backup plan
 * reviewed", and At the trailhead, "Transceiver check". Each person records
 * their own; the organizer also records a managed guest's, attributed to
 * them. A check only shows as recorded once the server confirms it.
 */
export function DayChecks({ data, date, dateLabel, userId, onSaved }: {
  data: TripFull;
  date: string;
  dateLabel: string;
  userId: string | null;
  /** Reloads the trip; a check changes only once it has. */
  onSaved: () => Promise<void>;
}) {
  const [status, setStatus] = useState("");
  const day = checksOn(data, date);
  const me = data.members.find((member) => member.user_id !== null && member.user_id === userId && member.status !== "left");
  if (!day || !me) return null;
  const mine = day.checks.filter((check) => check.member_id === me.id);
  const guests = data.members.filter((member) => member.status === "guest"
    && day.checks.some((check) => check.member_id === member.id && check.can_record));
  const weekday = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" });

  return (
    <section id="day-checks" aria-labelledby="day-checks-heading" className="flex flex-col gap-2.5">
      <h2 id="day-checks-heading" tabIndex={-1} className="text-title font-semibold text-foreground">Day checks</h2>
      <p className="text-sm text-muted-foreground">
        Each person records their own on the day. A check notes who did it and when; it isn&apos;t a safety assessment.
      </p>
      <p role="status" className="sr-only">{status}</p>
      {mine.length > 0 ? (
        <PersonChecks data={data} day={day} member={me} checks={mine} who="you" dateLabel={dateLabel} userId={userId}
          headingLevel={3} onSaved={onSaved} onStatus={setStatus} />
      ) : (
        <p className="text-base text-foreground">You&apos;re not taking part on {weekday}, so there are no checks for you.</p>
      )}
      {guests.map((guest) => (
        <div key={guest.id} className="mt-2 border-t border-border pt-3">
          <h3 className="text-base font-semibold text-foreground">{guest.display_name} · managed guest</h3>
          <p className="mb-2 text-sm text-muted-foreground">You record their checks. They show as recorded by you.</p>
          <PersonChecks data={data} day={day} member={guest} checks={day.checks.filter((check) => check.member_id === guest.id)}
            who={guest.display_name} dateLabel={dateLabel} userId={userId} headingLevel={4} onSaved={onSaved} onStatus={setStatus} />
        </div>
      ))}
    </section>
  );
}

function PersonChecks({ data, day, member, checks, who, dateLabel, userId, headingLevel, onSaved, onStatus }: {
  data: TripFull;
  day: TripDayChecks;
  member: TripMember;
  checks: TripDayCheck[];
  /** The person, for accessible names: "you" or their name. */
  who: string;
  dateLabel: string;
  userId: string | null;
  headingLevel: 3 | 4;
  onSaved: () => Promise<void>;
  onStatus: (message: string) => void;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className="flex flex-col gap-3">
      {(["plan_review", "transceiver"] as const).map((kind) => {
        const check = checks.find((entry) => entry.kind === kind);
        if (!check) return null;
        return (
          <div key={kind}>
            <Heading className={sectionLabelClassName}>{CHECKS[kind].phase}</Heading>
            <CheckRow data={data} day={day} member={member} check={check} who={who} dateLabel={dateLabel} userId={userId}
              onSaved={onSaved} onStatus={onStatus} />
          </div>
        );
      })}
    </div>
  );
}

function CheckRow({ data, day, member, check, who, dateLabel, userId, onSaved, onStatus }: {
  data: TripFull;
  day: TripDayChecks;
  member: TripMember;
  check: TripDayCheck;
  who: string;
  dateLabel: string;
  userId: string | null;
  onSaved: () => Promise<void>;
  onStatus: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  // One identity per intended change, so a retry after an uncertain failure replays rather than saving twice.
  const mutation = useRef<{ key: string; id: string } | null>(null);
  const statusId = useId();
  const { label, hint, stale } = CHECKS[check.kind];
  const checked = check.status === "recorded";
  const noPlan = check.kind === "plan_review" && !day.plan_available;

  const toggle = async () => {
    if (busy || !check.can_record) return;
    const action = checked ? "withdraw" : "record";
    const key = `${action}:${check.current?.id ?? "none"}`;
    if (mutation.current?.key !== key) mutation.current = { key, id: crypto.randomUUID() };
    setBusy(true); setError(null); onStatus("");
    try {
      await timedTripRequest(`/api/v1/trips/${data.trip.id}/days/${day.date}/checks`, "POST", {
        action, kind: check.kind, day_id: day.trip_day_id, member_id: member.id,
        expected_entry_id: check.current?.id ?? null, context_key: check.context_key, mutation_id: mutation.current.id,
      });
      mutation.current = null;
      await onSaved();
      onStatus(`${action === "record" ? "Recorded" : "Undone"}: ${label}, ${who}, ${dateLabel}`);
    } catch (err) {
      setError({ message: errorMessage(err), conflict: err instanceof TripRequestError && err.status === 409 });
    } finally { setBusy(false); }
  };
  const reload = async () => {
    setBusy(true);
    try { await onSaved(); setError(null); mutation.current = null; }
    catch (err) { setError({ message: errorMessage(err), conflict: true }); }
    finally { setBusy(false); }
  };

  const latest = check.current;
  return (
    <div className="mt-1">
      {noPlan ? (
        <p className="text-base text-foreground">
          {label}: no tour plan to review yet.{" "}
          <span className="text-muted-foreground">Once the organizer saves one, review it here.</span>
        </p>
      ) : (
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" className="size-5 shrink-0 accent-primary" checked={checked}
            aria-label={`${label}, ${who}, ${dateLabel}`} aria-describedby={statusId} aria-disabled={busy || !check.can_record || undefined} aria-busy={busy || undefined}
            onChange={() => void toggle()} />
          <span className="text-base text-foreground">{label}</span>
          {busy && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />}
        </label>
      )}
      <div id={statusId} className="ml-8 text-sm text-muted-foreground">
        {check.status === "out_of_date" ? (
          <>
            <Badge variant="warning">{stale}</Badge>
            <p className="mt-1 text-foreground">{check.stale_reasons.join(" · ")}</p>
            <p>{entryLabel(data, userId, member, latest!)}, before the change.</p>
          </>
        ) : latest ? (
          <p>{latest.action === "recorded" ? entryLabel(data, userId, member, latest) : `Not recorded · ${entryLabel(data, userId, member, latest)}`}</p>
        ) : !noPlan ? (
          <p>Not recorded yet · {hint}</p>
        ) : null}
        {busy && <p>Saving…</p>}
      </div>
      {check.kind === "plan_review" && !noPlan && <a href="#tour-plan-heading" className={`${linkClassName} ml-8`}>Open the tour plan</a>}
      {error && (
        <div role="alert" className="ml-8 mt-1 text-sm">
          <p className="text-destructive">Couldn&apos;t save the check: {error.message}</p>
          {error.conflict && <Button type="button" variant="outline" size="sm" className="mt-1" loading={busy} onClick={() => void reload()}>Check the latest</Button>}
        </div>
      )}
      {check.history.length > 0 && latest && (
        <details className="ml-8 mt-1">
          <summary className="min-h-11 cursor-pointer py-2 text-sm text-foreground">
            History<span className="sr-only">: {label}, {who}</span>
          </summary>
          <ol className="space-y-1 text-sm text-muted-foreground">
            {[latest, ...check.history].map((entry) => <li key={entry.id}>{entryLabel(data, userId, member, entry)}</li>)}
          </ol>
        </details>
      )}
    </div>
  );
}

/** One person's check, as the crew summary says it. */
function crewCheckLabel(data: TripFull, userId: string | null, member: TripMember, check: TripDayCheck | undefined, noPlan: boolean): string {
  if (!check) return "Not taking part";
  if (check.kind === "plan_review" && noPlan) return "No tour plan yet";
  if (check.status === "out_of_date") return `Recorded before it changed: ${check.stale_reasons.join(" · ")}`;
  if (check.status === "recorded") return entryLabel(data, userId, member, check.current!);
  return "Not recorded yet";
}

/**
 * Crew preparation (#212): everyone else taking part on a Backcountry day,
 * with their checks and the shared items assigned to them, as a compact
 * summary that expands to each person. Nothing here is a readiness score,
 * and a solo day has none.
 */
export function CrewPreparation({ data, date, dateLabel, userId }: {
  data: TripFull;
  date: string;
  dateLabel: string;
  userId: string | null;
}) {
  const day = checksOn(data, date);
  if (!day) return null;
  const ids = new Set(day.checks.map((check) => check.member_id));
  const crew = data.members.filter((member) => ids.has(member.id) && !(member.user_id !== null && member.user_id === userId));
  if (crew.length === 0) return null;
  const count = (kind: TripDayCheckKind) => day.checks.filter((check) => check.kind === kind && check.status === "recorded"
    && crew.some((member) => member.id === check.member_id)).length;
  const shared = (member: TripMember) => data.gear.filter((item) => item.assignee_member_id === member.id);
  const awaiting = crew.flatMap(shared).filter((item) => sharedGearStatus(item).status === "awaiting").length;
  const summary = [
    day.plan_available ? `Plan reviewed: ${count("plan_review")} of ${crew.length}` : "No tour plan yet",
    `Transceiver checks: ${count("transceiver")} of ${crew.length}`,
    awaiting ? `${awaiting} shared ${awaiting === 1 ? "item" : "items"} awaiting acceptance` : null,
  ].filter(Boolean).join(" · ");

  return (
    <section id="crew-preparation" aria-labelledby="crew-preparation-heading" className="flex flex-col gap-1">
      <h2 id="crew-preparation-heading" className={sectionLabelClassName}>Crew preparation · {dateLabel}</h2>
      <p className="text-base text-foreground">{summary}</p>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-foreground">Show each person</summary>
        <ul className="divide-y divide-border border-y border-border">
          {crew.map((member) => {
            const of = (kind: TripDayCheckKind) => day.checks.find((check) => check.member_id === member.id && check.kind === kind);
            return (
              <li key={member.id} className="py-3 text-sm">
                <p className="text-base font-medium text-foreground">
                  {member.display_name}{member.status === "guest" && <span className="font-normal text-muted-foreground"> · managed guest</span>}
                </p>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  {[
                    { key: "plan_review", term: "Tour and backup plan", value: crewCheckLabel(data, userId, member, of("plan_review"), !day.plan_available) },
                    { key: "transceiver", term: "Transceiver check", value: crewCheckLabel(data, userId, member, of("transceiver"), false) },
                    ...shared(member).map((item) => ({ key: item.id, term: item.description, value: sharedGearStatus(item).label })),
                  ].map((row) => (
                    <div key={row.key} className="contents">
                      <dt className="break-words text-muted-foreground">{row.term}</dt>
                      <dd className="break-words text-foreground">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
      </details>
      <p className="text-sm text-muted-foreground">Not recorded yet doesn&apos;t mean anything is missing or failed.</p>
    </section>
  );
}

/** "Sat Oct 10" for a "yyyy-MM-dd" date. */
const shortDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).replace(",", "");

function PreparationList({ items }: { items: TripPreparationItem[] }) {
  return (
    <ul className="mt-1 space-y-1">
      {items.map((item) => (
        <li key={`${item.kind}:${item.date}:${item.label}`} className="break-words text-sm text-foreground">
          {item.label}{" "}
          <Link href={item.action.href} aria-label={`${item.action.label}, ${shortDate(item.date)}`}
            className="inline-flex min-h-11 items-center font-semibold text-primary underline">
            {item.action.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Tour preparation on Plan's own page (#212): what the signed-in person can
 * act on, from the server, with their own first and the organizer's crew
 * items after. Facts with a link to act on, never a readiness score.
 */
export function TourPreparation({ items }: { items: TripPreparationItem[] | undefined }) {
  const personal = items?.filter((item) => item.scope === "personal") ?? [];
  const crew = items?.filter((item) => item.scope === "crew") ?? [];
  if (!personal.length && !crew.length) return null;
  return (
    <section aria-labelledby="tour-preparation-heading">
      <h2 id="tour-preparation-heading" className="text-base font-semibold">Tour preparation</h2>
      {personal.length > 0 && <PreparationList items={personal} />}
      {crew.length > 0 && <>
        <h3 className={`${sectionLabelClassName} mt-2`}>Crew</h3>
        <PreparationList items={crew} />
      </>}
    </section>
  );
}
