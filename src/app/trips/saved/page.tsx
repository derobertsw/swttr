"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { BackLink, SectionLabel } from "@/components/trips/trip-primitives";
import {
  CheckStatus, OfflineBriefView, absoluteTime, savedBriefHref, savedLine, useBriefCheck, useOnline,
} from "@/components/trips/OfflineBrief";
import {
  fetchOfflineBrief, readSavedBriefs, reconcileSavedBriefs, removeSavedBrief, saveTicket, storeSavedBrief, type SavedBrief,
} from "@/lib/offline-briefs";
import { prepareOfflineOpening } from "@/lib/offline-shell";
import { errorMessage } from "@/lib/trip-requests";
import { tripOpenHref } from "@/lib/trip-sections";

// Online, how long to wait for the account before showing what's saved: the
// account check needs Clerk, which never loads without a connection.
const ACCOUNT_WAIT_MS = 3000;

type Device = { account: string | null; briefs: SavedBrief[]; damaged: string[] };

/**
 * Saved on this device (#214): the trip briefs this device keeps, and one
 * brief by `?trip=`. It reads only the browser's own storage, so it opens
 * with no connection, through the page's service worker, and never needs a
 * sign-in or a trip read. Online, it checks each copy against the trip.
 */
export default function SavedBriefsPage() {
  return (
    <PageLayout chromeVariant="compact">
      <Suspense fallback={<p className="text-base text-muted-foreground">Opening saved trips…</p>}>
        <SavedBriefs />
      </Suspense>
    </PageLayout>
  );
}

