"use client";

import { use, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Trash2, UserPlus } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  InviteLinkButton,
  MemberAvatar,
  SectionLabel,
  sectionLabelClassName,
} from "@/components/trips/trip-primitives";
import { TripSheet, TripSheetDescription, TripSheetTitle } from "@/components/trips/TripSheet";
import { useReturnFocus } from "@/components/trips/useReturnFocus";
import { useTrip } from "@/hooks/useTrip";
import { errorMessage, tripRequest } from "@/lib/trip-requests";
import type { TripMember } from "@/types/trips";

const HEADING_ID = "manage-crew-heading";

/** The id of a member's Remove button, which takes focus back from the dialog. */
function removeButtonId(memberId: string) {
  return `remove-member-${memberId}`;
}

export default function ManageCrewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, refresh } = useTrip(id);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"invite" | "guest">("invite");
  // The dialog keeps its member while it closes, so it can animate out.
  const [confirming, setConfirming] = useState<{ member: TripMember; open: boolean } | null>(null);
  const [removing, setRemoving] = useState(false);
  const confirmFocus = useReturnFocus();
  // Set when a removal closes the dialog: that member's row is going away.
  const focusAfterRemoval = useRef<(() => HTMLElement | null) | null>(null);

  const openConfirm = (member: TripMember, opener: HTMLElement) => {
    // On iOS a tap leaves focus where it was, e.g. in Add member's name, and
    // that field shouldn't get focus back when the dialog closes.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== opener) active.blur();
    confirmFocus.remember(() => document.getElementById(removeButtonId(member.id)));
    setConfirming({ member, open: true });
  };

  const closeConfirm = () => setConfirming((prev) => prev && { ...prev, open: false });

  const handleConfirmCloseAutoFocus = (event: Event) => {
    const next = focusAfterRemoval.current;
    focusAfterRemoval.current = null;
    if (!next) {
      confirmFocus.restore(event);
      return;
    }
    event.preventDefault();
    confirmFocus.forget();
    next()?.focus();
  };

  const add = async () => {
    const displayName = name.trim();
    if (!displayName) return;
    setAdding(true);
    try {
      await tripRequest(`/api/v1/trips/${id}/members`, "POST", { display_name: displayName, kind });
      setName("");
      await refresh();
    } catch (err) {
      toast.error(`Couldn't add ${displayName}`, { description: errorMessage(err) });
    } finally {
      setAdding(false);
    }
  };

  const remove = async () => {
    if (!confirming) return;
    const { member } = confirming;
    // Focus moves on to the next member who can be removed, else the heading.
    const removable = data?.members.filter((m) => m.role !== "organizer") ?? [];
    const index = removable.findIndex((m) => m.id === member.id);
    const neighbor = removable[index + 1] ?? removable[index - 1];
    setRemoving(true);
    try {
      await tripRequest(`/api/v1/trips/${id}/members/${member.id}`, "DELETE");
      focusAfterRemoval.current = () =>
        (neighbor ? document.getElementById(removeButtonId(neighbor.id)) : null) ??
        document.getElementById(HEADING_ID);
      closeConfirm();
      await refresh();
    } catch (err) {
      // The dialog stays open, so the removal can be retried or cancelled.
      toast.error(`Couldn't remove ${member.display_name}`, {
        description: errorMessage(err),
      });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <PageLayout chromeVariant="compact">
      <div className="flex w-full max-w-2xl flex-col gap-5">
        <Link
          href={`/trips/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Trip
        </Link>
        <header>
          <SectionLabel>Trip settings</SectionLabel>
          <h1
            id={HEADING_ID}
            tabIndex={-1}
            className="mt-1 text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-white/94"
          >
            Manage crew
          </h1>
        </header>

        {loading && <Skeleton className="h-32 w-full rounded-2xl bg-white/12" />}
        {error && (
          <div className="rounded-xl border border-orange-400/35 bg-orange-300/10 px-4 py-3 text-sm text-orange-100">
            {error}
          </div>
        )}

        {data && (
          <>
            <div className="flex flex-col gap-2">
              {data.members.map((m) => (
                <Card key={m.id}>
                  <div className="flex items-center gap-3">
                    <MemberAvatar
                      name={m.display_name}
                      state={
                        m.role === "organizer"
                          ? "self"
                          : m.status === "guest"
                          ? "guest"
                          : m.status === "invited"
                          ? "invited"
                          : "default"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {m.display_name}
                      </p>
                      <p className="text-xs text-white/55">
                        {m.role} · {m.status === "left" ? "left" : m.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {m.status === "invited" && m.invite_token && (
                        <InviteLinkButton
                          token={m.invite_token}
                          recipientName={m.display_name}
                          tripName={data.trip.name}
                        />
                      )}
                      {m.role !== "organizer" && (
                        <button
                          type="button"
                          id={removeButtonId(m.id)}
                          onClick={(event) => openConfirm(m, event.currentTarget)}
                          className="inline-flex items-center gap-1 rounded-md border border-white/12 px-2.5 py-1.5 text-xs text-white/70 hover:border-orange-300/40 hover:bg-orange-300/10 hover:text-orange-50"
                          aria-label={`Remove ${m.display_name}`}
                        >
                          <Trash2 className="size-3.5" />
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <Card>
              <SectionLabel className="mb-2">Add member</SectionLabel>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Display name"
                  className="h-10 flex-1 rounded-lg border border-white/12 bg-white/[0.06] px-3 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={add}
                  disabled={!name.trim() || adding}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/14 bg-white/[0.08] px-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  {adding ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                  Add
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                {(["invite", "guest"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={
                      "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors " +
                      (kind === k
                        ? "border-cyan-300/55 bg-cyan-300/15 text-white"
                        : "border-white/14 bg-white/[0.05] text-white/72")
                    }
                  >
                    {k === "invite" ? "Send invite" : "Guest (no signup)"}
                  </button>
                ))}
              </div>
            </Card>

            <p className="text-center text-xs text-white/45">
              Removing someone also deletes their kits for this trip.
            </p>
            <div className="h-24" />
          </>
        )}

        {confirming && (
          <RemoveConfirmSheet
            member={confirming.member}
            open={confirming.open}
            removing={removing}
            onCancel={closeConfirm}
            onConfirm={remove}
            onCloseAutoFocus={handleConfirmCloseAutoFocus}
          />
        )}
      </div>
    </PageLayout>
  );
}

function RemoveConfirmSheet({
  member,
  open,
  removing,
  onCancel,
  onConfirm,
  onCloseAutoFocus,
}: {
  member: TripMember;
  open: boolean;
  removing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const sideEffects = [
    "delete their kits for this trip",
    "unassign their group gear",
    "drop them from roll call",
  ];

  return (
    <TripSheet
      open={open}
      onClose={onCancel}
      busy={removing}
      className="sm:max-w-md"
      // Start on Cancel, so Enter can't remove someone by accident.
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        cancelRef.current?.focus();
      }}
      onCloseAutoFocus={onCloseAutoFocus}
      header={
        <TripSheetTitle className={sectionLabelClassName}>
          Remove <span className="sr-only">{member.display_name} </span>from trip
        </TripSheetTitle>
      }
      footer={
        <>
          <Button
            type="button"
            onClick={onConfirm}
            loading={removing}
            className="rounded-xl border border-orange-300/45 bg-orange-300/22 text-white hover:bg-orange-300/30"
          >
            Remove {member.display_name}
          </Button>
          <Button
            ref={cancelRef}
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={removing}
            className="rounded-xl border border-white/14 font-normal text-white/80 hover:bg-white/10 hover:text-white"
          >
            Cancel
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-2xl border border-orange-400/35 bg-orange-300/10 px-3 py-3">
        <MemberAvatar name={member.display_name} size={40} />
        <div>
          <p className="text-base font-semibold text-white">{member.display_name}</p>
          <p className="text-xs text-white/65">{member.role} · {member.status}</p>
        </div>
      </div>
      <TripSheetDescription asChild>
        <div className="mt-4">
          <p>Removing {member.display_name} will:</p>
          <ul className="mt-2 space-y-1.5">
            {sideEffects.map((t) => (
              <li key={t} className="flex gap-2 text-xs text-white/75">
                <span aria-hidden="true" className="text-cyan-300">·</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </TripSheetDescription>
    </TripSheet>
  );
}
