import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SharedGearAttention, SharedGearList } from "./SharedGear";
import { ORGANIZER, SAM, TRIP, fakeTripApi, reply, sentBodies } from "@/test/tripApi";
import type { TripGroupGear, TripMember } from "@/types/trips";
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const ana: TripMember = { ...SAM, user_id: "ana", status: "joined" };
const guest: TripMember = { ...SAM, role: "guest", status: "guest" };
const item: TripGroupGear = { id: "stove", trip_id: TRIP.id, description: "Stove", assignee_member_id: ana.id, sort_order: 0, created_at: TRIP.created_at, revision: "first" };
const route = "PATCH /api/v1/trips/trip-1/gear/stove";
afterEach(() => { vi.unstubAllGlobals(); });

function Harness({ user = "ana", member = ana, initial = item }: { user?: string; member?: TripMember; initial?: TripGroupGear }) {
  const [g, setG] = useState(initial);
  return <SharedGearList tripId={TRIP.id} gear={[g]} members={[ORGANIZER, member]} ownerId="user-1" userId={user}
    onSaved={async () => { const res = await fetch("/current"); if (!res.ok) return false; setG(await res.json()); return true; }} />;
}

describe("Shared equipment controls", () => {
  it("uses keyboard to accept, pack and unpack, and shows confirmed state after a second mount", async () => {
    let current = item;
    const api = fakeTripApi({ [route]: (body) => {
      const action = (body as { action: string }).action;
      current = { ...current, revision: `${current.revision}+`, accepted_at: "2026-10-18T12:00:00Z", accepted_by: "ana",
        packed_at: action === "pack" ? "2026-10-18T12:01:00Z" : null, packed_by: action === "pack" ? "ana" : null };
      return reply(200, { gear: current });
    }, "GET /current": () => reply(200, current) });
    vi.stubGlobal("fetch", api);
    const view = render(<Harness />);
    const user = userEvent.setup();
    expect(screen.getByText("Awaiting acceptance · Sam")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark packed Stove" })).not.toBeInTheDocument();
    screen.getByRole("button", { name: "Accept Stove" }).focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("button", { name: "Mark packed Stove" }));
    expect(await screen.findByText("Packed · Sam")).toBeInTheDocument();
    expect(sentBodies(api, route)[1]).toEqual({ action: "pack", expected_revision: "first+" });
    view.unmount();
    render(<Harness initial={current} />);
    expect(screen.getByText("Packed · Sam")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark not packed Stove" }));
    expect(await screen.findByText("Accepted · not packed · Sam")).toBeInTheDocument();
  });

  it("keeps the last confirmed state on a save failure, requiring reload before a deliberate retry", async () => {
    const api = fakeTripApi({ [route]: reply(500, { error: "Offline" }), "GET /current": reply(200, item) });
    vi.stubGlobal("fetch", api);
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Accept Stove" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
    expect(screen.getByText("Awaiting acceptance · Sam")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accept Stove" }));
    expect(sentBodies(api, route)).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Reload shared gear" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Decline Stove" }));
    expect(sentBodies(api, route)[1]).toMatchObject({ action: "decline", expected_revision: "first" });
  });

  it("requires a reload after a conflict, showing the new recipient and hiding the former recipient's controls", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [route]: reply(409, { error: "Item reassigned" }), "GET /current": reply(200, { ...item, assignee_member_id: ORGANIZER.id, revision: "second" }) }));
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Accept Stove" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Item reassigned");
    await user.click(screen.getByRole("button", { name: "Reload shared gear" }));
    expect(await screen.findByText("Awaiting acceptance · You")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept Stove" })).not.toBeInTheDocument();
  });

  it("exposes guest confirmations only to the organizer; pending invites have no organizer override", () => {
    const view = render(<Harness user="user-1" member={guest} />);
    expect(screen.getByRole("button", { name: "Accept Stove" })).toBeInTheDocument();
    expect(screen.getByText(/Your account is recorded as the actor/)).toBeInTheDocument();
    view.rerender(<Harness user="user-1" member={SAM} />);
    expect(screen.queryByRole("button", { name: "Accept Stove" })).not.toBeInTheDocument();
    view.rerender(<Harness user="outsider" member={guest} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept Stove" })).not.toBeInTheDocument();
  });

  it("returns declined and removed-member items to attention with direct links and no Ready verdict", () => {
    render(<SharedGearAttention tripId={TRIP.id} gear={[{ ...item, assignee_member_id: null }, { ...item, id: "tent", description: "Tent" }, { ...item, id: "packed", accepted_at: TRIP.created_at, packed_at: TRIP.created_at }]} />);
    expect(screen.getByRole("link", { name: "Assign item" })).toHaveAttribute("href", "/trips/trip-1/gear#shared-stove");
    expect(screen.getByRole("link", { name: "Review request" })).toHaveAttribute("href", "/trips/trip-1/gear#shared-tent");
    expect(screen.queryByText(/Ready/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("keeps a successful-save/failed-refresh state blocked until the list can be read", async () => {
    const api = fakeTripApi({ [route]: reply(200, {}), "GET /current": reply(503, {}) });
    vi.stubGlobal("fetch", api);
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Accept Stove" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Saved, but the latest list couldn't be loaded");
    await user.click(within(alert).getByRole("button", { name: "Reload shared gear" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept Stove" })).toHaveAttribute("aria-disabled", "true");
  });
});
