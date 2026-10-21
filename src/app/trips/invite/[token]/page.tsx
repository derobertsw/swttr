"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import { CheckCircle2, MapPin } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { SectionLabel, formatDateRange } from "@/components/trips/trip-primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, tripRequest, TripRequestError } from "@/lib/trip-requests";

interface InvitePreview {
  state: "available" | "joined";
  invite: { display_name: string; status: string };
  trip: { id: string; name: string; start_date: string; end_date: string };
  organizer_name: string | null;
}
type InviteState = { state: "loading" } | { state: "unavailable" | "failed"; message: string } | InvitePreview;

export default function InviteLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { isLoaded, user } = useUser();
  // Remount on account changes: never retain a previous account's trip preview.
  return <PageLayout chromeVariant="compact">{isLoaded ? (
    <Invitation key={`${token}:${user?.id ?? "signed-out"}`} token={token}
      account={user ? user.primaryEmailAddress?.emailAddress ?? user.fullName ?? user.primaryPhoneNumber?.phoneNumber ?? user.username ?? "your account" : null} />
  ) : <Skeleton className="h-32 w-full max-w-md" />}</PageLayout>;
}

function Invitation({ token, account }: { token: string; account: string | null }) {
  const router = useRouter();
  const { signOut } = useClerk();
  const [result, setResult] = useState<InviteState>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const returnUrl = `/trips/invite/${encodeURIComponent(token)}`;
  const endpoint = `/api/v1/trips/invite/${encodeURIComponent(token)}`;

  useEffect(() => {
    let cancelled = false;
    tripRequest<InvitePreview>(endpoint).then((preview) => {
      if (!preview || !["available", "joined"].includes(preview.state) || !preview.trip?.id || !preview.invite) {
        throw new Error("Couldn't load the invitation. Try again.");
      }
      if (!cancelled) setResult(preview);
    }).catch((err) => {
      if (!cancelled) setResult({ state: err instanceof TripRequestError && err.status === 404 ? "unavailable" : "failed", message: errorMessage(err) });
    });
    return () => { cancelled = true; };
  }, [endpoint, attempt]);

  const accept = async () => {
    setAccepting(true);
    setActionError(null);
    try {
      const data = await tripRequest<{ trip_id: string }>(endpoint, "POST");
      if (!data?.trip_id) throw new Error("Couldn't confirm acceptance.");
      // The pack list is a durable destination, also reachable from My trips.
      router.push(`/trips/${data.trip_id}/pack`);
    } catch (err) {
      if (err instanceof TripRequestError && err.status === 404) {
        setResult({ state: "unavailable", message: errorMessage(err) });
      } else {
        setActionError(`${errorMessage(err)} You can safely try accepting again, or check My trips if you already joined.`);
      }
    } finally { setAccepting(false); }
  };

  const switchAccount = async () => {
    setSwitching(true);
    setActionError(null);
    try { await signOut({ redirectUrl: returnUrl }); }
    catch { setActionError("Couldn't switch accounts. Try again."); setSwitching(false); }
  };
  const preview = result.state === "available" || result.state === "joined" ? result : null;

  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <header>
        <SectionLabel>Trip invite</SectionLabel>
        <h1 className="mt-1 text-title font-semibold text-foreground md:text-title-lg">
          {result.state === "joined" ? "You've joined this trip" : result.state === "unavailable" ? "Invitation unavailable" : result.state === "failed" ? "Couldn't load invitation" : "You're invited"}
        </h1>
        {preview && <p className="mt-1 text-sm text-muted-foreground">
          {preview.organizer_name ?? "The organizer"} added you as &ldquo;{preview.invite.display_name}&rdquo;.
        </p>}
      </header>
      {result.state === "loading" && <Skeleton className="h-32 w-full rounded-card" />}
      {(result.state === "failed" || result.state === "unavailable") && <Card>
        <p role="alert" className="text-sm text-muted-foreground">{result.message}</p>
        {result.state === "unavailable" && <p className="mt-2 text-sm text-muted-foreground">Ask the organizer for a new link. If you already joined, sign in with the account you used or open My trips.</p>}
        {result.state === "failed" && <Button className="mt-3" variant="outline" onClick={() => { setResult({ state: "loading" }); setAttempt((n) => n + 1); }}>Try again</Button>}
      </Card>}
      {preview && <Card>
        <div className="flex items-center gap-3">
          <MapPin className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-foreground wrap-anywhere">{preview.trip.name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{formatDateRange(preview.trip.start_date, preview.trip.end_date)}</p>
          </div>
        </div>
      </Card>}
      {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      {result.state === "joined" && <Button asChild size="lg"><Link href={`/trips/${result.trip.id}/pack`}><CheckCircle2 />Open my pack list</Link></Button>}
      {result.state === "available" && account && <Button size="lg" onClick={accept} loading={accepting} disabled={switching}>Accept invitation</Button>}
      {account ? <div className="flex flex-col items-center gap-2">
        <p className="text-center text-sm text-muted-foreground wrap-anywhere">Signed in as <span className="text-foreground">{account}</span></p>
        <Button variant="outline" onClick={switchAccount} loading={switching} disabled={accepting}>Switch account</Button>
      </div> : result.state !== "loading" && <div className="flex flex-col gap-2">
        <Button asChild size="lg"><Link href={`/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`}>Sign in{result.state === "available" ? " to accept" : " to recover your trip"}</Link></Button>
        <Button asChild variant="outline"><Link href={`/sign-up?redirect_url=${encodeURIComponent(returnUrl)}`}>Or create an account</Link></Button>
      </div>}
      <Button asChild variant="ghost"><Link href="/trips">My trips</Link></Button>
    </div>
  );
}
