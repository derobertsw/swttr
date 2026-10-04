"use client";

import { use, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { segmentedGroupClassName, segmentedItemClassName } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BackLink,
  InviteLinkButton,
  MemberAvatar,
  SectionLabel,
  TripError,
  sectionLabelClassName,
} from "@/components/trips/trip-primitives";
import { cn } from "@/lib/utils";
import { TripSheet, TripSheetDescription, TripSheetTitle } from "@/components/trips/TripSheet";
import { useReturnFocus } from "@/hooks/useReturnFocus";
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

  const openConfirm = (member: TripMember) => {
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
        <BackLink href={`/trips/${id}`}>Trip</BackLink>
        <header>
          <SectionLabel>Trip settings</SectionLabel>
          <h1
            id={HEADING_ID}
            tabIndex={-1}
            className="mt-1 text-title font-semibold text-foreground md:text-title-lg"
          >
            Manage crew
          </h1>
        </header>

        {loading && <Skeleton className="h-32 w-full rounded-card" />}
        {error && <TripError>{error}</TripError>}

        {data && (
          <>
            <div className="flex flex-col gap-2">
              {data.members.map((m) => (
                <Card key={m.id}>
                  <div className="flex flex-wrap items-center gap-3">
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
                    <div className="min-w-32 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {m.display_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.role} · {m.status === "left" ? "left" : m.status}
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      {m.status === "invited" && m.invite_token && (
                        <InviteLinkButton
                          token={m.invite_token}
                          recipientName={m.display_name}
                          tripName={data.trip.name}
                        />
                      )}
                      {m.role !== "organizer" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          id={removeButtonId(m.id)}
                          onClick={() => openConfirm(m)}
                          aria-label={`Remove ${m.display_name}`}
                        >
                          <Trash2 />
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <Card>
              <label htmlFor="add-member-name" className={cn(sectionLabelClassName, "mb-2 block")}>
                Add member
              </label>
              <div className="flex gap-2">
                <Input
                  id="add-member-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Display name"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={add}
                  disabled={!name.trim() || adding}
                >
                  {adding ? <Loader2 className="animate-spin" /> : <UserPlus />}
                  Add
                </Button>
              </div>
              <div
                role="group"
                aria-label="How they join"
                className={cn(segmentedGroupClassName, "mt-3 grid-cols-2")}
              >
                {(["invite", "guest"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    aria-pressed={kind === k}
                    className={segmentedItemClassName}
                  >
                    {k === "invite" ? "Send invite" : "Guest (no signup)"}
                  </button>
                ))}
              </div>
            </Card>

            <p className="text-center text-sm text-muted-foreground">
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
        <TripSheetTitle>
          Remove <span className="sr-only">{member.display_name} </span>from trip
        </TripSheetTitle>
      }
      footer={
        <>
          <Button type="button" variant="destructive" onClick={onConfirm} loading={removing}>
            Remove {member.display_name}
          </Button>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={removing}
          >
            Cancel
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-control bg-muted p-3">
        <MemberAvatar name={member.display_name} size={40} />
        <div>
          <p className="text-base font-semibold text-foreground">{member.display_name}</p>
          <p className="text-xs text-muted-foreground">{member.role} · {member.status}</p>
        </div>
      </div>
      <TripSheetDescription asChild>
        <div className="mt-4">
          <p>Removing {member.display_name} will:</p>
          <ul className="mt-2 space-y-1.5">
            {sideEffects.map((t) => (
              <li key={t} className="flex gap-2">
                <span aria-hidden="true">·</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </TripSheetDescription>
    </TripSheet>
  );
}
