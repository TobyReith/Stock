import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-border bg-surface px-2.5 py-1 text-[15px] text-foreground transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted focus:border-border-strong disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-surface-raised disabled:opacity-60 aria-invalid:border-danger md:text-[15px]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
