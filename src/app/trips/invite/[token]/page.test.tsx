import { Suspense } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeTripApi, reply, TRIP } from "@/test/tripApi";
import InviteLandingPage from "./page";

const auth = vi.hoisted(() => ({ account: { id: "synthetic-sam", primaryEmailAddress: { emailAddress: "sam@example.test" }, fullName: "Sam", username: "sam" } as { id: string; primaryEmailAddress: { emailAddress: string }; fullName: string; username: string } | null, signOut: vi.fn(), push: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ isLoaded: true, user: auth.account }), useClerk: () => ({ signOut: auth.signOut }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: auth.push }) }));
vi.mock("@/components/PageLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const preview = { state: "available", invite: { display_name: "Sam", status: "invited" }, trip: TRIP, organizer_name: "Alex" };
const endpoint = "/api/v1/trips/invite/invite-sam";
const params = Promise.resolve({ token: "invite-sam" });
const page = () => <Suspense fallback={null}><InviteLandingPage params={params} /></Suspense>;
async function renderPage() {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(page()); });
  return view;
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.account = { id: "synthetic-sam", primaryEmailAddress: { emailAddress: "sam@example.test" }, fullName: "Sam", username: "sam" };
  auth.signOut.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe("Invitation states and account recovery", () => {
  it("shows a recognizable identity before acceptance and returns to this link when switching", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [`GET ${endpoint}`]: reply(200, preview) }));
    await renderPage();
    expect(await screen.findByText("sam@example.test")).toBeInTheDocument();
    expect(screen.getByText("Alex added you as “Sam”.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Accept invitation" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Switch account" }));
    expect(auth.signOut).toHaveBeenCalledWith({ redirectUrl: "/trips/invite/invite-sam" });
  });

  it("says the organizer added the invitee when the invitation doesn't name them", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [`GET ${endpoint}`]: reply(200, { ...preview, organizer_name: null }) }));
    await renderPage();
    expect(await screen.findByText("The organizer added you as “Sam”.")).toBeInTheDocument();
  });

  it("preserves the intended invitation for both sign-in and sign-up", async () => {
    auth.account = null;
    vi.stubGlobal("fetch", fakeTripApi({ [`GET ${endpoint}`]: reply(200, preview) }));
    await renderPage();
    expect(await screen.findByRole("link", { name: "Sign in to accept" })).toHaveAttribute("href", "/sign-in?redirect_url=%2Ftrips%2Finvite%2Finvite-sam");
    expect(screen.getByRole("link", { name: "Or create an account" })).toHaveAttribute("href", "/sign-up?redirect_url=%2Ftrips%2Finvite%2Finvite-sam");
    expect(screen.queryByRole("button", { name: "Accept invitation" })).not.toBeInTheDocument();
  });

  it("lets a joined participant resume their next task without another acceptance", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [`GET ${endpoint}`]: reply(200, { ...preview, state: "joined" }) }));
    await renderPage();
    expect(await screen.findByRole("heading", { name: "You've joined this trip" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open my pack list" })).toHaveAttribute("href", `/trips/${TRIP.id}/pack`);
    expect(screen.queryByRole("button", { name: "Accept invitation" })).not.toBeInTheDocument();
  });

  it("offers safe acceptance retry after a lost response", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", fakeTripApi({ [`GET ${endpoint}`]: reply(200, preview), [`POST ${endpoint}`]: () => ++calls === 1 ? reply(503, { error: "Connection lost" }) : reply(200, { trip_id: TRIP.id, already_joined: true }) }));
    await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You can safely try accepting again");
    expect(screen.getByRole("link", { name: "My trips" })).toHaveAttribute("href", "/trips");
    await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(auth.push).toHaveBeenCalledWith(`/trips/${TRIP.id}/pack`);
  });

  it("distinguishes unavailable links from failures to load and gives matching actions", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", fakeTripApi({ [`GET ${endpoint}`]: () => ++calls === 1 ? reply(503, { error: "Try again later" }) : reply(404, { error: "This invitation is unavailable." }) }));
    await renderPage();
    expect(await screen.findByRole("heading", { name: "Couldn't load invitation" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Invitation unavailable" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My trips" })).toBeInTheDocument();
    expect(screen.queryByText(TRIP.name)).not.toBeInTheDocument();
  });

  it("turns an unexpected successful HTML response into a retryable load failure", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [`GET ${endpoint}`]: reply(200) }));
    await renderPage();
    expect(await screen.findByRole("heading", { name: "Couldn't load invitation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("rechecks a changed account and discards the previous account's joined preview", async () => {
    const fetchMock = fakeTripApi({ [`GET ${endpoint}`]: () => auth.account?.id === "synthetic-sam" ? reply(200, { ...preview, state: "joined" }) : reply(404, { error: "Invitation unavailable" }) });
    vi.stubGlobal("fetch", fetchMock);
    const view = await renderPage();
    expect(await screen.findByRole("link", { name: "Open my pack list" })).toBeInTheDocument();
    auth.account = { ...auth.account!, id: "synthetic-other", primaryEmailAddress: { emailAddress: "other@example.test" } };
    view.rerender(page());
    expect(screen.queryByText(TRIP.name)).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Invitation unavailable" })).toBeInTheDocument();
    auth.account = null;
    view.rerender(page());
    expect(await screen.findByRole("link", { name: "Sign in to recover your trip" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });
});
