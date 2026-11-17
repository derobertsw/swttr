import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripOfflineSave } from "./OfflineBrief";
import { readSavedBrief, storeSavedBrief } from "@/lib/offline-briefs";
import { fakeClerkState, resetFakeClerk } from "@/test/fakeClerk";
import { briefResponse, offlineBrief, resetDeviceStorage } from "@/test/offlineBrief";
import type { TripOfflineBrief } from "@/types/trip-offline-brief";

vi.mock("@clerk/nextjs", async () => (await import("@/test/fakeClerk")).fakeClerkModule);

const SAT = "2027-02-13";
const saturdayOnly = (extra: Partial<TripOfflineBrief> = {}) => offlineBrief({
  covered: { dates: [SAT], label: "Sat Feb 13" }, days: [offlineBrief().days[0]], revision: "rev-sat", ...extra,
});

/** The brief API: the days asked for, or both by default. `fail` answers with that status instead. */
function briefApi(options: { revision?: string; fail?: number } = {}) {
  return vi.fn(async (url: string) => {
    if (options.fail) return { ok: false, status: options.fail, json: async () => ({ error: "Couldn't build the trip brief. Try again." }) } as Response;
    const dates = new URL(url, "http://localhost").searchParams.get("dates")?.split(",");
    const brief = dates?.length === 1 ? saturdayOnly() : offlineBrief(options.revision ? { revision: options.revision } : {});
    return { ok: true, status: 200, json: async () => briefResponse(brief) } as Response;
  });
}

describe("Save for offline on the trip (#214)", () => {
  beforeEach(() => {
    resetDeviceStorage();
    resetFakeClerk();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saves the chosen days after showing what's included and what isn't", async () => {
    const fetchMock = briefApi();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<TripOfflineSave tripId="trip-1" />);

    await user.click(await screen.findByRole("button", { name: "Save for offline" }));
    const dialog = await screen.findByRole("dialog", { name: "Save for offline" });
    // The days ahead are chosen already, and the lists say what's in and out.
    expect(await within(dialog).findByRole("checkbox", { name: /Sat Feb 13/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Sun Feb 14/ })).toBeChecked();
    expect(await within(dialog).findByRole("heading", { name: "Included" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Not available offline" })).toBeInTheDocument();
    expect(within(dialog).getByText("Sun Feb 14: No kit saved")).toBeInTheDocument();
    expect(within(dialog).getByText("Invitation links.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("checkbox", { name: /Sun Feb 14/ }));
    expect(await within(dialog).findByText("Day logistics for 2 days: meet, where you start, getting there and tonight's stay")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save for offline" }));

    expect(await screen.findByText(/^Saved on this device .* · Sat Feb 13$/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/v1/trips/trip-1/brief?dates=${SAT}`, expect.anything());
    expect((await readSavedBrief("trip-1", "user_1"))?.brief.covered.dates).toEqual([SAT]);
    // jsdom has no service workers, so it says the copy can't open offline here.
    expect(screen.getByRole("status")).toHaveTextContent("This browser can't open saved trips without a connection");
    expect(screen.getByRole("link", { name: "Open saved brief" })).toHaveAttribute("href", "/trips/saved?trip=trip-1");
  });

  it("won't save with no days chosen", async () => {
    vi.stubGlobal("fetch", briefApi());
    const user = userEvent.setup();
    render(<TripOfflineSave tripId="trip-1" />);
    await user.click(await screen.findByRole("button", { name: "Save for offline" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(await within(dialog).findByRole("checkbox", { name: /Sat Feb 13/ }));
    await user.click(within(dialog).getByRole("checkbox", { name: /Sun Feb 14/ }));
    expect(within(dialog).getByText("Choose at least one day.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save for offline" })).toBeDisabled();
  });

  it("keeps the days chosen and says nothing was saved when the download fails", async () => {
    vi.stubGlobal("fetch", briefApi());
    const user = userEvent.setup();
    render(<TripOfflineSave tripId="trip-1" />);
    await user.click(await screen.findByRole("button", { name: "Save for offline" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Included" });
    vi.stubGlobal("fetch", briefApi({ fail: 500 }));
    await user.click(within(dialog).getByRole("button", { name: "Save for offline" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn't save on this device: Couldn't build the trip brief. Try again. Nothing was saved.");
    expect(within(dialog).getByRole("checkbox", { name: /Sat Feb 13/ })).toBeChecked();
    expect(await readSavedBrief("trip-1", "user_1")).toBeNull();
  });

  it("says when the trip changed since, keeps the last good copy when updating fails, and removes only this device's copy", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    vi.stubGlobal("fetch", briefApi({ revision: "rev-2" }));
    const user = userEvent.setup();
    render(<TripOfflineSave tripId="trip-1" />);

    expect(await screen.findByText(/^Saved on this device .* · Sat Feb 13 – Sun Feb 14$/)).toBeInTheDocument();
    expect(await screen.findByText("Trip changed — update saved copy")).toBeInTheDocument();

    vi.stubGlobal("fetch", briefApi({ fail: 500 }));
    await user.click(screen.getByRole("button", { name: "Update saved copy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't update the saved copy: .* The copy saved .* is still on this device\./);
    expect((await readSavedBrief("trip-1", "user_1"))?.brief.revision).toBe("rev-1");

    vi.stubGlobal("fetch", briefApi({ revision: "rev-2" }));
    await user.click(screen.getByRole("button", { name: "Update saved copy" }));
    expect(await screen.findByText(/^Updated\. Saved on this device/)).toBeInTheDocument();
    expect((await readSavedBrief("trip-1", "user_1"))?.brief.revision).toBe("rev-2");
    expect(await screen.findByText("Matches the trip online.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove from this device" }));
    expect(await screen.findByText("Removed from this device. The trip online hasn't changed.")).toBeInTheDocument();
    expect(await readSavedBrief("trip-1", "user_1")).toBeNull();
    expect(screen.getByRole("button", { name: "Save for offline" })).toBeInTheDocument();
  });

  it("isn't offered to someone signed out", () => {
    fakeClerkState.signedIn = false;
    vi.stubGlobal("fetch", briefApi());
    const { container } = render(<TripOfflineSave tripId="trip-1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
