# SWTTR design system

SWTTR's interface should read like a calm outdoor field guide. The navy and teal identity stays. Surfaces are solid and readable, and color marks actions, selection and status. Each screen has one clear primary action.

The system is a thin layer over the existing shadcn/Radix components:
- Tokens live in [`src/assets/styles/globals.css`](../src/assets/styles/globals.css).
- Components live in [`src/components/ui/`](../src/components/ui/).
- The `/design` page renders every token and component in both appearances. Only the dev server and Vercel preview deployments serve it; every other build returns 404.

## Appearance

SWTTR follows the device's light or dark setting. There is no in-app preference.

- **Light** is a muted field-guide page with deep-teal actions.
- **Dark** is navy surfaces with light-mint actions.

`data-appearance="light"` or `data-appearance="dark"` on an element pins that subtree to one palette.

**Release appearance (#119):**
- The root stays unpinned: CSS follows `prefers-color-scheme` from the first paint and updates when the device setting changes. No stored theme or client-side theme switch is needed.
- `viewport.themeColor` in `src/app/layout.tsx` supplies each canvas color with its matching media query. The generated viewport retains `viewport-fit=cover` for safe areas and allows zoom.
- `PageLayout` uses the Capacitor status bar's `Style.Default`, which follows the device appearance. The custom UIKit tab shell uses `UIStatusBarStyle.default` directly and a dynamic loading canvas matching the web palettes. It does not initialize the Capacitor bridge.

Browser verification and before/after screenshots are recorded in [the #119 appearance report](qa/119-system-appearance/README.md).

Components use the semantic colors below. Don't use raw hex values, Tailwind palette colors (`slate-500`, `white/70`) or `dark:` variants. Tokens follow a pinned subtree; `dark:` variants can't tell which palette a nested subtree uses.

## Color tokens

The names follow shadcn, so `bg-card`, `text-muted-foreground`, `border-input` and the rest work as utilities.

| Role | Token | Light | Dark | Use |
|---|---|---|---|---|
| Canvas | `background` | `#f1f0ea` | `#0f1d2a` | Page background |
| Text | `foreground` | `#13222f` | `#f4f8fa` | Headings and body text |
| Supporting text | `muted-foreground` | `#4b5b67` | `#b7c8d4` | Help, metadata, placeholders. Never lower its opacity. |
| Surface | `card` | `#fbfaf7` | `#172b3a` | Cards, inputs, sidebar, tab bar, dialogs, drawers, sheets |
| Overlay | `popover` | `#ffffff` | `#203a4b` | Menus, popovers, select lists |
| Muted | `muted` / `secondary` | `#e7e6df` | `#203a4b` | Wells, segmented tracks, secondary buttons |
| Hover | `accent` | `#dfded6` | `#2a4a5e` | Hover and highlighted menu items |
| Action | `primary` | `#0b6b63` | `#74e0cf` | Primary buttons, links, selection outline |
| Text on action | `primary-foreground` | `#ffffff` | `#0b2427` | |
| Selected | `primary-soft` | `#dcefea` | `#264852` | Selected choice, active nav item |
| Divider | `border` | `#d3d2ca` | `#456477` | Decorative separators only. Too faint to mark a control. |
| Control outline | `input` | `#6a7781` | `#7a96a7` | Borders of inputs, selects, outline buttons |
| Focus | `ring` | `#1f5fcc` | `#96beff` | 2px focus outline, offset 2px |
| Success | `success` / `success-soft` | `#1f6b3b` / `#e1f0e4` | `#a7e3ba` / `#2b454c` | Status text and its chip background |
| Warning | `warning` / `warning-soft` | `#7a5200` / `#f8ebcf` | `#f4c778` / `#364143` | |
| Error | `destructive` / `destructive-soft` | `#b3261e` / `#f9e2df` | `#ffb4ab` / `#373e4a` | Errors, invalid fields, destructive actions |
| Text on error | `destructive-foreground` | `#ffffff` | `#690005` | |
| Scrim | `scrim` | navy 45% | near-black 65% | Behind dialogs and drawers |

[`globals.test.ts`](../src/assets/styles/globals.test.ts) checks the pairs components rely on:
- Text pairs need 4.5:1.
- Control outlines, focus rings and selection marks need 3:1.
- The two copies of the dark palette must stay identical: one is pinned, one follows the system.

Translucent colors such as `bg-primary/90` composite over whatever sits below. Check those against the rendered background, not the token alone.

## Typography

The font is Geist, loaded by `next/font` on `<html>`. iOS keeps the system font (SF Pro). Use sentence case. Avoid spaced-out all-caps labels.

| Use | Class | Size |
|---|---|---|
| Page title | `text-title md:text-title-lg font-semibold` | 28/34px, then 32/40px from `md` |
| Section heading | `text-xl font-semibold` | 20/28px |
| Body and fields | `text-base` | 16/24px. Fields stay 16px so iOS doesn't zoom on focus. |
| Supporting labels, help, errors | `text-sm` | 14/20px |
| Short nonessential metadata | `text-xs` | 12/16px |

## Space, shape, motion

- **Spacing:** a 4px base. The usual steps are 8, 12, 16, 24, 32 and 48px (`2`, `3`, `4`, `6`, `8`, `12`). Mobile gutters are 16px and desktop gutters 32px; `PageLayout` owns them.
- **Radius:**
  - `rounded-control` (10px) for controls.
  - `rounded-card` (16px) for cards and popovers.
  - `rounded-sheet` (20px) for dialogs and the top corners of drawers.
  - `rounded-full` for badges.
- **Elevation:** one container per meaningful group. Don't nest cards, glass panels or inset shadows. Shadows are for overlays only.
- **Motion:** keep state feedback brief (Tailwind's default 150ms transitions). Don't scale or resize selected items. `prefers-reduced-motion` cuts every animation and transition to near zero (see `globals.css`).

## Components

| Component | File | Notes |
|---|---|---|
| Button | `ui/button.tsx` | Variants: `default` (primary), `secondary`, `outline`, `ghost`, `destructive`, `link`. Sizes: `default` 44px, `lg` 48px for the one primary mobile action, `sm` and `icon-sm` 36px (44px on phones and touch), `icon` 44px. `loading` shows a spinner and ignores clicks without disabling the button, so it keeps focus. |
| Input | `ui/input.tsx` | 44px, 16px text, `border-input`. Set `aria-invalid` and point `aria-describedby` at a `FieldError`. `fieldClassName` gives field-like triggers the same look. |
| Select | `ui/select.tsx` | Trigger matches Input. Items are 44px on touch, and the chosen item gets a check mark. Pair the trigger with a `<label htmlFor>`. |
| Segmented choice | `ui/segmented.tsx` | `segmentedGroupClassName` and `segmentedItemClassName`. The caller keeps its markup and keyboard handling. The selected look follows `aria-checked` or `aria-pressed`, so selection is always announced. |
| Filter chips | `ui/chip.ts` | `chipClassName` for a wrapping row of `<button>` chips, such as Wardrobe's body area, layer, sort and brand filters. A toggle chip sets `aria-pressed`, and a radio chip sets `aria-checked`; both get the segmented selected look. 36px, 44px on phones and touch. Use segmented choices when the options fit one row. |
| Tabs | `ui/tabs.tsx` | Same selected look as segmented choices. The `line` variant underlines the active tab. |
| Card | `ui/card.tsx` | `variant`: `default`, `muted`, `selected`. `padding`: `none`, `sm`, `default`, `lg`. Use `interactive` with `asChild` when the whole card is a link or button. `CardTitle` takes `asChild` to render a heading. |
| Badge | `ui/badge.tsx` | Variants: `neutral`, `primary`, `success`, `warning`, `destructive`, `outline`, in two sizes. Give each status a word or an icon as well as its color. |
| FieldError | `components/FieldError.tsx` | 14px error text with an icon, in `text-destructive`. |
| Dialog | `ui/dialog.tsx` | Surface `card`, radius `sheet`. The close button is a 44px target. Long content scrolls inside the dialog, clear of the safe areas. |
| Drawer | `ui/drawer.tsx` | Vaul bottom sheet. Put long content in `DrawerBody` so it scrolls between a fixed header and `DrawerFooter`. The bottom edge pads past the home indicator. `showCloseButton` adds the 44px close button. On open, focus moves to the drawer itself rather than its first field, so the keyboard doesn't pop up and Tab stays inside. |
| Sheet | `ui/sheet.tsx` | Side panels pad for the safe areas and use the shared close button. |
| Popover, Tooltip | `ui/popover.tsx`, `ui/tooltip.tsx` | Popovers use the `popover` surface. Tooltips are inverted and 14px. |
| Dropdown menu | `ui/dropdown-menu.tsx` | Radix menu on the `popover` surface for a row's secondary actions, such as a Wardrobe item's Exclude and Remove. Items match Select items (44px on touch); `variant="destructive"` marks Remove. Give the trigger an `aria-label` that names the row. Keep the trigger enabled while a change runs, so focus can return to it, and disable the items instead. |
| Calendar | `ui/calendar.tsx` | Day cells are 40px on touch, not 44px, so a month fits a 320px screen. |

## Accessibility rules

- **Focus:**
  - Every interactive element shows the 2px `ring` outline, offset 2px.
  - `globals.css` sets this outline for all `:focus-visible` elements. Don't remove it.
  - Tailwind v4's `outline-none` also turns off the `focus-visible:outline-2` utilities, so don't combine them.
- **Touch targets:**
  - Controls are at least 44 × 44px on phones and touch screens.
  - The primary mobile action is 48px tall.
  - Compact sizes grow with `max-md:` and `pointer-coarse:`.
- **Labels:** every field has a visible `<label htmlFor>`. A group of choices gets `role="group"` or `role="radiogroup"` with `aria-labelledby`.
- **State:** selection, errors and status always carry more than color: an outline and heavier text, an icon, or a word.
- **Overlays:**
  - Dialogs, drawers and sheets contain focus, close with Escape, and return focus to their trigger.
  - Give each one a title, and a description or `aria-describedby={undefined}`.
  - Use `role="status"` for save confirmations and `role="alert"` for errors that appear after an action.

## Adding UI

1. Start from a component in `src/components/ui/`. If none fits, compose one from tokens and add it there, with a `/design` example.
2. Use semantic colors only. Need a new role? Add the token to both palettes in `globals.css`, map it in `@theme inline`, and add its contrast pairs to `globals.test.ts`.
3. Use the type scale and the three radii.
4. Check the screen:
   - at 320px, 390px and desktop width, in both appearances (pin with `data-appearance`);
   - with the keyboard only;
   - with long content.
5. Measure contrast on the rendered page, especially for translucent colors and text over images.

## Migration status and exceptions

| Area | State |
|---|---|
| Tokens, components, focus, reduced motion | Done (#119 foundations) |
| Navigation: sidebar, mobile tab bar, header, menu sheet | Uses tokens |
| Overlays: Settings, Update Weather, layer picker, Add a similar item, item details, popovers, menus, location suggestions | Uses tokens |
| Gear up form (`src/app/page.tsx`, `GearUpForm`, `ActivitySelection`, `SegmentedChoice`, `DeviceLocationButton`) | Uses tokens (#126) |
| One-day results (`LayerDisplay`, `layers/*`, `ScoreDisplay`, `BiophysicsDetails`) | Uses tokens (#127) |
| Multi-day plan (`MultiDayPlanDisplay`, `plan/*`) | Uses tokens (#127) |
| Wardrobe (`src/app/wardrobe`, `wardrobe/*`), including Add gear and Add a similar item | Uses tokens |
| Trips (`src/app/trips/**`, `trips/*`), including the trip sheets and the legacy wizard | Uses tokens |
| FAQ | Uses tokens, the shared Accordion and the type scale |

Remaining exceptions, each with a reason:
- **Product image wells** stay white in both appearances, because catalog photos have white backgrounds.
- **Clerk's sign-in and account UI** keep Clerk's own styling.
- **The custom UIKit shell's native chrome** in `ios/App/App/SWTTRViewController.swift` keeps its fixed dark tab bar and action button. Its web content, loading canvas and status text follow the device appearance. Tab/action chrome migration belongs to #130/#146; the Capacitor status-bar setting does not control this standalone UIKit shell.
- **Trip stop colors** on the trip overview mark each stop with a dot and its days with a spine. They borrow the `primary`, `ring` and `warning` hues, which stay distinct in both palettes, rather than adding categorical tokens. The stop's name always goes with the color, so it never carries meaning alone and doesn't imply a status.
- **The thermal gauge's cold-to-hot gradient** in `layers/ThermalGauge.tsx` keeps its fixed blue-to-amber hues. It's a scale, not a status, and its marker, band and labels use tokens.
