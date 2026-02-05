import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BackpackEditor } from "./BackpackEditor";
import { BackpackItem } from "@/types/recommendations";

describe("BackpackEditor", () => {
  const defaultProps = {
    items: [] as BackpackItem[],
    onAddItem: vi.fn(),
    onRemoveItem: vi.fn(),
    onHideDefault: vi.fn(),
  };

  describe("rendering", () => {
    it("should render input field", () => {
      render(<BackpackEditor {...defaultProps} />);
      expect(screen.getByPlaceholderText(/add custom item/i)).toBeInTheDocument();
    });

    it("should render add button", () => {
      render(<BackpackEditor {...defaultProps} />);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should show empty message when no items", () => {
      render(<BackpackEditor {...defaultProps} />);
      expect(screen.getByText(/no items in backpack/i)).toBeInTheDocument();
    });

    it("should render items list when items exist", () => {
      const items: BackpackItem[] = [
        { name: "Sunscreen", isCustom: false },
        { name: "Water bottle", isCustom: true },
      ];
      render(<BackpackEditor {...defaultProps} items={items} />);

      expect(screen.getByText("Sunscreen")).toBeInTheDocument();
      expect(screen.getByText("Water bottle")).toBeInTheDocument();
    });

    it("should show default label for non-custom items", () => {
      const items: BackpackItem[] = [{ name: "Sunscreen", isCustom: false }];
      render(<BackpackEditor {...defaultProps} items={items} />);

      expect(screen.getByText("default")).toBeInTheDocument();
    });

    it("should not show default label for custom items", () => {
      const items: BackpackItem[] = [{ name: "Water bottle", isCustom: true }];
      render(<BackpackEditor {...defaultProps} items={items} />);

      expect(screen.queryByText("default")).not.toBeInTheDocument();
    });
  });

  describe("adding items", () => {
    it("should call onAddItem when add button is clicked", async () => {
      const onAddItem = vi.fn();
      const user = userEvent.setup();
      render(<BackpackEditor {...defaultProps} onAddItem={onAddItem} />);

      await user.type(screen.getByPlaceholderText(/add custom item/i), "New item");
      await user.click(screen.getByRole("button"));

      expect(onAddItem).toHaveBeenCalledWith("New item");
    });

    it("should call onAddItem when Enter is pressed", async () => {
      const onAddItem = vi.fn();
      const user = userEvent.setup();
      render(<BackpackEditor {...defaultProps} onAddItem={onAddItem} />);

      const input = screen.getByPlaceholderText(/add custom item/i);
      await user.type(input, "New item{enter}");

      expect(onAddItem).toHaveBeenCalledWith("New item");
    });

    it("should clear input after adding item", async () => {
      const user = userEvent.setup();
      render(<BackpackEditor {...defaultProps} onAddItem={vi.fn()} />);

      const input = screen.getByPlaceholderText(/add custom item/i);
      await user.type(input, "New item{enter}");

      expect(input).toHaveValue("");
    });

    it("should not call onAddItem for empty input", async () => {
      const onAddItem = vi.fn();
      const user = userEvent.setup();
      render(<BackpackEditor {...defaultProps} onAddItem={onAddItem} />);

      await user.click(screen.getByRole("button"));

      expect(onAddItem).not.toHaveBeenCalled();
    });

    it("should not call onAddItem for whitespace-only input", async () => {
      const onAddItem = vi.fn();
      const user = userEvent.setup();
      render(<BackpackEditor {...defaultProps} onAddItem={onAddItem} />);

      await user.type(screen.getByPlaceholderText(/add custom item/i), "   ");
      await user.click(screen.getByRole("button"));

      expect(onAddItem).not.toHaveBeenCalled();
    });

    it("should trim whitespace from item name", async () => {
      const onAddItem = vi.fn();
      const user = userEvent.setup();
      render(<BackpackEditor {...defaultProps} onAddItem={onAddItem} />);

      await user.type(screen.getByPlaceholderText(/add custom item/i), "  New item  ");
      await user.click(screen.getByRole("button"));

      expect(onAddItem).toHaveBeenCalledWith("New item");
    });
  });

  describe("removing items", () => {
    it("should call onRemoveItem for custom items", async () => {
      const onRemoveItem = vi.fn();
      const items: BackpackItem[] = [{ name: "Custom item", isCustom: true }];
      const user = userEvent.setup();
      render(<BackpackEditor {...defaultProps} items={items} onRemoveItem={onRemoveItem} />);

      const removeButtons = screen.getAllByRole("button");
      const removeButton = removeButtons.find((btn) => btn.className.includes("size-8"));
      await user.click(removeButton!);

      expect(onRemoveItem).toHaveBeenCalledWith("Custom item");
    });

    it("should call onHideDefault for default items", async () => {
      const onHideDefault = vi.fn();
      const items: BackpackItem[] = [{ name: "Default item", isCustom: false }];
      const user = userEvent.setup();
      render(<BackpackEditor {...defaultProps} items={items} onHideDefault={onHideDefault} />);

      const removeButtons = screen.getAllByRole("button");
      const removeButton = removeButtons.find((btn) => btn.className.includes("size-8"));
      await user.click(removeButton!);

      expect(onHideDefault).toHaveBeenCalledWith("Default item");
    });
  });
});
