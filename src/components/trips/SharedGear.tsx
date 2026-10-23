"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fieldClassName } from "@/components/ui/input";
import { errorMessage, timedTripRequest } from "@/lib/trip-requests";
import type { TripGroupGear, TripMember } from "@/types/trips";

export function SharedGearList({ tripId, gear, members = [], userId, ownerId, onSaved, personal = false }: {
  tripId: string; gear: TripGroupGear[]; members?: TripMember[]; userId: string | null;
  ownerId?: string; onSaved: () => Promise<unknown>; personal?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const saving = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const organizer = !!userId && userId === ownerId;
  const me = members.find((m) => m.user_id === userId && m.status === "joined");
  async function change(item: TripGroupGear, action: string, assignee?: string | null) {
    if (saving.current || failure) return;
    saving.current = true;
    setBusy(item.id);
    setNotice("");
    try {
      await timedTripRequest(`/api/v1/trips/${tripId}/gear/${item.id}`, action === "delete" ? "DELETE" : "PATCH", {
        action, expected_revision: item.revision,
        ...(action === "assign" ? { assignee_member_id: assignee } : {}),
      });
      setNotice(`${item.description}: ${action === "pack" ? "marked packed" : action === "decline" ? "declined; needs someone to bring it" : "saved"}.`);
      // Parent refresh must reject on failure to avoid enabling old controls.
      const loaded = await onSaved();
      if (loaded === false) throw new Error("Saved, but the latest list couldn't be loaded.");
      // Acceptance replaces its button; decline/removal can remove the row.
      // Restore focus only when that change left it on the document body.
      window.setTimeout(() => {
        if (document.activeElement !== document.body) return;
        const row = document.getElementById(`shared-${item.id}`);
        const next = row?.querySelector<HTMLElement>("button:not([disabled]), select:not([disabled])");
        (next ?? root.current)?.focus();
      }, 0);
    } catch (err) {
      const message = errorMessage(err);
      setFailure(`${message} Reload the list to check its current state before trying again.`);
      toast.error(action === "assign" ? `Couldn't change who's bringing ${item.description}`
        : action === "delete" ? `Couldn't remove ${item.description}` : `Couldn't confirm ${item.description}`, { description: message });
    } finally { saving.current = false; setBusy(null); }
  }
  return <div ref={root} tabIndex={-1} aria-label="Shared gear list" className="flex flex-col gap-3 focus-visible:outline-2 focus-visible:outline-ring">
    {failure && <div role="alert" className="break-words rounded-lg border border-warning p-3 text-sm">
      <p>{failure}</p>
      <Button className="mt-2" variant="outline" aria-disabled={busy !== null || undefined} onClick={async () => {
        if (saving.current) return;
        saving.current = true; setBusy("reload");
        try { if (await onSaved() !== false) setFailure(null); }
        catch { /* Keep the recovery path visible. */ }
        finally { saving.current = false; setBusy(null); }
      }}>Reload shared gear</Button>
    </div>}
    {notice && <p role="status" className="break-words text-sm text-muted-foreground">{notice}</p>}
    <div className="divide-y divide-border border-y border-border empty:border-y-0">
      {gear.map((item) => {
        const recipient = members.find((m) => m.id === item.assignee_member_id);
        const guest = recipient?.status === "guest" && recipient.role === "guest" && !recipient.user_id;
        const canConfirm = personal || (!!me && item.assignee_member_id === me.id) || (organizer && guest);
        const canAssign = organizer || (!!me && (!item.assignee_member_id || item.assignee_member_id === me.id));
        const blocked = busy !== null || !!failure || !item.revision;
        const latest = item.events?.at(-1);
        const state = !item.assignee_member_id ? "Unassigned" : item.packed_at ? "Packed" : item.accepted_at ? "Accepted · not packed" : "Awaiting acceptance";
        return <div key={item.id} id={`shared-${item.id}`} className="min-w-0 scroll-mt-20 py-3">
          <p className="break-words text-base font-medium">{item.description}</p>
          <p className="mt-1 text-sm text-muted-foreground">{state}{recipient ? ` · ${recipient.display_name}` : ""}</p>
          {!item.assignee_member_id && latest?.action === "decline" && <p className="mt-1 text-sm">Declined. Choose someone else to bring it.</p>}
          {!item.assignee_member_id && latest?.action === "member_removed" && <p className="mt-1 text-sm">Previous recipient left the crew. Assign this again.</p>}
          {!item.revision && <p className="text-sm">Shared confirmation is unavailable. Reload after the shared gear update is installed.</p>}
          {canConfirm && item.assignee_member_id && !item.accepted_at && <p className="mt-2 break-words text-sm">{guest ? `Can ${recipient?.display_name} bring ${item.description}?` : `Can you bring ${item.description}?`}</p>}
          {guest && organizer && <p className="mt-1 break-words text-sm text-muted-foreground">You confirm on behalf of {recipient?.display_name}. Your account is recorded as the actor.</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-busy={busy === item.id || undefined}>
            {!personal && canAssign && <select value={item.assignee_member_id ?? ""}
              aria-label={`Who's bringing ${item.description}`} disabled={blocked}
              className={`${fieldClassName} min-h-11 w-full sm:w-auto sm:max-w-64`}
              onChange={(e) => void change(item, "assign", e.target.value || null)}>
              <option value="" disabled={!organizer}>unassigned</option>
              {members.filter((m) => m.status !== "left" && (organizer || m.id === me?.id)).map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
            </select>}
            {canConfirm && item.assignee_member_id && <>
              {!item.accepted_at ? <>
                <Button variant="secondary" aria-label={`Accept ${item.description}`} aria-disabled={blocked || undefined} onClick={() => { if (!blocked) void change(item, "accept"); }}>Accept</Button>
                <Button variant="outline" aria-label={`Decline ${item.description}`} aria-disabled={blocked || undefined} onClick={() => { if (!blocked) void change(item, "decline"); }}>Decline</Button>
              </> : <>
                <Button variant="secondary" aria-label={`${item.packed_at ? "Mark not packed" : "Mark packed"} ${item.description}`} aria-disabled={blocked || undefined} onClick={() => { if (!blocked) void change(item, item.packed_at ? "unpack" : "pack"); }}>{item.packed_at ? "Mark not packed" : "Mark packed"}</Button>
                <Button variant="outline" aria-label={`Can’t bring ${item.description}`} aria-disabled={blocked || undefined} onClick={() => { if (!blocked) void change(item, "decline"); }}>Can’t bring</Button>
              </>}
            </>}
            {!personal && organizer && <Button variant="ghost" disabled={blocked} onClick={() => void change(item, "delete")} aria-label={`Remove ${item.description}`}>Remove</Button>}
          </div>
          {item.accepted_at && <p className="mt-2 break-words text-sm text-muted-foreground">Accepted by {members.find((m) => m.user_id === item.accepted_by)?.display_name ?? (personal ? "you" : "a former crew member")} · {new Date(item.accepted_at).toLocaleString()}</p>}
          {item.packed_at && <p className="mt-1 break-words text-sm text-muted-foreground">Packed by {members.find((m) => m.user_id === item.packed_by)?.display_name ?? (personal ? "you" : "a former crew member")} · {new Date(item.packed_at).toLocaleString()}</p>}
        </div>;
      })}
    </div>
  </div>;
}

/** Surface specific unresolved items; acceptance never implies packed or Ready. */
export function SharedGearAttention({ tripId, gear }: { tripId: string; gear: TripGroupGear[] }) {
  const unresolved = gear.filter((g) => !g.assignee_member_id || !g.accepted_at);
  if (!unresolved.length) return null;
  return <section><h2 className="text-base font-semibold">Shared gear needs attention</h2>
    <ul className="mt-2 space-y-2">{unresolved.map((g) => <li key={g.id} className="break-words text-sm">
      {g.description} · {g.assignee_member_id ? "Awaiting acceptance" : "Unassigned"}{" "}
      <Link className="inline-flex min-h-11 items-center font-semibold text-primary underline" href={`/trips/${tripId}/gear#shared-${g.id}`}>{g.assignee_member_id ? "View request" : "View item"}</Link>
    </li>)}</ul>
  </section>;
}
