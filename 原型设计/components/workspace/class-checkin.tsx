"use client"

// 🎯 单节课程核销
// 支持两种模式：A 扫码核销（唤起 wx.scanCode）；B 手动点名核销（左滑选项）

import { useMemo, useState } from "react"
import { SCHEDULES, TODAY_BOOKINGS, type Booking } from "@/lib/mock-data"
import { toast } from "sonner"
import { ScanLine, Check, X, UserX } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface Props {
  scheduleId: number
}

export function ClassCheckin({ scheduleId }: Props) {
  const schedule = useMemo(() => SCHEDULES.find((s) => s.id === scheduleId), [scheduleId])
  const [bookings, setBookings] = useState<Booking[]>(
    TODAY_BOOKINGS.map((b) => ({ ...b, scheduleId })),
  )

  const counts = useMemo(() => {
    return bookings.reduce(
      (acc, b) => {
        if (b.status === 2) acc.done++
        else if (b.status === 5) acc.absent++
        else acc.pending++
        return acc
      },
      { pending: 0, done: 0, absent: 0 },
    )
  }, [bookings])

  const updateStatus = (id: number, status: Booking["status"], msg: string) => {
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)))
    toast.success(msg)
  }

  if (!schedule) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">课程不存在</div>
    )
  }

  return (
    <div>
      {/* 课程信息 */}
      <section className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-primary mb-1.5">
          <span className="border border-primary px-1 py-0.5">
            {schedule.classType === 1 ? "GROUP" : "PRIVATE"}
          </span>
          <span>CLASS #{String(schedule.id).padStart(4, "0")}</span>
        </div>
        <h2 className="text-lg font-semibold tracking-tight">{schedule.title}</h2>
        <div className="text-xs text-muted-foreground mt-1">
          今日 {schedule.startTime} - {schedule.endTime} · {schedule.coachName} · {schedule.room}
        </div>
        <div className="grid grid-cols-3 border border-border mt-4">
          <Stat value={counts.done} label="已核销" code="DONE" primary />
          <Stat value={counts.pending} label="待核销" code="WAIT" border />
          <Stat value={counts.absent} label="缺席" code="ABSENT" border />
        </div>
      </section>

      {/* 大按钮：扫码核销 */}
      <div className="px-4 py-4">
        <button
          onClick={() =>
            toast.info("已唤起 wx.scanCode → 扫描客户 qr_token → 自动核销", {
              description: "Demo 环境已展示扫码后的列表状态",
            })
          }
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-4 text-sm font-semibold tracking-wider active:opacity-80"
        >
          <ScanLine className="h-5 w-5" />
          扫码核销（推荐）
        </button>
        <div className="mt-2 text-[10px] text-muted-foreground tracking-widest font-mono text-center">
          如客户未携带手机 · 可在下方列表手动点名
        </div>
      </div>

      {/* 预约名单 */}
      <section className="px-4 pb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-mono tracking-[0.25em] text-primary">
            ROSTER · 预约名单（{bookings.length}/{schedule.maxCapacity}）
          </div>
        </div>
        <ul className="border border-border divide-y divide-border">
          {bookings.map((b) => {
            const statusInfo = {
              1: { label: "待核销", cls: "text-muted-foreground border-border" },
              2: { label: "已核销", cls: "text-primary border-primary" },
              3: { label: "已取消", cls: "text-muted-foreground border-border" },
              4: { label: "教练取消", cls: "text-muted-foreground border-border" },
              5: { label: "缺席", cls: "text-destructive border-destructive" },
            }[b.status]
            return (
              <li key={b.id} className="flex items-center gap-3 p-3">
                <div className="h-9 w-9 bg-muted flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold">
                    {b.userName.split(" · ")[0]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{b.userName}</div>
                  <div className="text-[11px] text-muted-foreground">{b.userPhone}</div>
                </div>
                <span
                  className={cn(
                    "text-[9px] font-mono tracking-widest border px-1.5 py-0.5",
                    statusInfo.cls,
                  )}
                >
                  {statusInfo.label}
                </span>
                {b.status === 1 ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className="text-[10px] font-mono tracking-widest text-primary border border-border px-2 py-1 active:bg-muted"
                        aria-label="更多操作"
                      >
                        操作
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="p-0 w-[160px] rounded-none border-border bg-card"
                    >
                      <button
                        onClick={() => updateStatus(b.id, 2, `已核销 · ${b.userName}`)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-muted border-b border-border text-foreground"
                      >
                        <Check className="h-3.5 w-3.5 text-primary" />
                        确认到场 · 核销
                      </button>
                      <button
                        onClick={() => updateStatus(b.id, 5, `已标记缺席 · 课时照扣`)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-muted border-b border-border text-destructive"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        标记缺席 · 扣课
                      </button>
                      <button
                        onClick={() => updateStatus(b.id, 4, `已取消 · 课时退还`)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-muted text-muted-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                        教练取消 · 退课
                      </button>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <span className="text-[10px] font-mono tracking-widest text-muted-foreground w-[52px] text-right">
                    —
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function Stat({
  value,
  label,
  code,
  border,
  primary,
}: {
  value: number
  label: string
  code: string
  border?: boolean
  primary?: boolean
}) {
  return (
    <div
      className={cn(
        "py-3 text-center",
        border && "border-l border-border",
        primary && "bg-primary/10",
      )}
    >
      <div className={cn("font-display text-2xl num leading-none", primary && "text-primary")}>
        {value}
      </div>
      <div className="text-[9px] font-mono text-muted-foreground tracking-widest mt-1">
        {code}
      </div>
      <div className="text-[10px] mt-0.5">{label}</div>
    </div>
  )
}
