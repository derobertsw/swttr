import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

interface FieldErrorProps {
  /** Point the invalid field's aria-describedby at this id. */
  id: string;
  children: ReactNode;
}

/** Inline validation message shown under a form field. */
export function FieldError({ id, children }: FieldErrorProps) {
  return (
    <p id={id} className="flex items-center gap-1.5 text-sm font-medium text-destructive">
      <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </p>
  );
}
