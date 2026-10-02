import * as React from "react"

import { cn } from "@/lib/utils"

// Shared look for text fields, select triggers and field-like buttons. Text
// stays 16px so iOS does not zoom the page on focus.
const fieldClassName =
  "h-11 w-full min-w-0 rounded-control border border-input bg-card px-3 text-base text-card-foreground transition-colors placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldClassName,
        "file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Input, fieldClassName }
