"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignedIn, SignedOut, SignInButton, SignUpButton, useAuth } from "@clerk/nextjs";
import { CheckCircle2, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import PageLayout from "@/components/PageLayout";
import { Card, SectionLabel, daysBetween, formatDateRange } from "@/components/trips/trip-primitives";
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
          <h1 className="mt-1 text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-white/94">
            You&apos;re invited
          </h1>
          {preview?.organizer_name && (
            <p className="mt-1 text-sm text-white/62">
              {preview.organizer_name} added you as &ldquo;{preview.invite.display_name}&rdquo;.
            </p>
          )}
        </header>

        {error && (
          <Card>
            <p className="text-sm text-orange-100">{error}</p>
            <Link
              href="/"
              className="mt-3 inline-flex h-10 items-center justify-center rounded-xl border border-white/14 px-4 text-sm font-medium text-white/85 hover:bg-white/10"
            >
              Back home
            </Link>
          </Card>
        )}

        {!preview && !error && <Skeleton className="h-32 w-full rounded-2xl bg-white/12" />}

        {preview && (
          <>
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-white/14 bg-white/[0.06]">
                  <MapPin className="size-5 text-white/72" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-white/95">
                    {preview.trip.name}
                  </p>
                  <p className="mt-0.5 text-xs text-white/62">
                    {formatDateRange(preview.trip.start_date, preview.trip.end_date)} ·{" "}
                    {daysBetween(preview.trip.start_date, preview.trip.end_date)} days
                  </p>
                </div>
              </div>
            </Card>

            {!isLoaded ? (
              <Skeleton className="h-11 w-full rounded-xl bg-white/12" />
            ) : (
              <>
                <SignedIn>
                  <button
                    type="button"
                    onClick={accept}
                    disabled={accepting}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-gradient-to-b from-cyan-300/22 to-cyan-300/10 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(0,0,0,0.32)] disabled:opacity-60"
                  >
                    {accepting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Accept invitation
                  </button>
                  <p className="text-center text-xs text-white/55">
                    Signed in as <span className="text-white/75">{userId?.slice(0, 6)}…</span>
                  </p>
                </SignedIn>
                <SignedOut>
                  <div className="flex flex-col gap-2">
                    <SignInButton mode="modal" forceRedirectUrl={returnUrl}>
                      <button
                        type="button"
                        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-gradient-to-b from-cyan-300/22 to-cyan-300/10 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(0,0,0,0.32)]"
                      >
                        Sign in to accept
                      </button>
                    </SignInButton>
                    <SignUpButton mode="modal" forceRedirectUrl={returnUrl}>
                      <button
                        type="button"
                        className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-white/14 text-sm text-white/80 hover:bg-white/10"
                      >
                        Or create an account
                      </button>
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
