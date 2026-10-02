import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "./drawer";

describe("DrawerContent", () => {
  it("moves focus into the drawer and keeps it there", async () => {
    const user = userEvent.setup();
    render(
      <Drawer>
        <DrawerTrigger>Open settings</DrawerTrigger>
        <DrawerContent>
          <DrawerTitle>Settings</DrawerTitle>
          <DrawerDescription>Changes save automatically.</DrawerDescription>
          <input aria-label="Trip name" />
          <button type="button">Done</button>
        </DrawerContent>
      </Drawer>
    );

    const trigger = screen.getByRole("button", { name: "Open settings" });
    await user.click(trigger);

    // Focus moves to the drawer itself, not its text field, so opening the
    // drawer doesn't raise the on-screen keyboard.
    const drawer = await screen.findByRole("dialog", { name: "Settings" });
    await waitFor(() => expect(drawer).toHaveFocus());

    const field = screen.getByRole("textbox", { name: "Trip name" });
    const done = screen.getByRole("button", { name: "Done" });
    await user.tab();
    expect(field).toHaveFocus();
    await user.tab();
    expect(done).toHaveFocus();
    await user.tab();
    expect(field).toHaveFocus();

    // Focus returns to the trigger once the close animation unmounts the
    // drawer, which jsdom never finishes; the close itself is checked here.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(drawer).toHaveAttribute("data-state", "closed"));
  });
});
