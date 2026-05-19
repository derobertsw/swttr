"use client";

import { use, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Loader2, Plus, X } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, SectionLabel } from "@/components/trips/trip-primitives";
import { useTrip } from "@/hooks/useTrip";

export default function GroupGearPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, refresh } = useTrip(id);
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [adding, setAdding] = useState(false);

  const members = data?.members ?? [];

  const addGear = async () => {
    if (!description.trim()) return;
    setAdding(true);
    try {
      await fetch(`/api/v1/trips/${id}/gear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          assignee_member_id: assignee || null,
        }),
      });
      setDescription("");
      setAssignee("");
      await refresh();
    } finally {
      setAdding(false);
    }
  };

  const updateAssignee = async (gearId: string, memberId: string | null) => {
    await fetch(`/api/v1/trips/${id}/gear/${gearId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee_member_id: memberId }),
    });
    await refresh();
  };

  const remove = async (gearId: string) => {
    await fetch(`/api/v1/trips/${id}/gear/${gearId}`, { method: "DELETE" });
    await refresh();
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
          <SectionLabel>Shared gear</SectionLabel>
          <h1 className="mt-1 text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-white/94">
            Who&apos;s bringing what?
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
              {data.gear.length === 0 && (
                <Card>
                  <p className="text-sm text-white/65">No group gear yet.</p>
                </Card>
              )}
              {data.gear.map((g) => {
                const assigned = g.assignee_member_id
                  ? members.find((m) => m.id === g.assignee_member_id)?.display_name
                  : null;
                return (
                  <Card key={g.id} highlighted={!assigned}>
                    <div className="flex items-center gap-3">
                      <p className="flex-1 truncate text-sm text-white/90">{g.description}</p>
                      <select
                        value={g.assignee_member_id ?? ""}
                        onChange={(e) =>
                          updateAssignee(g.id, e.target.value === "" ? null : e.target.value)
                        }
                        className="rounded-md border border-white/14 bg-white/[0.06] px-2 py-1 text-xs text-white"
                      >
                        <option value="">unassigned</option>
                        {members
                          .filter((m) => m.status !== "left")
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.display_name}
                            </option>
                          ))}
                      </select>
                      {!assigned && (
                        <AlertTriangle className="size-4 text-orange-300" aria-label="Unassigned" />
                      )}
                      <button
                        type="button"
                        onClick={() => remove(g.id)}
                        aria-label="Remove gear"
                        className="rounded-md p-1 text-white/55 hover:bg-white/10 hover:text-white"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>

            <Card>
              <SectionLabel className="mb-2">Add gear</SectionLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tent, stove, first aid…"
                  className="h-10 flex-1 rounded-lg border border-white/12 bg-white/[0.06] px-3 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
                />
                <select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="h-10 rounded-lg border border-white/12 bg-white/[0.06] px-2 text-sm text-white"
                >
                  <option value="">unassigned</option>
                  {members
                    .filter((m) => m.status !== "left")
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={addGear}
                  disabled={!description.trim() || adding}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/14 bg-white/[0.08] px-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Add
                </button>
              </div>
            </Card>

            <div className="h-24" />
          </>
        )}
      </div>
    </PageLayout>
  );
}
