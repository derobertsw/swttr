import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripOfflineSave } from "./OfflineBrief";
import { readSavedBrief, readSavedBriefs, storeSavedBrief } from "@/lib/offline-briefs";
import { OfflineBriefAccountGuard } from "@/components/OfflineBriefAccountGuard";
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
    // jsdom has no service workers: the copy is kept, but it can't open offline here, and that's an alert, not a success.
    expect(screen.getByRole("status")).not.toHaveTextContent("with or without a connection");
    expect(screen.getByRole("alert")).toHaveTextContent("This browser can't open saved trips without a connection");
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

  it("removes the copy once the server says the member can't open the trip any more, and keeps it on other failures", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    vi.stubGlobal("fetch", briefApi({ fail: 500 }));
    const { unmount } = render(<TripOfflineSave tripId="trip-1" />);
    expect(await screen.findByText(/^Couldn't check for changes/)).toBeInTheDocument();
    expect(await readSavedBrief("trip-1", "user_1")).not.toBeNull();
    unmount();

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: "Not found" }) }) as Response));
    render(<TripOfflineSave tripId="trip-1" />);
    expect(await screen.findByText("Removed from this device: you're no longer on this trip, or it was deleted.")).toBeInTheDocument();
    expect(await readSavedBrief("trip-1", "user_1")).toBeNull();
    expect(screen.getByRole("button", { name: "Save for offline" })).toBeInTheDocument();
  });

  it("doesn't keep a brief that finishes downloading after the account signed out", async () => {
    const user = userEvent.setup();
    const preview = briefApi();
    let finish!: () => void;
    // The preview answers at once; the save's download waits until released.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (!saving) return preview(url);
      await new Promise<void>((resolve) => { finish = resolve; });
      return preview(url);
    }));
    let saving = false;
    const view = () => <><OfflineBriefAccountGuard /><TripOfflineSave tripId="trip-1" /></>;
    const { rerender } = render(view());
    await user.click(await screen.findByRole("button", { name: "Save for offline" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Included" });
    saving = true;
    await user.click(within(dialog).getByRole("button", { name: "Save for offline" }));

    fakeClerkState.signedIn = false;
    rerender(view());
    finish();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await readSavedBriefs()).briefs).toEqual([]);
  });

  describe("after the trip's dates changed", () => {
    const FEB_20 = "2027-02-20";
    /** The brief API for a trip whose days are now Saturday and Sunday: other days are left out, or refused when none remain. */
    const rescheduledApi = () => vi.fn(async (url: string) => {
      const asked = new URL(url, "http://localhost").searchParams.get("dates")?.split(",");
      const days = asked ? asked.filter((date) => date === SAT || date === "2027-02-14") : [SAT, "2027-02-14"];
      if (days.length === 0) {
        return { ok: false, status: 409, json: async () => ({ error: "None of these days are on the trip any more. Choose the days to save again." }) } as Response;
      }
      const brief = days.length === 1 ? saturdayOnly() : offlineBrief({ revision: "rev-2" });
      return { ok: true, status: 200, json: async () => briefResponse(brief) } as Response;
    });
    /** A copy saved for days with their own labels, as the trip had them then. */
    const savedFor = (days: Array<[string, string]>) => {
      const template = offlineBrief().days[0];
      return offlineBrief({
        covered: { dates: days.map(([date]) => date), label: days.map(([, label]) => label).join(", ") },
        days: days.map(([date, label]) => ({ ...template, date, date_label: label })),
      });
    };

    it("offers the trip's current days when none of the saved days remain, and keeps the old copy until the new one saves", async () => {
      await storeSavedBrief("user_1", savedFor([["2027-01-09", "Sat Jan 9"], ["2027-01-10", "Sun Jan 10"]]));
      const fetchMock = rescheduledApi();
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<TripOfflineSave tripId="trip-1" />);

      // The section's own check finds the saved days gone.
      expect(await screen.findByText("Trip changed — update saved copy")).toBeInTheDocument();
      const opened = fetchMock.mock.calls.length;
      await user.click(screen.getByRole("button", { name: "Change saved days" }));
      const dialog = await screen.findByRole("dialog", { name: "Save for offline" });
      expect(await within(dialog).findByText("None of the saved days (Sat Jan 9, Sun Jan 10) are on the trip any more, so the trip's days ahead are chosen instead.")).toBeInTheDocument();
      expect(within(dialog).getByRole("checkbox", { name: /Sat Feb 13/ })).toBeChecked();
      expect(within(dialog).getByRole("checkbox", { name: /Sun Feb 14/ })).toBeChecked();
      expect(await within(dialog).findByRole("heading", { name: "Included" })).toBeInTheDocument();
      expect((await readSavedBrief("trip-1", "user_1"))?.brief.covered.dates).toEqual(["2027-01-09", "2027-01-10"]);

      await user.click(within(dialog).getByRole("button", { name: "Save for offline" }));
      expect(await screen.findByText(/^Saved on this device .* · Sat Feb 13 – Sun Feb 14$/)).toBeInTheDocument();
      expect((await readSavedBrief("trip-1", "user_1"))?.brief.covered.dates).toEqual([SAT, "2027-02-14"]);
      // The sheet never asked for the days the trip no longer has.
      expect(fetchMock.mock.calls.slice(opened).map(([url]) => url).filter((url) => String(url).includes("2027-01"))).toEqual([]);
    });

    it("drops the saved days the trip no longer has, says so, and keeps the rest", async () => {
      await storeSavedBrief("user_1", savedFor([[SAT, "Sat Feb 13"], [FEB_20, "Sat Feb 20"]]));
      const fetchMock = rescheduledApi();
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<TripOfflineSave tripId="trip-1" />);

      await user.click(await screen.findByRole("button", { name: "Change saved days" }));
      const dialog = await screen.findByRole("dialog", { name: "Save for offline" });
      expect(await within(dialog).findByText("Sat Feb 20 is no longer a day of this trip, so it's left out.")).toBeInTheDocument();
      expect(within(dialog).getByRole("checkbox", { name: /Sat Feb 13/ })).toBeChecked();
      expect(within(dialog).getByRole("checkbox", { name: /Sun Feb 14/ })).not.toBeChecked();
      expect(await within(dialog).findByRole("heading", { name: "Included" })).toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: "Save for offline" }));
      expect(await screen.findByText(/^Saved on this device .* · Sat Feb 13$/)).toBeInTheDocument();
      expect(fetchMock).toHaveBeenLastCalledWith(`/api/v1/trips/trip-1/brief?dates=${SAT}`, expect.anything());
      expect((await readSavedBrief("trip-1", "user_1"))?.brief.covered.dates).toEqual([SAT]);
    });
  });

  it("isn't offered to someone signed out", () => {
    fakeClerkState.signedIn = false;
    vi.stubGlobal("fetch", briefApi());
    const { container } = render(<TripOfflineSave tripId="trip-1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
