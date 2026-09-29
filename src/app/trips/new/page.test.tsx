import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ORGANIZER,
  SAM,
  STOWE_PLACE,
  STOWE_STOP,
  TRIP,
  fakeTripApi,
  reply,
  sentBodies,
  tripFull,
} from "@/test/tripApi";
import NewTripPage from "./page";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

// These tests cover the wizard, not the app chrome around it.
vi.mock("@/components/PageLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/** Opens the page as if its URL had this query string. */
function setQuery(query: string) {
  for (const key of [...mockSearchParams.keys()]) mockSearchParams.delete(key);
  for (const [key, value] of new URLSearchParams(query)) mockSearchParams.set(key, value);
}

/** Picks two days of the month the calendar opens on, and returns them as trip dates. */
async function pickDays(user: ReturnType<typeof userEvent.setup>, first: number, last: number) {
  const today = new Date();
  const days = [first, last].map((day) => new Date(today.getFullYear(), today.getMonth(), day));
  for (const day of days) {
    await user.click(screen.getByRole("button", { name: new RegExp(format(day, "PPPP")) }));
  }
  return days.map((day) => format(day, "yyyy-MM-dd"));
}

/** Fills in step 1 and creates the trip. */
async function createTrip(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("Whistler Powder"), "Whistler");
  const dates = await pickDays(user, 10, 12);
  await user.click(screen.getByRole("button", { name: "Create trip" }));
  return dates;
}

const savedTrip = (body: unknown) => reply(201, { trip: { ...TRIP, ...(body as object) } });

describe("New trip wizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setQuery("");
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates the trip once, then edits it when you come back to the first step", async () => {
    const fetchMock = fakeTripApi({
      "POST /api/v1/trips": savedTrip,
      "GET /api/v1/trips/trip-1": reply(200, tripFull()),
      "PATCH /api/v1/trips/trip-1": (body) => reply(200, { trip: { ...TRIP, ...(body as object) } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NewTripPage />);

    const [start, end] = await createTrip(user);

    expect(await screen.findByRole("heading", { name: "Where?" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Saved to your trips");
    expect(sentBodies(fetchMock, "POST /api/v1/trips")).toEqual([
      { name: "Whistler", start_date: start, end_date: end },
    ]);
    expect(window.location.search).toBe("?trip=trip-1&step=2");

    // Back, then Next with nothing changed, saves nothing.
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Exit" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Where?" })).toBeInTheDocument();

    // A new name updates the trip already created.
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.type(screen.getByPlaceholderText("Whistler Powder"), " Powder");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("heading", { name: "Where?" })).toBeInTheDocument();
    expect(sentBodies(fetchMock, "PATCH /api/v1/trips/trip-1")).toEqual([{ name: "Whistler Powder" }]);
    expect(sentBodies(fetchMock, "POST /api/v1/trips")).toHaveLength(1);
  });

  describe("in a time zone ahead of UTC", () => {
    const originalTimeZone = process.env.TZ;

    beforeAll(() => {
      process.env.TZ = "Pacific/Auckland";
    });

    afterAll(() => {
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    });

    it("saves the days that were picked", async () => {
      const fetchMock = fakeTripApi({
        "POST /api/v1/trips": savedTrip,
        "GET /api/v1/trips/trip-1": reply(200, tripFull()),
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<NewTripPage />);

      const [start, end] = await createTrip(user);

      await screen.findByRole("heading", { name: "Where?" });
      expect(sentBodies(fetchMock, "POST /api/v1/trips")).toEqual([
        { name: "Whistler", start_date: start, end_date: end },
      ]);
    });
  });

  it("reopens the saved trip after a refresh instead of starting another", async () => {
    setQuery("trip=trip-1&step=3");
    const fetchMock = fakeTripApi({
      "GET /api/v1/trips/trip-1": reply(
        200,
        tripFull({ stops: [STOWE_STOP], members: [ORGANIZER, SAM] })
      ),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NewTripPage />);

    expect(await screen.findByRole("heading", { name: "Your crew" })).toBeInTheDocument();
    expect(screen.getByText("Sam")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Stowe, Vermont")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByPlaceholderText("Whistler Powder")).toHaveValue("Whistler");
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("heading", { name: "Where?" })).toBeInTheDocument();
    // Only the request that reopened the trip: nothing was created or changed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says so when the saved trip can't be reopened", async () => {
    setQuery("trip=trip-gone&step=2");
    vi.stubGlobal(
      "fetch",
      fakeTripApi({ "GET /api/v1/trips/trip-gone": reply(404, { error: "Not found" }) })
    );
    render(<NewTripPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reopen your trip: Not found");
    expect(screen.getByRole("heading", { name: "When?" })).toBeInTheDocument();
  });

  it("keeps the form when the trip can't be created", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ "POST /api/v1/trips": reply(401) }));
    const user = userEvent.setup();
    render(<NewTripPage />);

    await createTrip(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't create the trip: Request failed (401)"
    );
    expect(screen.getByPlaceholderText("Whistler Powder")).toHaveValue("Whistler");
    expect(screen.getByRole("button", { name: "Create trip" })).toBeEnabled();
    expect(window.location.search).toBe("");
  });

  it("keeps the chosen place when a stop can't be added, so it can be retried", async () => {
    setQuery("trip=trip-1&step=2");
    let stopAttempts = 0;
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(200, tripFull()),
        "GET /api/geocode": reply(200, { results: [STOWE_PLACE] }),
        "POST /api/v1/trips/trip-1/stops": () =>
          ++stopAttempts === 1
            ? reply(500, { error: "Database unavailable" })
            : reply(201, { stop: STOWE_STOP }),
      })
    );
    const user = userEvent.setup();
    render(<NewTripPage />);

    const search = await screen.findByRole("combobox");
    await user.type(search, "Stowe");
    await user.click(await screen.findByRole("option", { name: /Stowe/ }));
    await user.click(screen.getByRole("button", { name: "Add stop" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't add the stop", {
        description: "Database unavailable",
      })
    );
    expect(search).toHaveValue("Stowe, Vermont, United States");
    expect(screen.queryByText("Stowe, Vermont")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add stop" }));

    expect(await screen.findByText("Stowe, Vermont")).toBeInTheDocument();
    expect(search).toHaveValue("");
  });

  it("keeps a stop listed when removing it fails", async () => {
    setQuery("trip=trip-1&step=2");
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(200, tripFull({ stops: [STOWE_STOP] })),
        "DELETE /api/v1/trips/trip-1/stops/stop-stowe": reply(500, {
          error: "Database unavailable",
        }),
      })
    );
    const user = userEvent.setup();
    render(<NewTripPage />);

    await user.click(await screen.findByRole("button", { name: "Remove Stowe, Vermont" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't remove the stop", {
        description: "Database unavailable",
      })
    );
    expect(screen.getByText("Stowe, Vermont")).toBeInTheDocument();
  });

  it("keeps the name when someone can't be added to the crew", async () => {
    setQuery("trip=trip-1&step=3");
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(200, tripFull()),
        "POST /api/v1/trips/trip-1/members": reply(500, { error: "Database unavailable" }),
      })
    );
    const user = userEvent.setup();
    render(<NewTripPage />);

    const nameInput = await screen.findByPlaceholderText("Display name");
    await user.type(nameInput, "Sam");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't add Sam", {
        description: "Database unavailable",
      })
    );
    expect(nameInput).toHaveValue("Sam");
    expect(screen.queryByText("invited · pending")).not.toBeInTheDocument();
  });
});
