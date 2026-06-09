import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

interface CollapsibleProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}

function Collapsible({ title, children, defaultOpen = false, className }: CollapsibleProps) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <div className={cn("rounded-xl border border-[#222] bg-[#0d0d0d] overflow-hidden transition-all duration-200", className)}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-[#888] hover:text-[#f0ede8] transition-colors cursor-pointer"
      >
        <span>{title}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <div className={cn(
        "transition-all duration-200 overflow-hidden",
        open ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <div className="px-4 pb-4">{children}</div>
      </div>
    </div>
  )
}

export { Collapsible }
