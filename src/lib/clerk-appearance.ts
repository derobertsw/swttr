// Clerk's sign-in and sign-up cards in SWTTR's tokens, so they follow the
// light and dark palettes in globals.css. Clerk's styles outrank the app's
// layered CSS, so targets, borders and focus outlines are set here too.

const FOCUS_OUTLINE = {
  "&:focus-visible": { outline: "2px solid var(--ring)", outlineOffset: "2px" },
};

// 44px, like the app's buttons and fields.
const CONTROL = { minHeight: "2.75rem", ...FOCUS_OUTLINE };

// Clerk draws edges as shadows of colorBorder faded to about 10%, too faint
// for a field. Its variant rules outrank plain element styles; "&&" doesn't.
const FIELD_EDGE = { "&&": { border: "1px solid var(--input)", boxShadow: "none" } };

export const AUTH_CARD_APPEARANCE = {
  variables: {
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorBackground: "var(--card)",
    colorForeground: "var(--card-foreground)",
    colorMuted: "var(--muted)",
    colorMutedForeground: "var(--muted-foreground)",
    colorNeutral: "var(--foreground)",
    colorInput: "var(--card)",
    colorInputForeground: "var(--card-foreground)",
    colorBorder: "var(--border)",
    colorRing: "var(--ring)",
    colorDanger: "var(--destructive)",
    colorSuccess: "var(--success)",
    // Also the development-instance badge, which fails contrast in Clerk's orange.
    colorWarning: "var(--warning)",
    fontSize: "0.875rem",
    borderRadius: "var(--radius)",
  },
  elements: {
    cardBox: { borderRadius: "1rem", border: "1px solid var(--border)", boxShadow: "none" },
    // Clerk's 2.5rem sides leave phone fields too narrow for their placeholder.
    card: { "@media (max-width: 30rem)": { paddingInline: "1.5rem" } },
    socialButtonsBlockButton: { ...CONTROL, ...FIELD_EDGE, color: "var(--card-foreground)" },
    socialButtonsIconButton: { ...CONTROL, ...FIELD_EDGE },
    // Clerk's Apple logo is black, which disappears on the dark card.
    socialButtonsProviderIcon__apple: { "@media (prefers-color-scheme: dark)": { filter: "invert(1)" } },
    dividerLine: { backgroundColor: "var(--border)" },
    // 16px text so iOS doesn't zoom the page on focus.
    formFieldInput: {
      ...CONTROL,
      ...FIELD_EDGE,
      fontSize: "1rem",
      "&&:focus": { borderColor: "var(--ring)" },
      "&&[data-feedback='error']": { borderColor: "var(--destructive)" },
    },
    // Fill the field's height at its right end instead of a 24px strip.
    formFieldInputShowPasswordButton: { ...CONTROL, top: 0, marginRight: 0, minWidth: "2.75rem" },
    formFieldInput__password: { paddingRight: "2.75rem" },
    formButtonPrimary: CONTROL,
    footerAction: { alignItems: "center" },
    footerActionLink: { display: "inline-flex", alignItems: "center", minHeight: "2.75rem", ...FOCUS_OUTLINE },
  },
};
