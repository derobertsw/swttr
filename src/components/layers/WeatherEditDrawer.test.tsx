import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { WeatherEditDrawer } from "./WeatherEditDrawer";

const SYDNEY = {
  id: 2147714,
  name: "Sydney",
  region: "New South Wales",
  country: "Australia",
  latitude: -33.87,
  longitude: 151.21,
  timeZone: "Australia/Sydney",
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

function renderDrawer() {
  const onSubmit = vi.fn().mockResolvedValue(true);
  render(<WeatherEditDrawer open onOpenChange={vi.fn()} onSubmit={onSubmit} />);
  // The drawer's drag handling reads CSS transforms, which jsdom lacks, so
  // it's driven with plain click events instead of pointer events.
  return { drawer: screen.getByRole("dialog", { name: "Update Weather" }), onSubmit };
}

async function chooseSydney(drawer: HTMLElement) {
  fireEvent.change(within(drawer).getByRole("combobox", { name: "Location" }), { target: { value: "Sydney" } });
  fireEvent.click(await within(drawer).findByRole("option", { name: /Sydney/ }));
}

describe("WeatherEditDrawer", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ results: [SYDNEY] }) });
    // The device is in New York at 7:30 pm on Thursday, October 1, 2026,
    // when it's 9:30 am on Friday, October 2 in Sydney.
    vi.stubEnv("TZ", "America/New_York");
    vi.setSystemTime(new Date("2026-10-01T23:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("picks dates and the default time on the place's clock, not the device's", async () => {
    const { drawer, onSubmit } = renderDrawer();

    await chooseSydney(drawer);
    fireEvent.click(within(drawer).getByRole("button", { name: "Pick date & time" }));

    expect(within(drawer).getByText("Fri, Oct 2 at 09:00")).toBeInTheDocument();
    expect(within(drawer).getByLabelText("Time")).toHaveValue("09:00");

    fireEvent.click(within(drawer).getByRole("button", { name: "Today" }));
    expect(within(drawer).getByText("Fri, Oct 2 at 09:00")).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole("button", { name: "Tomorrow" }));
    expect(within(drawer).getByText("Sat, Oct 3 at 09:00")).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole("button", { name: "Apply Weather" }));
    expect(onSubmit).toHaveBeenCalledWith(SYDNEY, "2026-10-03T09:00");
  });

  it("moves a shortcut and the default time to the place's clock once it's picked", async () => {
    const { drawer, onSubmit } = renderDrawer();

    // Before there's a place, they read the device's clock.
    fireEvent.click(within(drawer).getByRole("button", { name: "Pick date & time" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Tomorrow" }));
    expect(within(drawer).getByText("Fri, Oct 2 at 19:00")).toBeInTheDocument();

    await chooseSydney(drawer);
    expect(within(drawer).getByText("Sat, Oct 3 at 09:00")).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole("button", { name: "Apply Weather" }));
    expect(onSubmit).toHaveBeenCalledWith(SYDNEY, "2026-10-03T09:00");
  });

  it("keeps a time that was entered when the place changes", async () => {
    const { drawer, onSubmit } = renderDrawer();

    fireEvent.click(within(drawer).getByRole("button", { name: "Pick date & time" }));
    fireEvent.change(within(drawer).getByLabelText("Time"), { target: { value: "07:15" } });
    await chooseSydney(drawer);

    expect(within(drawer).getByText("Fri, Oct 2 at 07:15")).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole("button", { name: "Apply Weather" }));
    expect(onSubmit).toHaveBeenCalledWith(SYDNEY, "2026-10-02T07:15");
  });

  it("reads the place's clock again on Apply, after the drawer stays open past midnight there", async () => {
    // 11:30 pm on Friday, October 2 in Sydney.
    vi.setSystemTime(new Date("2026-10-02T13:30:00Z"));
    const { drawer, onSubmit } = renderDrawer();

    await chooseSydney(drawer);
    fireEvent.click(within(drawer).getByRole("button", { name: "Pick date & time" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Tomorrow" }));
    expect(within(drawer).getByText("Sat, Oct 3 at 23:00")).toBeInTheDocument();

    // 12:05 am on Saturday there, with nothing rendered since.
    vi.setSystemTime(new Date("2026-10-02T14:05:00Z"));
    fireEvent.click(within(drawer).getByRole("button", { name: "Apply Weather" }));

    expect(onSubmit).toHaveBeenCalledWith(SYDNEY, "2026-10-04T00:00");
  });

  it("marks today at the place on the calendar", async () => {
    const { drawer } = renderDrawer();

    await chooseSydney(drawer);
    fireEvent.click(within(drawer).getByRole("button", { name: "Pick date & time" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Oct 2, 2026" }));

    expect(await screen.findByRole("button", { name: /^Today, Friday, October 2nd, 2026/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thursday, October 1st, 2026" })).toBeInTheDocument();
  });
});
