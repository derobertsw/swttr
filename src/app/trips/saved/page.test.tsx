import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SavedBriefsPage from "./page";
import { readSavedBriefs, storeSavedBrief } from "@/lib/offline-briefs";
import { fakeClerkState, resetFakeClerk } from "@/test/fakeClerk";
import { briefResponse, offlineBrief, resetDeviceStorage } from "@/test/offlineBrief";

vi.mock("@clerk/nextjs", async () => (await import("@/test/fakeClerk")).fakeClerkModule);
vi.mock("@/components/PageLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const search = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => search.params }));

const setOnline = (online: boolean) => Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
const briefApi = (reply: { status: number; body: unknown }) => vi.fn(async () => ({
  ok: reply.status < 300, status: reply.status, json: async () => reply.body,
}) as Response);
const show = async (query = "") => {
  search.params = new URLSearchParams(query);
  await act(async () => { render(<SavedBriefsPage />); });
};

describe("Saved on this device (#214)", () => {
  beforeEach(() => {
    resetDeviceStorage();
    resetFakeClerk();
    setOnline(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setOnline(true);
  });

  it("opens a saved brief with no connection, read-only, saying what isn't known", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    setOnline(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await show("trip=trip-1");

    expect(await screen.findByRole("heading", { level: 1, name: "Rogers Pass" })).toBeInTheDocument();
    expect(screen.getByText(/^Saved on this device .* · Sat Feb 13 – Sun Feb 14$/)).toBeInTheDocument();
    expect(screen.getByText(/^Showing saved copy; changes since .* are unknown\.$/)).toBeInTheDocument();
    // The day's logistics, in the brief's order, with links that say they need a connection.
    const saturday = screen.getByRole("region", { name: "Sat Feb 13" });
    expect(within(saturday).getByText("6:30 AM PST · Sat Feb 13")).toBeInTheDocument();
    expect(within(saturday).getByText("51.301234, -117.520000 · Exact location")).toBeInTheDocument();
    expect(within(saturday).getByText("Glacier Crest trees")).toBeInTheDocument();
    expect(within(saturday).getByRole("link", { name: "Directions in Google Maps · Requires connection" })).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1");
    expect(within(saturday).getByRole("link", { name: "Route link · Requires connection" })).toBeInTheDocument();
    expect(screen.getByText("Not planned yet for this day: No kit saved.")).toBeInTheDocument();
    // Nothing to edit or check off, and nothing fetched.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update saved copy" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove from this device" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists the device's briefs with when each was saved", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    setOnline(false);
    await show();
    expect(await screen.findByRole("heading", { level: 1, name: "Saved on this device" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rogers Pass" })).toHaveAttribute("href", "/trips/saved?trip=trip-1");
    expect(screen.getByText(/^Showing saved copy; changes since/)).toBeInTheDocument();
  });

  it("online, says the trip changed and updates the copy on request", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    vi.stubGlobal("fetch", briefApi({ status: 200, body: briefResponse(offlineBrief({ revision: "rev-2" })) }));
    const user = userEvent.setup();
    await show("trip=trip-1");
    expect(await screen.findByText("Trip changed — update saved copy")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Update saved copy" }));
    expect(await screen.findByText(/^Updated\./)).toBeInTheDocument();
    expect((await readSavedBriefs()).briefs[0].brief.revision).toBe("rev-2");
  });

  it("removes the copy once the server says the person isn't on the trip any more", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    vi.stubGlobal("fetch", briefApi({ status: 404, body: { error: "Not found" } }));
    await show();
    expect(await screen.findByText("Removed from this device: you're no longer on Rogers Pass, or it was deleted.")).toBeInTheDocument();
    expect((await readSavedBriefs()).briefs).toEqual([]);
  });

  it("keeps the copy and says so when checking fails", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    vi.stubGlobal("fetch", briefApi({ status: 500, body: { error: "Couldn't build the trip brief. Try again." } }));
    await show("trip=trip-1");
    expect(await screen.findByText(/^Couldn't check for changes: Couldn't build the trip brief\. Try again\. Showing saved copy; changes since .* are unknown\.$/)).toBeInTheDocument();
    expect((await readSavedBriefs()).briefs).toHaveLength(1);
  });

  it("removes another account's briefs instead of showing them", async () => {
    await storeSavedBrief("user_2", offlineBrief({ viewer: { user_id: "user_2", member_id: "m-2" } }));
    vi.stubGlobal("fetch", vi.fn());
    await show();
    expect(await screen.findByText("Trips saved by another account were removed from this device.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Rogers Pass" })).not.toBeInTheDocument();
    expect((await readSavedBriefs()).briefs).toEqual([]);
  });

  it("removes them once signed out, when the server agrees", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    fakeClerkState.signedIn = false;
    vi.stubGlobal("fetch", briefApi({ status: 401, body: { error: "Authentication required" } }));
    await show();
    expect(await screen.findByText("You signed out, so the trips saved on this device were removed.")).toBeInTheDocument();
    expect((await readSavedBriefs()).briefs).toEqual([]);
  });

  it("lists the briefs on a cold start with no connection, before Clerk loads, saying what isn't known (#214)", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    fakeClerkState.loaded = false;
    setOnline(false);
    await show();
    expect(await screen.findByRole("link", { name: "Rogers Pass" })).toBeInTheDocument();
    expect(screen.getByText(/^Showing saved copy; changes since .* are unknown\.$/)).toBeInTheDocument();
  });

  it("doesn't ask someone to sign in when the connection, not the account, is missing (#214)", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    // The browser says it's online, but nothing loads, so Clerk never does.
    fakeClerkState.loaded = false;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await show("trip=trip-1");
    expect(await screen.findByRole("heading", { level: 1, name: "Rogers Pass" }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/^Showing saved copy; changes since .* are unknown\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/Sign in to check/)).not.toBeInTheDocument();
  });

  it("asks to sign in to check for changes when nobody is signed in and the server can't confirm it", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    fakeClerkState.signedIn = false;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await show("trip=trip-1");
    expect(await screen.findByText(/^Sign in to check for changes\. Showing saved copy; changes since .* are unknown\.$/)).toBeInTheDocument();
  });

  it("tells people to bookmark it, since it's the only page that opens offline (#214)", async () => {
    setOnline(false);
    await show();
    expect(await screen.findByText(/Without a connection, this is the only SWTTR page that opens\. Bookmark it/)).toBeInTheDocument();
  });

  it("moves focus to the page after removing the copy, and says what happened (#214)", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    setOnline(false);
    const user = userEvent.setup();
    await show("trip=trip-1");
    await user.click(await screen.findByRole("button", { name: "Remove from this device" }));
    const heading = await screen.findByRole("heading", { level: 1, name: "Not saved on this device" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(heading).toHaveAccessibleDescription("Removed Rogers Pass from this device. The trip online hasn't changed.");
    expect((await readSavedBriefs()).briefs).toEqual([]);
  });

  it("wraps its buttons' labels, so they fit a phone with large text (#214)", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    vi.stubGlobal("fetch", briefApi({ status: 200, body: briefResponse() }));
    await show("trip=trip-1");
    for (const name of ["Update saved copy", "Remove from this device"]) {
      expect(await screen.findByRole("button", { name })).toHaveClass("whitespace-normal");
    }
    expect(screen.getByRole("link", { name: "Open the trip" })).toHaveClass("whitespace-normal");
  });

  it("says when a trip isn't saved here", async () => {
    setOnline(false);
    await show("trip=trip-9");
    expect(await screen.findByRole("heading", { name: "Not saved on this device" })).toBeInTheDocument();
  });
});
