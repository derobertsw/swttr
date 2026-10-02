import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";

describe("Button", () => {
  it("ignores clicks while loading but keeps focus", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving...
      </Button>
    );

    const button = screen.getByRole("button", { name: "Saving..." });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).not.toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveFocus();
  });

  it("blocks an asChild element's own click handler while loading", async () => {
    const user = userEvent.setup();
    const onChildClick = vi.fn();
    render(
      <Button asChild loading>
        <a href="#details" onClick={onChildClick}>
          Details
        </a>
      </Button>
    );

    await user.click(screen.getByRole("link", { name: "Details" }));
    expect(onChildClick).not.toHaveBeenCalled();
  });

  it("does not submit its form while loading", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" loading>
          Save
        </Button>
      </form>
    );

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
