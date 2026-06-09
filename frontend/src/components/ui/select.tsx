import * as React from "react"
import { cn } from "@/lib/utils"

function NativeSelect({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex h-10 w-full rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f0ede8] focus:outline-none focus:border-[#ff5a1f] focus:ring-1 focus:ring-[#ff5a1f]/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors appearance-none cursor-pointer",
        className
      )}
      {...props}
    />
  )
}

export { NativeSelect as Select }
