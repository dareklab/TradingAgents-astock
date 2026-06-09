import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressProps {
  value: number
  className?: string
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ value, className }, ref) => {
    const clamped = Math.min(100, Math.max(0, value))
    return (
      <div
        ref={ref}
        className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-[#1a1a1a]", className)}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#ff5a1f] to-[#ff8c42] transition-all duration-700 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    )
  }
)
Progress.displayName = "Progress"

export { Progress }
