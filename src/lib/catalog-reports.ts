/**
 * Reports of a problem with a catalog item (#277): what can be reported, the
 * limits, and the check the API runs on a report before storing it. The form
 * uses the same lists and limits. docs/catalog-reports.md covers triage.
 */

export const CATALOG_REPORT_REASONS = [
  { value: "wrong_photo", label: "Wrong or missing photo" },
  { value: "wrong_specs", label: "Wrong specs (weight, material, fit)" },
  { value: "wrong_warmth", label: "Warmth or rating looks wrong" },
  { value: "wrong_category", label: "Wrong category or type" },
  { value: "duplicate", label: "Duplicate item" },
  { value: "discontinued", label: "Discontinued" },
  { value: "other", label: "Something else" },
] as const;

export type CatalogReportReason = (typeof CATALOG_REPORT_REASONS)[number]["value"];

/** Catalog tables. Custom items are the user's own to edit, so they can't be reported. */
const REPORTABLE_ITEM_TYPES = ["garment", "handwear", "headwear"] as const;
type ReportableItemType = (typeof REPORTABLE_ITEM_TYPES)[number];

export const CATALOG_REPORT_NOTE_LIMIT = 1000;
export const CATALOG_REPORT_URL_LIMIT = 500;

interface CatalogReportInput {
  item_type: ReportableItemType;
  item_id: string;
  reasons: CatalogReportReason[];
  note: string | null;
  product_url: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_VALUES: readonly string[] = CATALOG_REPORT_REASONS.map((reason) => reason.value);

function isReportableItemType(value: unknown): value is ReportableItemType {
  return typeof value === "string" && (REPORTABLE_ITEM_TYPES as readonly string[]).includes(value);
}

/** The link as stored: trimmed, http or https only. Null when it isn't one. */
function normalizeProductUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > CATALOG_REPORT_URL_LIMIT) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return trimmed;
  } catch {
    return null;
  }
}

/** Where a report's input is wrong, in words the form can show. */
export type CatalogReportProblem = "item" | "reasons" | "note" | "other_note" | "product_url";

/**
 * The report to store, or what's wrong with it. Reasons come back in the
 * form's order without repeats; an empty note or link becomes null. "Something
 * else" needs a note, since it says nothing on its own.
 */
export function parseCatalogReport(
  body: unknown
): { ok: true; value: CatalogReportInput } | { ok: false; problem: CatalogReportProblem } {
  if (!body || typeof body !== "object") return { ok: false, problem: "item" };
  const { item_type, item_id, reasons, note, product_url } = body as Record<string, unknown>;

  if (!isReportableItemType(item_type) || typeof item_id !== "string" || !UUID.test(item_id)) {
    return { ok: false, problem: "item" };
  }

  if (!Array.isArray(reasons) || reasons.length === 0 || reasons.some((reason) => !REASON_VALUES.includes(reason))) {
    return { ok: false, problem: "reasons" };
  }
  const chosen = CATALOG_REPORT_REASONS.map((reason) => reason.value).filter((value) => reasons.includes(value));

  if (note !== undefined && note !== null && typeof note !== "string") return { ok: false, problem: "note" };
  const trimmedNote = typeof note === "string" ? note.trim() : "";
  if (trimmedNote.length > CATALOG_REPORT_NOTE_LIMIT) return { ok: false, problem: "note" };
  if (chosen.includes("other") && !trimmedNote) return { ok: false, problem: "other_note" };

  if (product_url !== undefined && product_url !== null && typeof product_url !== "string") {
    return { ok: false, problem: "product_url" };
  }
  let url: string | null = null;
  if (typeof product_url === "string" && product_url.trim()) {
    url = normalizeProductUrl(product_url);
    if (!url) return { ok: false, problem: "product_url" };
  }

  return {
    ok: true,
    value: {
      item_type,
      item_id: item_id.toLowerCase(),
      reasons: chosen,
      note: trimmedNote || null,
      product_url: url,
    },
  };
}

export const CATALOG_REPORT_PROBLEM_MESSAGES: Record<CatalogReportProblem, string> = {
  item: "This item can't be reported.",
  reasons: "Choose at least one problem.",
  note: `Keep the note to ${CATALOG_REPORT_NOTE_LIMIT} characters.`,
  other_note: "Say what's wrong in the note.",
  product_url: "Enter a full web address, starting with https://.",
};
