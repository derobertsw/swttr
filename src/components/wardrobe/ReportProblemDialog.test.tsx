import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import type { WardrobeItem } from "@/types/wardrobe";
import { fakeTripApi, reply, sentBodies } from "@/test/tripApi";
import { ItemDetailCard } from "./ItemDetailCard";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const GARMENT_ID = "10000000-0000-4000-8000-000000000001";
const fleece: WardrobeItem = {
  id: "w1",
  item_type: "garment",
  item_id: GARMENT_ID,
  disabled: false,
  details: { brand: "Patagonia", model_name: "R1 Hoody", category: "mid_layer_light", garment_type: "jacket", rcl_clo: 0.5 },
};
const custom: WardrobeItem = {
  id: "w2",
  item_type: "custom",
  item_id: "c1",
  details: { brand: "", model_name: "Old ski jacket", custom_name: "Old ski jacket", body_part: "torso", layer_type: "outer", generic_option: "Snow Shell" },
};

function renderDetails(item: WardrobeItem = fleece) {
  return render(
    <ItemDetailCard
      item={item}
      open
      onOpenChange={() => {}}
      onSetExcluded={() => {}}
      onRemove={() => {}}
      onRetry={() => {}}
    />
  );
}

async function openReport(user: ReturnType<typeof userEvent.setup>) {
  const button = screen.getByRole("button", { name: "Report a problem" });
  await user.click(button);
  const dialog = await screen.findByRole("dialog", { name: "Report a problem" });
  return { button, dialog };
}

beforeEach(() => {
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Report a problem", () => {
  it("is offered for catalog items, not custom ones", () => {
    const { unmount } = renderDetails();
    expect(screen.getByRole("button", { name: "Report a problem" })).toBeInTheDocument();
    unmount();
    renderDetails(custom);
    expect(screen.queryByRole("button", { name: "Report a problem" })).not.toBeInTheDocument();
  });

  it("sends the chosen problems, note and link, then thanks the user and returns focus", async () => {
    const fetchMock = fakeTripApi({
      "POST /api/wardrobe/reports": reply(201, { report: { id: "r1", outcome: "created", reasons: ["wrong_photo", "wrong_warmth"] } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDetails();

    const { button, dialog } = await openReport(user);
    await user.click(within(dialog).getByRole("checkbox", { name: "Warmth or rating looks wrong" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Wrong or missing photo" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Details (optional)" }), "Photo is the old version");
    await user.type(within(dialog).getByRole("textbox", { name: "Product page link (optional)" }), "https://www.patagonia.com/r1");
    await user.click(within(dialog).getByRole("button", { name: "Send report" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Report a problem" })).not.toBeInTheDocument());
    expect(sentBodies(fetchMock, "POST /api/wardrobe/reports")).toEqual([
      {
        item_type: "garment",
        item_id: GARMENT_ID,
        reasons: ["wrong_photo", "wrong_warmth"],
        note: "Photo is the old version",
        product_url: "https://www.patagonia.com/r1",
      },
    ]);
    expect(toast.success).toHaveBeenCalledWith("Thanks for the report", {
      description: "We'll check R1 Hoody and fix the catalog.",
    });
    // The details stay open, with focus back on the button that opened the report.
    expect(screen.getByRole("dialog", { name: "R1 Hoody" })).toBeInTheDocument();
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("says so when the report added to an earlier one", async () => {
    vi.stubGlobal("fetch", fakeTripApi({
      "POST /api/wardrobe/reports": reply(200, { report: { id: "r1", outcome: "updated", reasons: ["duplicate"] } }),
    }));
    const user = userEvent.setup();
    renderDetails();

    const { dialog } = await openReport(user);
    await user.click(within(dialog).getByRole("checkbox", { name: "Duplicate item" }));
    await user.click(within(dialog).getByRole("button", { name: "Send report" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Report updated", expect.anything()));
  });

  it("asks for a problem before sending, and for a note with Something else", async () => {
    const fetchMock = fakeTripApi({});
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDetails();

    const { dialog } = await openReport(user);
    await user.click(within(dialog).getByRole("button", { name: "Send report" }));
    expect(within(dialog).getByText("Choose at least one problem.")).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "Wrong or missing photo" })).toHaveFocus();

    await user.click(within(dialog).getByRole("checkbox", { name: "Something else" }));
    await user.click(within(dialog).getByRole("button", { name: "Send report" }));
    const note = within(dialog).getByRole("textbox", { name: "Details" });
    expect(note).toHaveFocus();
    expect(note).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByText("Say what's wrong in the note.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("checkbox", { name: "Something else" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Discontinued" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Product page link (optional)" }), "patagonia");
    await user.click(within(dialog).getByRole("button", { name: "Send report" }));
    expect(within(dialog).getByRole("textbox", { name: "Product page link (optional)" })).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the report open with an error toast when it can't be sent", async () => {
    vi.stubGlobal("fetch", fakeTripApi({
      "POST /api/wardrobe/reports": reply(429, { error: "You've sent a lot of reports today. Try again tomorrow." }),
    }));
    const user = userEvent.setup();
    renderDetails();

    const { dialog } = await openReport(user);
    await user.click(within(dialog).getByRole("checkbox", { name: "Wrong category or type" }));
    await user.click(within(dialog).getByRole("button", { name: "Send report" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't send the report", {
        description: "You've sent a lot of reports today. Try again tomorrow.",
      })
    );
    expect(screen.getByRole("dialog", { name: "Report a problem" })).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "Wrong category or type" })).toBeChecked();
  });

  it("asks a signed-out user to sign in again", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ "POST /api/wardrobe/reports": reply(401, { error: "Authentication required" }) }));
    const user = userEvent.setup();
    renderDetails();

    const { dialog } = await openReport(user);
    await user.click(within(dialog).getByRole("checkbox", { name: "Wrong specs (weight, material, fit)" }));
    await user.click(within(dialog).getByRole("button", { name: "Send report" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't send the report", {
        description: "Your session ended. Sign in again to send the report.",
      })
    );
  });

  it("closes on Escape without closing the details, and starts fresh next time", async () => {
    const user = userEvent.setup();
    renderDetails();

    const { button, dialog } = await openReport(user);
    await user.click(within(dialog).getByRole("checkbox", { name: "Duplicate item" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Report a problem" })).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "R1 Hoody" })).toBeInTheDocument();
    await waitFor(() => expect(button).toHaveFocus());

    const { dialog: reopened } = await openReport(user);
    expect(within(reopened).getByRole("checkbox", { name: "Duplicate item" })).not.toBeChecked();
  });
});
