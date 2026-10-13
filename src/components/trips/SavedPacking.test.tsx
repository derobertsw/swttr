import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SavedPacking } from "@/components/trips/SavedPacking";
import { emptyPacking, packingReview } from "@/lib/trip-packing";
import type { TripPackingSnapshot } from "@/types/trip-packing";
import { packingTrip } from "@/test/tripPacking";
import { ORGANIZER, fakeTripApi, reply } from "@/test/tripApi";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const full = packingTrip();
const review = (snapshot: TripPackingSnapshot = emptyPacking) => packingReview(full, ORGANIZER.id, snapshot);
function Harness() {
  const [packing, setPacking] = useState(review());
  return <SavedPacking tripId="trip-1" packing={packing} onChange={setPacking} onConflict={vi.fn().mockResolvedValue(undefined)} />;
}

describe("saved personal packing", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it("shows source days, suggestions and added items before applying; reload shows confirmed requirements", async () => {
    const user = userEvent.setup();
    const initial = review();
    const saved = { ...emptyPacking, revision: 1, requirements: initial.proposed };
    const fetch = fakeTripApi({ "POST /api/v1/trips/trip-1/pack": reply(200, { packing: review(saved) }) });
    vi.stubGlobal("fetch", fetch);
    const { unmount } = render(<Harness />);
    expect(screen.getByRole("heading", { name: "Added" })).toBeInTheDocument();
    expect(screen.getByText("Not in your wardrobe")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /2026-10-12 · Wear/ }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Apply reviewed changes" }));
    expect(await screen.findByText("Packing saved.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(fetch.mock.calls[0][1]?.body).toContain(initial.proposal_revision);
    unmount();
    render(<SavedPacking tripId="trip-1" packing={review(saved)} onChange={vi.fn()} onConflict={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: "Added" })).not.toBeInTheDocument();
    expect(screen.getByText("Ski shell · 1")).toBeInTheDocument();
  });
  it("keeps manual input after failure, requires review, and retries the same identity", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const fetch = fakeTripApi({ "POST /api/v1/trips/trip-1/pack": body => {
      const input = body as TripPackingSnapshot & { action: string };
      if (++attempt === 1) return reply(503, { error: "Could not save. Your edits have been kept; try again." });
      return reply(200, { packing: review({ ...emptyPacking, manual_items: input.manual_items, quantities: input.quantities }) });
    } });
    vi.stubGlobal("fetch", fetch);
    render(<Harness />);
    await user.type(screen.getByLabelText("Personal item"), "Spare socks");
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "3");
    await user.click(screen.getByRole("button", { name: "Add to review" }));
    expect(screen.getByRole("button", { name: "Apply reviewed changes" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    expect(await screen.findByText(/Could not save. Your edits have been kept/)).toBeInTheDocument();
    expect(screen.getByLabelText("Spare socks quantity")).toHaveValue(3);
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply reviewed changes" })).toBeEnabled());
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).manual_items).toEqual(JSON.parse(fetch.mock.calls[1][1]!.body as string).manual_items);
  });
  it("announces conflicts and keeps pending quantity edits for another review", async () => {
    const user = userEvent.setup();
    const conflict = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fakeTripApi({ "POST /api/v1/trips/trip-1/pack": reply(409, { error: "Packing changed. Your edits have been kept." }) }));
    render(<SavedPacking tripId="trip-1" packing={review()} onChange={vi.fn()} onConflict={conflict} />);
    const input = screen.getByLabelText("Ski shell quantity");
    await user.clear(input); await user.type(input, "2");
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    expect(await screen.findByText("Packing changed. Your edits have been kept.")).toBeInTheDocument();
    expect(input).toHaveValue(2); expect(conflict).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Apply reviewed changes" })).toBeDisabled();
  });
  it("offers Keep editing on dirty day-link navigation and native Back", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Personal item"), "Water");
    await user.click(screen.getAllByRole("link", { name: /2026-10-10 · Wear/ })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Discard packing changes?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Personal item")).toHaveValue("Water");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByRole("button", { name: "Keep editing" })).toBeInTheDocument();
  });
});
