"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignedIn, SignedOut, SignInButton, SignUpButton, useAuth } from "@clerk/nextjs";
import { CheckCircle2, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import PageLayout from "@/components/PageLayout";
import { SectionLabel, daysBetween, formatDateRange } from "@/components/trips/trip-primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface InvitePreview {
  invite: { display_name: string; status: string };
  trip: { id: string; name: string; start_date: string; end_date: string };
  organizer_name: string | null;
}

export default function InviteLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { isLoaded, userId } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const returnUrl =
    typeof window !== "undefined" ? `${window.location.pathname}` : `/trips/invite/${token}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/trips/invite/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Invite unavailable (${res.status})`);
        }
        return res.json();
      })
      .then((data: InvitePreview) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    try {
      const res = await fetch(`/api/v1/trips/invite/${token}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Could not accept (${res.status})`);
      }
      const data = (await res.json()) as { trip_id: string; already_joined: boolean };
      toast.success(data.already_joined ? "You were already on this trip" : "You joined the trip");
      router.push(`/trips/${data.trip_id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to accept");
      setAccepting(false);
    }
  };

  return (
    <PageLayout chromeVariant="compact">
      <div className="flex w-full max-w-md flex-col gap-5">
        <header>
          <SectionLabel>Trip invite</SectionLabel>
          <h1 className="mt-1 text-title font-semibold text-foreground md:text-title-lg">
            You&apos;re invited
          </h1>
          {preview?.organizer_name && (
            <p className="mt-1 text-sm text-muted-foreground">
              {preview.organizer_name} added you as &ldquo;{preview.invite.display_name}&rdquo;.
            </p>
          )}
        </header>

        {error && (
          <Card>
            <p className="text-sm font-medium text-destructive">{error}</p>
            <Button asChild variant="outline" className="mt-3">
              <Link href="/">Back home</Link>
            </Button>
          </Card>
        )}

        {!preview && !error && <Skeleton className="h-32 w-full rounded-card" />}

        {preview && (
          <>
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-control bg-muted">
                  <MapPin className="size-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-foreground">
                    {preview.trip.name}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {formatDateRange(preview.trip.start_date, preview.trip.end_date)} ·{" "}
                    {daysBetween(preview.trip.start_date, preview.trip.end_date)} days
                  </p>
                </div>
              </div>
            </Card>

            {!isLoaded ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <>
                <SignedIn>
                  <Button
                    type="button"
                    size="lg"
                    onClick={accept}
                    disabled={accepting}
                    className="w-full"
                  >
                    {accepting ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    Accept invitation
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Signed in as <span className="text-foreground">{userId?.slice(0, 6)}…</span>
                  </p>
                </SignedIn>
                <SignedOut>
                  <div className="flex flex-col gap-2">
                    <SignInButton mode="modal" forceRedirectUrl={returnUrl}>
                      <Button type="button" size="lg" className="w-full">
                        Sign in to accept
                      </Button>
                    </SignInButton>
                    <SignUpButton mode="modal" forceRedirectUrl={returnUrl}>
                      <Button type="button" variant="outline" className="w-full">
                        Or create an account
                      </Button>
                    </SignUpButton>
                  </div>
                </SignedOut>
              </>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}
