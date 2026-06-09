import * as React from "react"
import { cn } from "@/lib/utils"

const variants = {
  primary: "bg-gradient-to-r from-[#ff5a1f] to-[#ff8c42] text-white font-semibold shadow-lg shadow-[#ff5a1f]/25 hover:shadow-[#ff5a1f]/40 hover:from-[#e04d15] hover:to-[#ff5a1f] hover:-translate-y-[1px] active:translate-y-0 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg disabled:hover:shadow-[#ff5a1f]/25 disabled:hover:from-[#ff5a1f] disabled:hover:to-[#ff8c42]",
  secondary: "bg-[#111] border border-[#2a2a2a] text-[#aaa] hover:border-[#ff5a1f] hover:text-[#ff5a1f] hover:bg-[#161616] active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed",
  ghost: "bg-transparent text-[#666] hover:text-[#f0ede8] hover:bg-[#111] transition-colors duration-150",
  danger: "bg-red-600/10 border border-red-600/30 text-red-400 hover:bg-red-600/20 hover:text-red-300 transition-all duration-150",
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a1f]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] cursor-pointer select-none",
          variants[variant],
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
