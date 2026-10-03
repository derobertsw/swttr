import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WardrobeItem } from "@/types/wardrobe";
import { fakeTripApi as fakeApi, reply, sentBodies } from "@/test/tripApi";
import Wardrobe from "./page";

// These tests cover the page, not the app chrome around it.
vi.mock("@/components/PageLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useUserId", () => ({ useUserId: () => "user_1" }));

const fleece: WardrobeItem = {
  id: "w1",
  item_type: "garment",
  item_id: "g1",
  disabled: false,
  details: { brand: "Patagonia", model_name: "R1 Hoody", category: "mid_layer_light", garment_type: "jacket", rcl_clo: 0.5 },
};
const gloves: WardrobeItem = {
  id: "w2",
  item_type: "handwear",
  item_id: "h1",
  disabled: false,
  details: { brand: "Hestra", model_name: "Army Leather Heli", handwear_type: "insulated_glove", rcl_clo: 0.3 },
};

const emptyCatalog = reply(200, { items: [] });

/** Replies to each call in turn, repeating the last one. */
function inTurn(...replies: Array<ReturnType<typeof reply>>) {
  let call = 0;
  return () => replies[Math.min(call++, replies.length - 1)];
}

function stubApi(routes: Parameters<typeof fakeApi>[0]) {
  const fetchMock = fakeApi({ "GET /api/wardrobe/available": emptyCatalog, ...routes });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("button", { name: `Actions for ${name}` }));
  return screen.findByRole("menu");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Wardrobe page", () => {
  it("says the wardrobe failed to load instead of showing it empty, and retries", async () => {
    stubApi({
      "GET /api/wardrobe/gear": inTurn(reply(500, { error: "Database error" }), reply(200, { items: [fleece] })),
    });
    const user = userEvent.setup();
    render(<Wardrobe />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your wardrobe");
    expect(screen.queryByText("Add the gear you own")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add gear" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("R1 Hoody")).toBeInTheDocument();
    expect(screen.getByText("1 item")).toBeInTheDocument();
  });

  it("explains an empty wardrobe and starts adding from a body area", async () => {
    stubApi({ "GET /api/wardrobe/gear": reply(200, { items: [] }) });
    const user = userEvent.setup();
    render(<Wardrobe />);

    expect(await screen.findByRole("heading", { name: "Add the gear you own" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hands" }));

    const dialog = await screen.findByRole("dialog", { name: "Add gear" });
    expect(within(dialog).getByRole("button", { name: "Hands", pressed: true })).toBeInTheDocument();
  });

  it("keeps an item included when excluding it fails, then retries", async () => {
    const fetchMock = stubApi({
      "GET /api/wardrobe/gear": reply(200, { items: [fleece, gloves] }),
      "PATCH /api/wardrobe/gear": inTurn(reply(500, { error: "Failed" }), reply(200, { item: {} })),
    });
    const user = userEvent.setup();
    render(<Wardrobe />);

    const menu = await openRowMenu(user, "R1 Hoody");
    await user.click(within(menu).getByRole("menuitem", { name: "Exclude from recommendations" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't exclude this item.");
    expect(screen.queryByText("Excluded from recommendations")).not.toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Excluded from recommendations")).toBeInTheDocument();
    expect(screen.getByText("2 items · 1 excluded from recommendations")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(sentBodies(fetchMock, "PATCH /api/wardrobe/gear")).toEqual([
      { id: "w1", disabled: true },
      { id: "w1", disabled: true },
    ]);
  });

  it("returns focus to the row or button that opened an overlay", async () => {
    stubApi({ "GET /api/wardrobe/gear": reply(200, { items: [fleece, gloves] }) });
    const user = userEvent.setup();
    render(<Wardrobe />);

    const row = await screen.findByRole("button", { name: /^R1 Hoody/ });
    await user.click(row);
    expect(await screen.findByRole("dialog", { name: "R1 Hoody" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(row).toHaveFocus());

    const addGear = screen.getByRole("button", { name: "Add gear" });
    await user.click(addGear);
    expect(await screen.findByRole("dialog", { name: "Add gear" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(addGear).toHaveFocus());
  });

  it("keeps focus on the row's actions when retrying a failed change", async () => {
    stubApi({
      "GET /api/wardrobe/gear": reply(200, { items: [fleece] }),
      "PATCH /api/wardrobe/gear": inTurn(reply(500, { error: "Failed" }), reply(200, { item: {} })),
    });
    const user = userEvent.setup();
    render(<Wardrobe />);

    const menu = await openRowMenu(user, "R1 Hoody");
    await user.click(within(menu).getByRole("menuitem", { name: "Exclude from recommendations" }));
    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(screen.getByRole("button", { name: "Actions for R1 Hoody" })).toHaveFocus();
    expect(await screen.findByText("Excluded from recommendations")).toBeInTheDocument();
  });

  it("keeps the row when removing it fails", async () => {
    stubApi({
      "GET /api/wardrobe/gear": reply(200, { items: [fleece] }),
      "DELETE /api/wardrobe/gear": reply(500, { error: "Failed" }),
    });
    const user = userEvent.setup();
    render(<Wardrobe />);

    const menu = await openRowMenu(user, "R1 Hoody");
    await user.click(within(menu).getByRole("menuitem", { name: "Remove from wardrobe" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't remove this item.");
    expect(screen.getByText("R1 Hoody")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recently removed" })).not.toBeInTheDocument();
  });

  it("removes an item, keeps it restorable for the session, and restores it", async () => {
    const fetchMock = stubApi({
      "GET /api/wardrobe/gear": reply(200, { items: [fleece, gloves] }),
      "DELETE /api/wardrobe/gear": reply(200, { success: true }),
      "POST /api/wardrobe/gear": reply(201, { item: { ...fleece, id: "w9" } }),
    });
    const user = userEvent.setup();
    render(<Wardrobe />);

    const menu = await openRowMenu(user, "R1 Hoody");
    await user.click(within(menu).getByRole("menuitem", { name: "Remove from wardrobe" }));

    const removed = (await screen.findByRole("heading", { name: "Recently removed" })).closest("section")!;
    expect(within(removed).getByText("You can restore these until you leave or reload this page.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actions for R1 Hoody" })).not.toBeInTheDocument();
    expect(screen.getByText("1 item")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Removed R1 Hoody.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Actions for Army Leather Heli" })).toHaveFocus());

    await user.click(within(removed).getByRole("button", { name: "Restore R1 Hoody" }));

    expect(await screen.findByRole("button", { name: "Actions for R1 Hoody" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recently removed" })).not.toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Restored R1 Hoody to your wardrobe.");
    expect(sentBodies(fetchMock, "POST /api/wardrobe/gear")).toEqual([{ item_type: "garment", item_id: "g1" }]);
  });

  it("searches only owned gear and hands an unmatched search to the catalog", async () => {
    stubApi({ "GET /api/wardrobe/gear": reply(200, { items: [fleece, gloves] }) });
    const user = userEvent.setup();
    render(<Wardrobe />);

    const search = await screen.findByRole("textbox", { name: "Search my gear" });
    await user.type(search, "army");
    expect(screen.getByText("Army Leather Heli")).toBeInTheDocument();
    expect(screen.queryByText("R1 Hoody")).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "shell");
    expect(screen.getByText("None of your gear matches “shell”")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Search the catalog" }));

    const dialog = await screen.findByRole("dialog", { name: "Add gear" });
    expect(within(dialog).getByRole("textbox", { name: "Search catalog" })).toHaveValue("shell");
  });

  it("adds a custom item to the list without reloading", async () => {
    const created: WardrobeItem = {
      id: "w5",
      item_type: "custom",
      item_id: "c5",
      disabled: false,
      details: {
        brand: "Custom",
        model_name: "Old wool sweater",
        body_part: "torso",
        layer_type: "mid",
        generic_option: "Sweater",
        rcl_clo: 0.45,
      },
    };
    const fetchMock = stubApi({
      "GET /api/wardrobe/gear": reply(200, { items: [fleece] }),
      "POST /api/wardrobe/custom": reply(201, { item: created }),
    });
    const user = userEvent.setup();
    render(<Wardrobe />);

    await user.click(await screen.findByRole("button", { name: "Add gear" }));
    const catalog = await screen.findByRole("dialog", { name: "Add gear" });
    await user.type(within(catalog).getByRole("textbox", { name: "Search catalog" }), "Old wool sweater");
    await user.click(within(catalog).getAllByRole("button", { name: "Add a similar item" })[0]);

    const form = await screen.findByRole("dialog", { name: "Add a similar item" });
    expect(within(form).getByRole("textbox", { name: "Name" })).toHaveValue("Old wool sweater");
    await user.click(within(form).getByRole("radio", { name: "Sweater" }));
    expect(within(form).getByText("Estimated properties")).toBeInTheDocument();
    await user.click(within(form).getByRole("button", { name: "Add to wardrobe" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Actions for Old wool sweater" })).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(sentBodies(fetchMock, "POST /api/wardrobe/custom")).toEqual([
      { body_part: "torso", layer_type: "mid", generic_option: "Sweater", custom_name: "Old wool sweater" },
    ]);
  });
});
