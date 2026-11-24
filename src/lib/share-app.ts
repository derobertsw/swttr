import { toast } from "sonner";
import { logWarn } from "@/lib/logger";

/** Shares the app's address with the system share sheet, or copies it. */
export async function shareApp() {
  const shareData = {
    title: "SWTTR",
    text: "Check out SWTTR - get clothing recommendations for outdoor activities!",
    url: window.location.origin,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        logWarn("Header.share", err);
      }
    }
  } else {
    await navigator.clipboard.writeText(shareData.url);
    toast.success("Link copied to clipboard!");
  }
}
