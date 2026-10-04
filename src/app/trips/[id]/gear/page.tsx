"use client";

import { use, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, X } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, fieldClassName } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BackLink,
  SectionLabel,
  TripError,
  sectionLabelClassName,
} from "@/components/trips/trip-primitives";
import { cn } from "@/lib/utils";
import { useTrip } from "@/hooks/useTrip";
import { errorMessage, tripRequest } from "@/lib/trip-requests";
import type { TripGroupGear } from "@/types/trips";

export default function GroupGearPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, refresh } = useTrip(id);
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [adding, setAdding] = useState(false);
  // The gear row whose change is being saved. Every row stays disabled until
  // that save and the reload after it finish, so saves never overlap.
  const [savingId, setSavingId] = useState<string | null>(null);

  const members = data?.members ?? [];

  const addGear = async () => {
    const item = description.trim();
    if (!item) return;
    setAdding(true);
    try {
      await tripRequest(`/api/v1/trips/${id}/gear`, "POST", {
        description: item,
        assignee_member_id: assignee || null,
      });
      setDescription("");
      setAssignee("");
      await refresh();
    } catch (err) {
      // The form keeps the item and who's bringing it, so Add can be tried again.
      toast.error(`Couldn't add ${item}`, { description: errorMessage(err) });
    } finally {
      setAdding(false);
    }
  };

  const updateAssignee = async (gear: TripGroupGear, memberId: string | null) => {
    setSavingId(gear.id);
    try {
      await tripRequest(`/api/v1/trips/${id}/gear/${gear.id}`, "PATCH", {
        assignee_member_id: memberId,
      });
      await refresh();
    } catch (err) {
      toast.error(`Couldn't change who's bringing ${gear.description}`, {
        description: errorMessage(err),
      });
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (gear: TripGroupGear) => {
    setSavingId(gear.id);
    try {
      await tripRequest(`/api/v1/trips/${id}/gear/${gear.id}`, "DELETE");
      await refresh();
    } catch (err) {
      toast.error(`Couldn't remove ${gear.description}`, { description: errorMessage(err) });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <PageLayout chromeVariant="compact">
      <div className="flex w-full max-w-2xl flex-col gap-5">
        <BackLink href={`/trips/${id}`}>Trip</BackLink>
        <header>
          <SectionLabel>Shared gear</SectionLabel>
          <h1 className="mt-1 text-title font-semibold text-foreground md:text-title-lg">
            Who&apos;s bringing what?
          </h1>
        </header>

        {loading && <Skeleton className="h-32 w-full rounded-card" />}
        {error && <TripError>{error}</TripError>}

        {data && (
          <>
            <div className="flex flex-col gap-2">
              {data.gear.length === 0 && (
                <Card>
                  <p className="text-sm text-muted-foreground">No group gear yet.</p>
                </Card>
              )}
              {data.gear.map((g) => {
                const assigned = g.assignee_member_id
                  ? members.find((m) => m.id === g.assignee_member_id)?.display_name
                  : null;
                const saving = savingId === g.id;
                return (
                  <Card key={g.id} className={cn(!assigned && "border-warning")}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <p className="min-w-32 flex-1 break-words text-sm text-foreground">{g.description}</p>
                      <div className="ml-auto flex items-center gap-2">
                        {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                        <select
                          value={g.assignee_member_id ?? ""}
                          onChange={(e) =>
                            updateAssignee(g, e.target.value === "" ? null : e.target.value)
                          }
                          disabled={savingId !== null}
                          aria-label={`Who's bringing ${g.description}`}
                          className={cn(fieldClassName, "h-9 w-auto max-w-40 px-2 max-md:h-11 pointer-coarse:h-11")}
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
                          <AlertTriangle className="size-4 shrink-0 text-warning" aria-label="Unassigned" />
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => remove(g)}
                          disabled={savingId !== null}
                          aria-label={`Remove ${g.description}`}
                        >
                          <X />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            <Card>
              <label htmlFor="add-gear-description" className={cn(sectionLabelClassName, "mb-2 block")}>
                Add gear
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="add-gear-description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tent, stove, first aid…"
                  className="sm:flex-1"
                />
                <select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  aria-label="Who's bringing it"
                  className={cn(fieldClassName, "sm:w-auto")}
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
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addGear}
                  disabled={!description.trim() || adding}
                >
                  {adding ? <Loader2 className="animate-spin" /> : <Plus />}
                  Add
                </Button>
              </div>
            </Card>

            <div className="h-24" />
          </>
        )}
      </div>
    </PageLayout>
  );
}
