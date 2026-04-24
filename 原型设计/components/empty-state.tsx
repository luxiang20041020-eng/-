// 空状态（搏击手套图标 + 文案）
import { cn } from "@/lib/utils"

interface Props {
  title: string
  description?: string
  className?: string
  action?: React.ReactNode
}

export function EmptyState({ title, description, className, action }: Props) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-14 px-6", className)}>
      {/* 简洁的搏击手套 SVG */}
      <svg
        viewBox="0 0 48 48"
        className="h-12 w-12 text-primary mb-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
        aria-hidden
      >
        <path d="M12 16c0-4 3-6 7-6h10c4 0 7 2 7 6v14c0 3-2 5-5 5H17c-3 0-5-2-5-5V16z" />
        <path d="M19 10V6h11v4" />
        <path d="M12 22h24" />
        <path d="M28 27c0 2-2 3-4 3s-4-1-4-3" />
      </svg>
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="text-xs text-muted-foreground mt-2 max-w-[240px] leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
