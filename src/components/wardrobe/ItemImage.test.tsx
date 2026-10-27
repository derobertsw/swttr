import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { WardrobeItem } from "@/types/wardrobe";
import { ItemThumbnail } from "./ItemThumbnail";
import { ItemDetailContent } from "./item-detail/ItemDetailContent";

function garment(url?: string | null): WardrobeItem {
  return {
    id: "wardrobe-1",
    item_id: "garment-1",
    item_type: "garment",
    details: {
      brand: "Example",
      model_name: "Rain jacket",
      category: "hard_shell",
      garment_type: "jacket",
      item_image_url: url,
    },
  };
}

describe.each([
  ["thumbnail", ItemThumbnail],
  ["detail photo", ItemDetailContent],
] as const)("catalog %s", (_label, Component) => {
  it.each(["/images/items/patagonia-houdini-jacket.jpg", "https://cdn.example.com/jacket.webp"])(
    "loads the stored URL directly: %s",
    (url) => {
      const { container } = render(<Component item={garment(url)} />);
      const image = container.querySelector("img");
      expect(image).toHaveAttribute("src", url);
      expect(image).toHaveAttribute("loading", "lazy");
      expect(image).toHaveAttribute("alt", "");
    }
  );

  it("replaces a broken photo with an inline category icon", () => {
    const { container } = render(<Component item={garment("/missing.jpg")} />);
    const image = container.querySelector("img")!;
    const well = image.parentElement!;

    fireEvent.error(image);

    expect(well.querySelector("img")).toBeNull();
    expect(well.querySelector("svg.lucide-cloud-rain")).toBeInTheDocument();
  });

  it.each([undefined, null, "", "  ", "/api/media/item-image?item_type=garment&item_id=old", "/media/items/garment/old.svg"])(
    "uses an icon without requesting a missing or legacy URL: %s",
    (url) => {
      const { container } = render(<Component item={garment(url)} />);
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("svg.lucide-cloud-rain")).toBeInTheDocument();
    }
  );

  it("tries a replacement URL after the old image fails", () => {
    const { container, rerender } = render(<Component item={garment("/old.jpg")} />);
    fireEvent.error(container.querySelector("img")!);

    rerender(<Component item={garment("/replacement.jpg")} />);

    expect(container.querySelector("img")).toHaveAttribute("src", "/replacement.jpg");
  });
});

it("keeps custom items as icons even if they contain an image URL", () => {
  const item = { ...garment("/custom.jpg"), item_type: "custom" as const };
  const { container } = render(<ItemThumbnail item={item} />);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg.lucide-sparkles")).toBeInTheDocument();
});