function SavedBriefs() {
  const tripId = useSearchParams().get("trip");
  const { isLoaded, userId } = useAuth();
  const online = useOnline();
  const [device, setDevice] = useState<Device | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [waited, setWaited] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(() => readSavedBriefs().then(
    (read) => { setDevice(read); setStorageError(null); },
    (err) => { setDevice({ account: null, briefs: [], damaged: [] }); setStorageError(errorMessage(err)); },
  ), []);

  useEffect(() => {
    let current = true;
    readSavedBriefs().then(
      (read) => { if (current) setDevice(read); },
      (err) => { if (current) { setDevice({ account: null, briefs: [], damaged: [] }); setStorageError(errorMessage(err)); } },
    );
    return () => { current = false; };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), ACCOUNT_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // Another account signed in, or (as the server confirms) nobody: this
  // device's copies go, as they do on signing out.
  const account = device?.account ?? null;
  const signedInAs = isLoaded ? userId ?? null : undefined;
  // While the server is asked whether a signed-out device really is, its briefs stay hidden.
  const [settled, setSettled] = useState<string | null>(null);
  const reconcileKey = signedInAs === undefined || !account || signedInAs === account ? null : `${signedInAs}:${account}`;
  useEffect(() => {
    if (!reconcileKey) return;
    let current = true;
    reconcileSavedBriefs(signedInAs ?? null, account).then((cleared) => {
      if (!current) return;
      if (cleared) setNotice(signedInAs ? "Trips saved by another account were removed from this device." : "You signed out, so the trips saved on this device were removed.");
      setSettled(reconcileKey);
      if (cleared) void load();
    }, () => { if (current) setSettled(reconcileKey); });
    return () => { current = false; };
  }, [reconcileKey, signedInAs, account, load]);

  const otherAccount = typeof signedInAs === "string" && !!account && signedInAs !== account;
  const checkingAccount = !!reconcileKey && settled !== reconcileKey;
  const ready = !!device && (isLoaded || !online || waited) && !checkingAccount;
  const briefs = otherAccount ? [] : device?.briefs ?? [];
  const shown = tripId ? briefs.find((saved) => saved.trip_id === tripId) : undefined;
  // Checks need the copy's own account signed in; offline, the copies show as saved.
  const canCheck = !!userId && userId === account;

  if (!ready) return <p role="status" className="text-base text-muted-foreground">Opening saved trips…</p>;

  if (tripId) {
    return <div className="flex w-full min-w-0 flex-col gap-5">
      <BackLink href="/trips/saved">Saved on this device</BackLink>
      {shown ? (
        <SavedBriefDetail saved={shown} canCheck={canCheck} onChanged={load} onRemoved={setNotice} />
      ) : (
        <div className="flex flex-col gap-2">
          <h1 className="text-title font-semibold text-foreground">Not saved on this device</h1>
          <p role="status" className="text-base text-muted-foreground">{notice || "This trip isn't saved on this device. Save it for offline from the trip's Plan page while you're online."}</p>
          {online && <Link href={tripOpenHref(tripId)} className="inline-flex min-h-11 w-fit items-center text-base font-semibold text-primary">Open the trip</Link>}
        </div>
      )}
    </div>;
  }

  return (
    <div className="flex w-full max-w-3xl min-w-0 flex-col gap-5">
      {online && <BackLink href="/trips">All trips</BackLink>}
      <header>
        <SectionLabel>Trips</SectionLabel>
        <h1 className="mt-1 text-title font-semibold text-foreground md:text-title-lg">Saved on this device</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Read-only trip briefs you saved, for when there&apos;s no connection. They change only when you update them, and signing out removes them.
        </p>
      </header>
      <p role="status" aria-live="polite" className="text-base text-foreground">{notice}</p>
      {storageError && <p role="alert" className="text-base font-medium text-destructive">Couldn&apos;t read this device&apos;s saved trips: {storageError}</p>}
      {!otherAccount && device && device.damaged.length > 0 && (
        <p className="text-base text-foreground">
          {device.damaged.length === 1 ? "A saved trip" : `${device.damaged.length} saved trips`} couldn&apos;t be read on this device and {device.damaged.length === 1 ? "isn't" : "aren't"} shown. Save {device.damaged.length === 1 ? "it" : "them"} again while you&apos;re online.
        </p>
      )}
      {briefs.length === 0 ? (
        <p className="text-base text-muted-foreground">
          No trips are saved on this device. Open a trip&apos;s Plan page while you&apos;re online and choose Save for offline.
        </p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {briefs.map((saved) => <SavedRow key={saved.trip_id} saved={saved} canCheck={canCheck} onChanged={load} />)}
        </ul>
      )}
    </div>
  );
}

function SavedRow({ saved, canCheck, onChanged }: { saved: SavedBrief; canCheck: boolean; onChanged: () => Promise<void> }) {
  const { check } = useBriefCheck(saved, canCheck);
  const gone = useRemoveWhenGone(saved, check?.state === "gone", onChanged);
  return (
    <li className="py-3">
      <Link href={savedBriefHref(saved.trip_id)} className="inline-flex min-h-11 items-center text-lg font-semibold text-primary underline-offset-2 hover:underline wrap-anywhere">
        {saved.brief.trip.name}
      </Link>
      <p className="text-base text-foreground">{savedLine(saved.brief)}</p>
      <div role="status" aria-live="polite">{gone ?? <CheckStatus saved={saved} check={check} />}</div>
    </li>
  );
}

/**
 * A copy of a trip the person can no longer see goes from the device once
 * the server says so (#214): reconnecting rechecks access.
 */
function useRemoveWhenGone(saved: SavedBrief, gone: boolean, onChanged: () => Promise<void>): string | null {
  const [removed, setRemoved] = useState<string | null>(null);
  useEffect(() => {
    if (!gone) return;
    removeSavedBrief(saved.trip_id).then(
      () => setRemoved(`Removed from this device: you're no longer on ${saved.brief.trip.name}, or it was deleted.`),
      () => setRemoved("You're no longer on this trip, or it was deleted. Remove the saved copy from this device."),
    );
  }, [gone, saved]);
  useEffect(() => {
    if (!removed) return;
    const timer = window.setTimeout(() => void onChanged(), 4000);
    return () => window.clearTimeout(timer);
  }, [removed, onChanged]);
  return removed;
}

function SavedBriefDetail({ saved, canCheck, onChanged, onRemoved }: {
  saved: SavedBrief; canCheck: boolean; onChanged: () => Promise<void>; onRemoved: (message: string) => void;
}) {
  const online = useOnline();
  const { check, recheck } = useBriefCheck(saved, canCheck);
  const gone = useRemoveWhenGone(saved, check?.state === "gone", onChanged);
  const [working, setWorking] = useState<"update" | "remove" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const update = async () => {
    if (working || !saved.account_id) return;
    setWorking("update"); setError(null); setMessage("");
    try {
      const ticket = await saveTicket();
      const { brief } = await fetchOfflineBrief(saved.trip_id, saved.brief.covered.dates);
      await storeSavedBrief(saved.account_id, brief, ticket);
      const opening = await prepareOfflineOpening();
      setMessage("Updated.");
      if (!opening.ready) setError(opening.reason);
      await onChanged();
    } catch (err) {
      setError(`Couldn't update the saved copy: ${errorMessage(err)} The copy saved ${absoluteTime(saved.brief.saved_at)} is still on this device.`);
      recheck();
    } finally {
      setWorking(null);
    }
  };

  const remove = async () => {
    if (working) return;
    setWorking("remove"); setError(null);
    try {
      await removeSavedBrief(saved.trip_id);
      onRemoved(`Removed ${saved.brief.trip.name} from this device. The trip online hasn't changed.`);
      await onChanged();
    } catch (err) {
      setError(`Couldn't remove the saved copy: ${errorMessage(err)}`);
      setWorking(null);
    }
  };

  return (
    <OfflineBriefView
      brief={saved.brief}
      status={<>
        <p className="text-base text-foreground">{savedLine(saved.brief)}</p>
        {gone ? <p className="text-base text-foreground">{gone}</p> : canCheck || !online ? <CheckStatus saved={saved} check={check ?? { state: "failed", message: "You're offline.", offline: true }} />
          : <p className="text-base text-muted-foreground">Sign in to check for changes. Showing saved copy; changes since {absoluteTime(saved.brief.saved_at)} are unknown.</p>}
        {message && <p className="text-base text-foreground">{message}</p>}
      </>}
      actions={<div className="mt-2 flex flex-col gap-2">
        {error && <p role="alert" className="text-base font-medium text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {canCheck && online && (
            <Button type="button" variant={check?.state === "changed" ? "default" : "outline"} onClick={() => void update()} disabled={!!working} aria-busy={working === "update" || undefined}>
              {working === "update" ? "Updating saved copy…" : "Update saved copy"}
            </Button>
          )}
          {canCheck && online && <Button asChild variant="outline"><Link href={tripOpenHref(saved.trip_id)}>Open the trip</Link></Button>}
          <Button type="button" variant="ghost" onClick={() => void remove()} disabled={!!working} aria-busy={working === "remove" || undefined}>
            {working === "remove" ? "Removing…" : "Remove from this device"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">Removing deletes only this device&apos;s copy. The trip stays online.</p>
      </div>}
    />
  );
}
