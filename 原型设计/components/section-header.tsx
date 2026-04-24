// 标题区：强调大写字母 + 中文副标题 + 编号，贯穿国际主义风
import { cn } from "@/lib/utils"

interface Props {
  index?: string
  eyebrow?: string
  title: string
  action?: React.ReactNode
  className?: string
}

export function SectionHeader({ index, eyebrow, title, action, className }: Props) {
  return (
    <div className={cn("flex items-end justify-between px-4 pt-6 pb-3", className)}>
      <div className="flex items-end gap-3">
        {index && (
          <span className="font-mono text-[10px] text-muted-foreground tracking-widest pb-[3px]">
            {index}
          </span>
        )}
        <div>
          {eyebrow && (
            <div className="text-[10px] font-mono tracking-[0.25em] text-primary mb-1">
              {eyebrow}
            </div>
          )}
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        </div>
      </div>
      {action && <div className="text-xs text-muted-foreground">{action}</div>}
    </div>
  )
}

export function PageHeader({
  title,
  back,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  back?: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {back}
          <div className="min-w-0">
            <h1 className="text-sm font-semibold tracking-tight truncate">{title}</h1>
            {subtitle && (
              <div className="text-[10px] text-muted-foreground font-mono tracking-widest">
                {subtitle}
              </div>
            )}
          </div>
        </div>
        <div>{right}</div>
      </div>
    </header>
  )
}
