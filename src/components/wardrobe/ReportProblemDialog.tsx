"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerNested,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, fieldClassName } from "@/components/ui/input";
import {
  CATALOG_REPORT_NOTE_LIMIT,
  CATALOG_REPORT_PROBLEM_MESSAGES,
  CATALOG_REPORT_REASONS,
  CATALOG_REPORT_URL_LIMIT,
  parseCatalogReport,
  type CatalogReportProblem,
  type CatalogReportReason,
} from "@/lib/catalog-reports";
import { logError } from "@/lib/logger";
import { cn } from "@/lib/utils";
import type { WardrobeItem } from "@/types/wardrobe";

interface ReportProblemDialogProps {
  /** A catalog item: garment, handwear or headwear. */
  item: WardrobeItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes when the form closes. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * "Report a problem" for a catalog item (#277), opened from the item's
 * details, which stay open underneath. Render it inside the details' Dialog
 * or Drawer content so it stacks on top of them.
 */
export function ReportProblemDialog({ item, open, onOpenChange, onCloseAutoFocus }: ReportProblemDialogProps) {
  const isMobile = useIsMobile();
  const formId = useId();
  const [sending, setSending] = useState(false);
  const title = "Report a problem";
  const description = `Tell us what's wrong with ${item.details.model_name}. We check every report and fix the catalog for everyone.`;
  const form = (
    <ReportForm
      id={formId}
      item={item}
      sending={sending}
      onSendingChange={setSending}
      onSent={() => onOpenChange(false)}
    />
  );
  const actions = (
    <>
      <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button type="submit" form={formId} size="lg" loading={sending}>
        <Send />
        Send report
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <DrawerNested open={open} onOpenChange={onOpenChange}>
        <DrawerContent showCloseButton onCloseAutoFocus={onCloseAutoFocus}>
          <div className="mx-auto flex min-h-0 w-full max-w-sm flex-1 flex-col">
            <DrawerHeader className="pr-14 pb-3">
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="pb-4">{form}</DrawerBody>
            <DrawerFooter className="flex-col-reverse">{actions}</DrawerFooter>
          </div>
        </DrawerContent>
      </DrawerNested>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader className="flex-none border-b border-border px-6 py-4 pr-14">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{form}</div>
        <DialogFooter className="flex-none border-t border-border px-6 py-4">{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Messages for the answers the form handles itself; anything else is a toast. */
function failureMessage(status: number, error: string | undefined): string {
  if (status === 401) return "Your session ended. Sign in again to send the report.";
  if ((status === 404 || status === 429) && error) return error;
  if (status === 503) return "Reporting isn't available yet. Try again later.";
  return "Check your connection and try again. Your report is still here.";
}

function ReportForm({
  id,
  item,
  sending,
  onSendingChange: setSending,
  onSent,
}: {
  id: string;
  item: WardrobeItem;
  sending: boolean;
  onSendingChange: (sending: boolean) => void;
  onSent: () => void;
}) {
  const [reasons, setReasons] = useState<CatalogReportReason[]>([]);
  const [note, setNote] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [problem, setProblem] = useState<CatalogReportProblem | null>(null);
  const firstReason = useRef<HTMLInputElement>(null);
  const noteField = useRef<HTMLTextAreaElement>(null);
  const urlField = useRef<HTMLInputElement>(null);

  const otherChosen = reasons.includes("other");
  const reasonsInvalid = problem === "reasons";
  const noteInvalid = problem === "note" || problem === "other_note";
  const urlInvalid = problem === "product_url";

  const toggleReason = (reason: CatalogReportReason, checked: boolean) => {
    setReasons((current) => (checked ? [...current, reason] : current.filter((value) => value !== reason)));
    if (reasonsInvalid || problem === "other_note") setProblem(null);
  };

  const showProblem = (next: CatalogReportProblem) => {
    setProblem(next);
    // Take the user to what needs fixing.
    if (next === "reasons") firstReason.current?.focus();
    else if (next === "note" || next === "other_note") noteField.current?.focus();
    else if (next === "product_url") urlField.current?.focus();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const body = {
      item_type: item.item_type,
      item_id: item.item_id,
      reasons,
      note,
      product_url: productUrl,
    };
    // The API checks the report too; this just catches mistakes before sending.
    const parsed = parseCatalogReport(body);
    if (!parsed.ok) {
      showProblem(parsed.problem);
      return;
    }
    setProblem(null);
    setSending(true);
    try {
      const res = await fetch("/api/wardrobe/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.value),
      });
      const data = (await res.json().catch(() => ({}))) as {
        report?: { outcome: "created" | "updated" };
        error?: string;
        problem?: CatalogReportProblem;
      };
      if (!res.ok || !data.report) {
        if (res.status === 400 && data.problem && data.problem !== "item") {
          showProblem(data.problem);
          return;
        }
        toast.error("Couldn't send the report", { description: failureMessage(res.status, data.error) });
        return;
      }
      toast.success(data.report.outcome === "updated" ? "Report updated" : "Thanks for the report", {
        description:
          data.report.outcome === "updated"
            ? `We added this to your earlier report on ${item.details.model_name}.`
            : `We'll check ${item.details.model_name} and fix the catalog.`,
      });
      onSent();
    } catch (err) {
      logError("ReportForm.handleSubmit", err);
      toast.error("Couldn't send the report", { description: failureMessage(0, undefined) });
    } finally {
      setSending(false);
    }
  };

  return (
    <form id={id} onSubmit={handleSubmit} aria-busy={sending} noValidate className="flex flex-col gap-6">
      <fieldset
        className="flex min-w-0 flex-col gap-1"
        aria-invalid={reasonsInvalid || undefined}
        aria-describedby={`${id}-reasons-hint`}
      >
        <legend className="text-sm font-medium text-foreground">What&apos;s wrong?</legend>
        <p id={`${id}-reasons-hint`} className="text-sm text-muted-foreground">
          {reasonsInvalid ? (
            <span className="font-medium text-destructive">{CATALOG_REPORT_PROBLEM_MESSAGES.reasons} </span>
          ) : null}
          Choose all that apply.
        </p>
        <div className="mt-1 flex flex-col">
          {CATALOG_REPORT_REASONS.map((reason, index) => (
            <label key={reason.value} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                ref={index === 0 ? firstReason : undefined}
                type="checkbox"
                name="reasons"
                value={reason.value}
                className="size-5 shrink-0 accent-primary"
                checked={reasons.includes(reason.value)}
                onChange={(event) => toggleReason(reason.value, event.target.checked)}
              />
              <span className="text-base text-foreground">{reason.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-note`} className="text-sm font-medium text-foreground">
          Details{otherChosen ? "" : " (optional)"}
        </label>
        <textarea
          ref={noteField}
          id={`${id}-note`}
          name="note"
          rows={4}
          maxLength={CATALOG_REPORT_NOTE_LIMIT}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            if (noteInvalid) setProblem(null);
          }}
          placeholder="e.g. It weighs 420 g, not 380 g"
          required={otherChosen}
          aria-invalid={noteInvalid || undefined}
          aria-describedby={`${id}-note-hint`}
          className={cn(fieldClassName, "h-auto py-2")}
        />
        <p id={`${id}-note-hint`} className="text-sm text-muted-foreground">
          {noteInvalid && problem ? (
            <span className="font-medium text-destructive">{CATALOG_REPORT_PROBLEM_MESSAGES[problem]} </span>
          ) : null}
          {otherChosen ? "Needed for Something else. " : ""}
          {note.length}/{CATALOG_REPORT_NOTE_LIMIT} characters.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-url`} className="text-sm font-medium text-foreground">
          Product page link (optional)
        </label>
        <Input
          ref={urlField}
          id={`${id}-url`}
          name="product_url"
          type="url"
          inputMode="url"
          autoComplete="url"
          maxLength={CATALOG_REPORT_URL_LIMIT}
          value={productUrl}
          onChange={(event) => {
            setProductUrl(event.target.value);
            if (urlInvalid) setProblem(null);
          }}
          placeholder="https://"
          aria-invalid={urlInvalid || undefined}
          aria-describedby={`${id}-url-hint`}
        />
        <p id={`${id}-url-hint`} className="text-sm text-muted-foreground">
          {urlInvalid ? (
            <span className="font-medium text-destructive">{CATALOG_REPORT_PROBLEM_MESSAGES.product_url} </span>
          ) : null}
          The maker&apos;s or a store&apos;s page helps us check the specs. You can&apos;t attach photos yet.
        </p>
      </div>
    </form>
  );
}
