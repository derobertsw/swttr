"use client";

import { use, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
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
import { errorMessage, timedTripRequest } from "@/lib/trip-requests";
import { SharedGearList } from "@/components/trips/SharedGear";
import { useUserId } from "@/hooks/useUserId";

export default function GroupGearPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, reload } = useTrip(id);
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const userId = useUserId();
  const organizer = data?.trip.owner_user_id === userId;
  const members = data?.members ?? [];
  const me = members.find((m) => m.user_id === userId && m.status === "joined");
  const creation = useRef<{ name: string; assignee: string; id: string } | null>(null);

  const addGear = async () => {
    const item = description.trim();
    if (!item) return;
    if (adding) return;
    if (creation.current?.name !== item || creation.current?.assignee !== assignee) {
      creation.current = { name: item, assignee, id: crypto.randomUUID() };
    }
    setAdding(true);
    try {
      await timedTripRequest(`/api/v1/trips/${id}/gear`, "POST", {
        id: creation.current.id,
        description: item,
        assignee_member_id: assignee || (organizer ? null : me?.id),
      });
      setDescription("");
      setAssignee("");
      creation.current = null;
      await reload();
    } catch (err) {
      // The form keeps the item and who's bringing it, so Add can be tried again.
      toast.error(`Couldn't add ${item}`, { description: errorMessage(err) });
    } finally {
      setAdding(false);
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
          <p className="mt-2 text-sm text-muted-foreground">Assignment asks someone to bring an item. Acceptance and packing are confirmed separately.</p>
          <Button variant="outline" className="mt-3" onClick={() => void reload()}>Refresh shared gear</Button>
        </header>

        {loading && <Skeleton className="h-32 w-full rounded-card" />}
        {error && <TripError>{error}<Button variant="outline" onClick={() => void reload()}>Reload shared gear</Button></TripError>}

        {data && (
          <>
            <div className="flex flex-col gap-2">
              {data.gear.length === 0 && (
                <Card>
                  <p className="text-sm text-muted-foreground">No group gear yet.</p>
                </Card>
              )}
              <SharedGearList tripId={id} gear={data.gear} members={members} userId={userId}
                ownerId={data.trip.owner_user_id} onSaved={reload} />
            </div>

            {(organizer || me) && <Card>
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
                  maxLength={200}
                  className="sm:flex-1"
                />
                <select
                  value={assignee || (organizer ? "" : me?.id ?? "")}
                  onChange={(e) => setAssignee(e.target.value)}
                  aria-label="Who's bringing it"
                  className={cn(fieldClassName, "sm:w-auto")}
                >
                  {organizer && <option value="">unassigned</option>}
                  {members
                    .filter((m) => m.status !== "left" && (organizer || m.id === me?.id))
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
            </Card>}

            <div className="h-24" />
          </>
        )}
      </div>
    </PageLayout>
  );
}
