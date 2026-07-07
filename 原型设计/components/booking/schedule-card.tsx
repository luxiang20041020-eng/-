// 场次卡片（预约大厅使用）
import type { Schedule } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { Clock, MapPin } from "lucide-react"

interface Props {
  schedule: Schedule
  booked?: boolean
  onBook: () => void
}

export function ScheduleCard({ schedule, booked, onBook }: Props) {
  const { title, coachName, startTime, endTime, room, maxCapacity, bookedCount, status, level } =
    schedule
  const progress = Math.min(100, Math.round((bookedCount / maxCapacity) * 100))
  const isFull = status === 2
  const isEnded = status === 3

  return (
    <article className="border border-border bg-card">
      {/* 时间条 + 级别标签 */}
      <div className="flex items-stretch border-b border-border">
        <div className="bg-primary/10 px-3 py-3 flex flex-col items-center justify-center border-r border-border min-w-[72px]">
          <span className="font-display text-xl leading-none num text-foreground">
            {startTime}
          </span>
          <span className="text-[9px] font-mono tracking-widest text-muted-foreground mt-1">
            - {endTime}
          </span>
        </div>
        <div className="flex-1 p-3 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {level && (
              <span className="text-[9px] font-mono tracking-widest border border-border px-1 py-0.5 text-muted-foreground">
                {level.toUpperCase()}
              </span>
            )}
            <span className="text-[9px] font-mono tracking-widest text-primary">
              {schedule.classType === 1 ? "GROUP" : "PRIVATE"}
            </span>
          </div>
          <h3 className="text-sm font-semibold leading-tight truncate">{title}</h3>
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
            <span>👨‍🏫 {coachName}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {room}
            </span>
          </div>
        </div>
      </div>

      {/* 容量进度条 + 预约按钮 */}
      <div className="flex items-center">
        <div className="flex-1 p-3">
          <div className="flex items-center justify-between text-[10px] font-mono tracking-widest mb-1">
            <span className="text-muted-foreground">CAPACITY</span>
            <span className="num text-foreground">
              {bookedCount}/{maxCapacity}
            </span>
          </div>
          <div className="h-1 bg-muted">
            <div
              className={cn("h-full", isFull ? "bg-muted-foreground" : "bg-primary")}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <button
          onClick={onBook}
          disabled={isFull || isEnded || booked}
          className={cn(
            "px-5 h-full self-stretch text-xs font-semibold tracking-wider transition-colors border-l border-border",
            booked
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : isFull || isEnded
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground active:opacity-80",
          )}
        >
          {booked ? (
            "已预约"
          ) : isFull ? (
            "已满员"
          ) : isEnded ? (
            "已结束"
          ) : (
            <span className="flex flex-col items-center gap-0.5">
              <span>立即预约</span>
              <span className="text-[9px] font-mono opacity-80 flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                扣 1 节
              </span>
            </span>
          )}
        </button>
      </div>
    </article>
  )
}
