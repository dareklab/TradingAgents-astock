import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f0ede8] placeholder:text-[#555] focus:outline-none focus:border-[#ff5a1f] focus:ring-1 focus:ring-[#ff5a1f]/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors",
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
