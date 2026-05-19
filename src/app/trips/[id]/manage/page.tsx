"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Trash2, UserPlus, X } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  InviteLinkButton,
  MemberAvatar,
  SectionLabel,
} from "@/components/trips/trip-primitives";
import { useTrip } from "@/hooks/useTrip";
import type { TripMember } from "@/types/trips";

export default function ManageCrewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, refresh } = useTrip(id);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"invite" | "guest">("invite");
  const [confirming, setConfirming] = useState<TripMember | null>(null);
  const [removing, setRemoving] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setAdding(true);
    try {
      await fetch(`/api/v1/trips/${id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: name.trim(), kind }),
      });
      setName("");
      await refresh();
    } finally {
      setAdding(false);
    }
  };

  const remove = async () => {
    if (!confirming) return;
    setRemoving(true);
    try {
      await fetch(`/api/v1/trips/${id}/members/${confirming.id}`, { method: "DELETE" });
      setConfirming(null);
      await refresh();
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
          <h1 className="mt-1 text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-white/94">
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
                          onClick={() => setConfirming(m)}
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
              Removing a member soft-deletes them. They keep their kit drafts on their device.
            </p>
            <div className="h-24" />
          </>
        )}

        {confirming && (
          <RemoveConfirmModal
            member={confirming}
            removing={removing}
            onCancel={() => setConfirming(null)}
            onConfirm={remove}
          />
        )}
      </div>
    </PageLayout>
  );
}

function RemoveConfirmModal({
  member,
  removing,
  onCancel,
  onConfirm,
}: {
  member: TripMember;
  removing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const sideEffects = [
    "unassign their group gear",
    "drop them from roll call",
    "keep their kit drafts on their device",
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !removing) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, removing]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Remove ${member.display_name} from trip`}
      onClick={() => !removing && onCancel()}
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/55 backdrop-blur-sm sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-t-3xl border border-white/14 bg-slate-950/95 p-5 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:rounded-3xl sm:pb-5"
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1.5 text-white/55 hover:bg-white/10 hover:text-white"
        >
          <X className="size-5" />
        </button>
        <SectionLabel>Remove from trip</SectionLabel>
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-orange-400/35 bg-orange-300/10 px-3 py-3">
          <MemberAvatar name={member.display_name} size={40} />
          <div>
            <p className="text-base font-semibold text-white">{member.display_name}</p>
            <p className="text-xs text-white/65">{member.role} · {member.status}</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-white/85">Removing {member.display_name} will:</p>
        <ul className="mt-2 space-y-1.5">
          {sideEffects.map((t) => (
            <li key={t} className="flex gap-2 text-xs text-white/75">
              <span className="text-cyan-300">·</span>
              {t}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={removing}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-orange-300/45 bg-orange-300/22 text-sm font-semibold text-white disabled:opacity-50"
          >
            {removing && <Loader2 className="size-4 animate-spin" />}
            Remove {member.display_name}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={removing}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/14 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
