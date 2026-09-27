import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldErrorProps {
  /** Point the invalid field's aria-describedby at this id. */
  id: string;
  variant?: "frosted" | "default";
  children: ReactNode;
}

/** Inline validation message shown under a form field. */
export function FieldError({ id, variant = "frosted", children }: FieldErrorProps) {
  return (
    <p
      id={id}
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium",
        variant === "frosted" ? "text-rose-100" : "text-destructive"
      )}
    >
      <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
      {children}
    </p>
  );
}
