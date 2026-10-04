"use client";

import { useId } from "react";
import Link from "next/link";
import { Info, Loader2, LogIn, RotateCw, Shirt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ACTIVITIES } from "@/data/activities";
import { RESUME_OUTING_PATH, WARDROBE_FROM_OUTING_PATH, signInHref } from "@/lib/outingReturn";
import type { BiophysicsStatus } from "@/types/biophysics";

type NoticeAction = "sign_in" | "add_gear" | "retry";

interface NoticeCopy {
  title: string;
  detail: string;
  action?: NoticeAction;
}

/** Labels static layers as general guidance and says why they aren't personalized. */
function generalGuidanceCopy(status: BiophysicsStatus | null | undefined): NoticeCopy {
  const title = "General guidance";
  switch (status) {
    case "auth_required":
      return {
        title,
        detail:
          "Standard layers for this temperature. Sign in to get layers matched to your body and gear. You'll come back to this outing.",
        action: "sign_in",
      };
    case "no_gear":
      return {
        title,
        detail: "Standard layers for this temperature. Add your gear to get layers built from what you own.",
        action: "add_gear",
      };
    case "unavailable":
      return {
        title,
        detail: "Personalized layers couldn't load, so these are standard layers for this temperature.",
        action: "retry",
      };
    case "unsupported":
      return {
        title,
        detail: "Personalized layers aren't available for this activity yet, so these are standard layers for this temperature.",
      };
    default:
      return { title, detail: "Standard layers for this temperature." };
  }
}

/** Explains why there are no layers at all, in place of the layer breakdown. */
function noLayersCopy(status: BiophysicsStatus | null | undefined, activity?: string): NoticeCopy {
  const activityName = ACTIVITIES.find((candidate) => candidate.value === activity)?.name;
  const layers = activityName ? `${activityName} layers` : "layers";
  switch (status) {
    case "auth_required":
      return {
        title: `Sign in for ${layers}`,
        detail:
          "Layers for this activity are built from your body and your own gear, so they need an account. There's no general guide for it yet. You'll come back to this outing.",
        action: "sign_in",
      };
    case "no_gear":
      return {
        title: `Add gear for ${layers}`,
        detail: "Layers for this activity are built from the gear in your wardrobe, and it doesn't have any usable items yet.",
        action: "add_gear",
      };
    case "unavailable":
      return {
        title: `Couldn't load ${layers}`,
        detail: "Something went wrong getting your layers. Your conditions are still here, so you can try again.",
        action: "retry",
      };
    default:
      return {
        title: activityName ? `${layers} aren't available yet` : "Layers aren't available yet",
        detail: "Choose another activity above to get layers for these conditions.",
      };
  }
}

interface NoticeActionButtonProps {
  action: NoticeAction;
  onRetry?: () => void;
  retrying?: boolean;
}

function NoticeActionButton({ action, onRetry, retrying }: NoticeActionButtonProps) {
  const className = "shrink-0";
  switch (action) {
    case "sign_in":
      return (
        <Button asChild className={className}>
          {/* Back to this outing afterwards, asked for again with the account's body and gear. */}
          <Link href={signInHref(RESUME_OUTING_PATH)}>
            <LogIn aria-hidden="true" />
            Sign in
          </Link>
        </Button>
      );
    case "add_gear":
      return (
        <Button asChild className={className}>
          <Link href={WARDROBE_FROM_OUTING_PATH}>
            <Shirt aria-hidden="true" />
            Add gear
          </Link>
        </Button>
      );
    case "retry":
      if (!onRetry) return null;
      return (
        <Button type="button" onClick={onRetry} disabled={retrying} className={className}>
          {retrying ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCw aria-hidden="true" />}
          {retrying ? "Trying again…" : "Try again"}
        </Button>
      );
  }
}

interface RecommendationNoticeProps {
  activity?: string;
  /** Why there's no biophysics recommendation. */
  status?: BiophysicsStatus | null;
  /** True when static layers are shown with the notice. */
  hasGeneralLayers: boolean;
  onRetry?: () => void;
  retrying?: boolean;
}

/**
 * Shown instead of a personalized result: labels static layers as general
 * guidance, or explains why there are no layers, with the action that
 * resolves it (sign in, add gear, or try again).
 */
export function RecommendationNotice({
  activity,
  status,
  hasGeneralLayers,
  onRetry,
  retrying,
}: RecommendationNoticeProps) {
  const titleId = useId();
  const { title, detail, action } = hasGeneralLayers
    ? generalGuidanceCopy(status)
    : noLayersCopy(status, activity);
  const actionButton = action ? (
    <NoticeActionButton action={action} onRetry={onRetry} retrying={retrying} />
  ) : null;

  if (hasGeneralLayers) {
    return (
      <Card asChild variant="muted">
        <section
          aria-labelledby={titleId}
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex gap-3">
            <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <h3 id={titleId} className="text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
            </div>
          </div>
          {actionButton && <div className="pl-8 sm:pl-0">{actionButton}</div>}
        </section>
      </Card>
    );
  }

  return (
    <Card asChild padding="lg">
      <section aria-labelledby={titleId}>
        <h3 id={titleId} className="text-xl font-semibold text-foreground">{title}</h3>
        <p className="mt-1.5 text-base text-muted-foreground">{detail}</p>
        {actionButton && <div className="mt-4">{actionButton}</div>}
      </section>
    </Card>
  );
}
