import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

// Sizes meet the 44px touch target on phones and coarse pointers; lg (48px)
// is for the one primary action on a mobile screen.
const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-semibold transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress aria-invalid:border aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline underline-offset-4 hover:no-underline",
      },
      size: {
        default: "h-11 px-4 has-[>svg]:px-3.5",
        sm: "h-9 gap-1.5 px-3 has-[>svg]:px-2.5 max-md:h-11 pointer-coarse:h-11",
        lg: "h-12 px-6 text-base has-[>svg]:px-5",
        icon: "size-11",
        "icon-sm": "size-9 max-md:size-11 pointer-coarse:size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function preventClick(event: React.MouseEvent) {
  event.preventDefault()
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  onClick,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Shows a spinner and ignores clicks, but keeps focus on the button. */
    loading?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={loading ? preventClick : onClick}
      {...props}
    >
      {loading && !asChild ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
