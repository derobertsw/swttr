import { useLayoutEffect } from "react";
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { OUTING_VIEW_HEADING_IDS, useOutingViewFocus, type OutingView } from "./useOutingViewFocus";

/**
 * Gear up's two views, each with its heading and a control. `expecting` is
 * what the person last asked for; it's said in an effect, so tests change it
 * a render before the view switches, as the page's actions do.
 */
function Page({ view, expecting }: { view: OutingView; expecting: OutingView | null }) {
  const expectView = useOutingViewFocus(view);
  useLayoutEffect(() => expectView(expecting), [expectView, expecting]);
  return (
    <>
      <a href="/wardrobe">Wardrobe</a>
      {view === "form" ? (
        <div key="form">
          <h1 id={OUTING_VIEW_HEADING_IDS.form} tabIndex={-1}>What should I wear?</h1>
          <button type="button">See my layers</button>
        </div>
      ) : (
        <div key="results">
          <h1 id={OUTING_VIEW_HEADING_IDS.results} tabIndex={-1}>Gear up</h1>
          <button type="button">Edit outing</button>
        </div>
      )}
    </>
  );
}

const formHeading = () => screen.getByRole("heading", { name: "What should I wear?" });
const resultHeading = () => screen.getByRole("heading", { name: "Gear up" });
const focus = (element: HTMLElement) => act(() => element.focus());

describe("useOutingViewFocus", () => {
  it("moves focus to the results the person asked for when it left with the form", () => {
    const { rerender } = render(<Page view="form" expecting={null} />);
    focus(screen.getByRole("button", { name: "See my layers" }));

    rerender(<Page view="form" expecting="results" />);
    rerender(<Page view="results" expecting="results" />);

    expect(resultHeading()).toHaveFocus();
  });

  it("moves focus when nothing had it, like after a reload", () => {
    const { rerender } = render(<Page view="form" expecting="results" />);
    expect(document.activeElement).toBe(document.body);

    rerender(<Page view="results" expecting="results" />);

    expect(resultHeading()).toHaveFocus();
  });

  it("moves focus to the form's heading on the way back", () => {
    const { rerender } = render(<Page view="form" expecting="results" />);
    rerender(<Page view="results" expecting="results" />);
    focus(screen.getByRole("button", { name: "Edit outing" }));

    rerender(<Page view="results" expecting="form" />);
    rerender(<Page view="form" expecting="form" />);

    expect(formHeading()).toHaveFocus();
  });

  it("leaves focus where the person moved it", () => {
    const { rerender } = render(<Page view="form" expecting="results" />);
    const elsewhere = screen.getByRole("link", { name: "Wardrobe" });
    focus(elsewhere);

    rerender(<Page view="results" expecting="results" />);

    expect(elsewhere).toHaveFocus();
  });

  it("leaves focus alone for a view nobody asked for, like a browser agent's outing", () => {
    const { rerender } = render(<Page view="form" expecting={null} />);
    focus(screen.getByRole("button", { name: "See my layers" }));

    rerender(<Page view="results" expecting={null} />);

    expect(document.activeElement).toBe(document.body);
  });

  it("leaves focus alone while the view stays the same", () => {
    const { rerender } = render(<Page view="form" expecting="results" />);
    rerender(<Page view="results" expecting="results" />);
    const editOuting = screen.getByRole("button", { name: "Edit outing" });
    focus(editOuting);

    // Asking again from the results, like a changed activity, keeps them.
    rerender(<Page view="results" expecting={null} />);
    rerender(<Page view="results" expecting="results" />);

    expect(editOuting).toHaveFocus();
  });

  it("moves focus only once for each time it's asked", () => {
    const { rerender } = render(<Page view="form" expecting="results" />);
    rerender(<Page view="results" expecting="results" />);
    expect(resultHeading()).toHaveFocus();

    // The account changes, and the page starts over on the form, then shows results nobody asked for.
    rerender(<Page view="form" expecting="results" />);
    rerender(<Page view="results" expecting="results" />);

    expect(document.activeElement).toBe(document.body);
  });

  it("keeps what was asked for through a switch to the other view, like a trip day's Plan again", () => {
    const { rerender } = render(<Page view="form" expecting="results" />);
    rerender(<Page view="results" expecting="results" />);
    focus(screen.getByRole("button", { name: "Edit outing" }));

    // Plan again shows the form while the day's layers load, then their results.
    rerender(<Page view="results" expecting={null} />);
    rerender(<Page view="results" expecting="results" />);
    rerender(<Page view="form" expecting="results" />);
    expect(formHeading()).not.toHaveFocus();
    rerender(<Page view="results" expecting="results" />);

    expect(resultHeading()).toHaveFocus();
  });
});
