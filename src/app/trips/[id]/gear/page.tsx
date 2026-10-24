"use client";

import { use, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, fieldClassName } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SectionLabel,
  TripError,
  sectionLabelClassName,
} from "@/components/trips/trip-primitives";
import { cn } from "@/lib/utils";
import { useTrip } from "@/hooks/useTrip";
import { errorMessage, timedTripRequest } from "@/lib/trip-requests";
import { SharedGearList } from "@/components/trips/SharedGear";
import { PackingNav } from "@/components/trips/PackingNav";
import { useUserId } from "@/hooks/useUserId";

export default function GroupGearPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, reload } = useTrip(id);
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [addRecovery, setAddRecovery] = useState<string | null>(null);
  const userId = useUserId();
  const organizer = data?.trip.owner_user_id === userId;
  const members = data?.members ?? [];
  const me = members.find((m) => m.user_id === userId && m.status === "joined");
  const creation = useRef<{ name: string; assignee: string; id: string } | null>(null);
  // The Day checklist links to an item, like #shared-<id>. Cold links resolve
  // before the list renders, so the item is scrolled to once it's there.
  const restoredHash = useRef(false);
  useEffect(() => {
    if (restoredHash.current || !data || !window.location.hash) return;
    const target = document.getElementById(window.location.hash.slice(1));
    if (!target) return;
    restoredHash.current = true;
    target.scrollIntoView({ block: "start", behavior: "instant" });
  }, [data]);

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
      if (!await reload()) {
        setAddRecovery(`${item} was saved, but the latest list couldn't be loaded. Reload shared gear to confirm it before adding another item.`);
        return;
      }
      setDescription("");
      setAssignee("");
      creation.current = null;
    } catch (err) {
      // The form keeps the item and who's bringing it, so Add can be tried again.
      toast.error(`Couldn't add ${item}`, { description: errorMessage(err) });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex w-full max-w-3xl flex-col gap-8">
      <PackingNav tripId={id} current="shared" />
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
            {data.gear.length === 0 && <p className="text-sm text-muted-foreground">No group gear yet.</p>}
            <SharedGearList tripId={id} gear={data.gear} members={members} userId={userId}
              ownerId={data.trip.owner_user_id} onSaved={reload} />
          </div>

          {(organizer || me) && <div>
            <label htmlFor="add-gear-description" className={cn(sectionLabelClassName, "mb-2 block")}>
              Add gear
            </label>
            {addRecovery && <div role="alert" className="mb-3 break-words text-sm">
              <p>{addRecovery}</p>
              <Button variant="outline" className="mt-2" loading={adding} onClick={async () => {
                if (adding) return;
                setAdding(true);
                try {
                  if (await reload()) {
                    setAddRecovery(null); setDescription(""); setAssignee(""); creation.current = null;
                  }
                } finally { setAdding(false); }
              }}>Reload added item</Button>
            </div>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="add-gear-description"
                type="text"
                disabled={adding || !!addRecovery}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tent, stove, first aid…"
                maxLength={200}
                className="sm:flex-1"
              />
              <select
                disabled={adding || !!addRecovery}
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
                disabled={!description.trim() || adding || !!addRecovery}
              >
                {adding ? <Loader2 className="animate-spin" /> : <Plus />}
                Add
              </Button>
            </div>
          </div>}

          <div className="h-24" />
        </>
      )}
    </div>
  );
}
