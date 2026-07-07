"use client"

// 📅 预约大厅 · 核心选场次页
// 逻辑：1. 顶部团体/专属切换  2. 日期轴  3. 场次列表  4. 预约二次确认

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { SCHEDULES, type Schedule } from "@/lib/mock-data"
import { useApp } from "@/components/app-provider"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { ScheduleCard } from "@/components/booking/schedule-card"
import { BookingConfirmDialog } from "@/components/booking/booking-confirm-dialog"
import { EmptyState } from "@/components/empty-state"

export function BookingHub() {
  const { storeId, assets, setAssets } = useApp()
  const params = useSearchParams()
  const initialType = (Number(params.get("type")) || 1) as 1 | 2
  const [classType, setClassType] = useState<1 | 2>(initialType)
  const [coachFilter, setCoachFilter] = useState<string>("ALL")
  const [dateIdx, setDateIdx] = useState(0) // 0 = today
  const [selected, setSelected] = useState<Schedule | null>(null)
  const [bookedSet, setBookedSet] = useState<Set<number>>(new Set())

  // 生成未来 7 天的日期轴
  const days = useMemo(() => {
    const today = new Date()
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      return {
        idx: i,
        iso: d.toISOString().slice(0, 10),
        label: d.getDate().toString().padStart(2, "0"),
        weekday: ["日", "一", "二", "三", "四", "五", "六"][d.getDay()],
        month: (d.getMonth() + 1).toString().padStart(2, "0"),
      }
    })
  }, [])

  const activeDate = days[dateIdx].iso

  // 场馆人员筛选可选列表
  const coaches = useMemo(() => {
    const set = new Set(SCHEDULES.map((s) => s.coachName))
    return ["ALL", ...Array.from(set)]
  }, [])

  const list = SCHEDULES.filter(
    (s) =>
      s.storeId === storeId &&
      s.classType === classType &&
      s.date === activeDate &&
      (coachFilter === "ALL" || s.coachName === coachFilter),
  )

  const handleConfirmBook = () => {
    if (!selected) return
    // 前端演示：扣减资产 + 标记已预约
    const needed = selected.classType === 1 ? "groupClass" : "privateClass"
    if (assets[needed] <= 0) {
      toast.error("权益不足，请联系场馆人员补充权益")
      setSelected(null)
      return
    }
    setAssets({
      ...assets,
      [needed]: assets[needed] - 1,
    } as typeof assets)
    setBookedSet(new Set([...bookedSet, selected.id]))
    toast.success(`预约成功 · 使用 1 次 ${selected.classType === 1 ? "团体" : "专属"}权益`)
    setSelected(null)
  }

  return (
    <div>
      {/* 类型切换 + 场馆人员筛选 */}
      <div className="sticky top-[49px] z-[5] bg-background border-b border-border">
        <div className="flex items-center">
          {([1, 2] as const).map((t) => (
            <button
              key={t}
              onClick={() => setClassType(t)}
              className={cn(
                "flex-1 py-3 text-sm font-semibold tracking-tight relative",
                classType === t ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {t === 1 ? "团体 GROUP" : "专属 EXCLUSIVE"}
              {classType === t && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-10 bg-primary" />
              )}
            </button>
          ))}
        </div>
        {/* 场馆人员 Chip 滚动栏 */}
        <div className="overflow-x-auto no-scrollbar px-4 pb-3 pt-1">
          <div className="flex gap-2">
            {coaches.map((c) => (
              <button
                key={c}
                onClick={() => setCoachFilter(c)}
                className={cn(
                  "shrink-0 border px-3 py-1 text-[11px] font-mono tracking-widest transition-colors",
                  coachFilter === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {c === "ALL" ? "全部人员" : c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 日期轴 */}
      <div className="overflow-x-auto no-scrollbar border-b border-border">
        <div className="flex">
          {days.map((d) => {
            const active = d.idx === dateIdx
            return (
              <button
                key={d.iso}
                onClick={() => setDateIdx(d.idx)}
                className={cn(
                  "shrink-0 w-[14.285%] py-3 flex flex-col items-center gap-0.5 border-r border-border/60 transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
              >
                <span
                  className={cn(
                    "text-[9px] font-mono tracking-widest",
                    active ? "opacity-80" : "text-muted-foreground",
                  )}
                >
                  {d.month}月
                </span>
                <span className="font-display text-xl leading-none num">{d.label}</span>
                <span className="text-[10px]">周{d.weekday}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 场次列表 */}
      <div className="px-4 py-4 flex flex-col gap-3">
        {list.length === 0 ? (
          <EmptyState
            title="今天这个时段还没有可预约场次"
            description="切换日期或类型试试，汗水不会骗人。"
          />
        ) : (
          list.map((s) => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              booked={bookedSet.has(s.id)}
              onBook={() => setSelected(s)}
            />
          ))
        )}
      </div>

      <BookingConfirmDialog
        schedule={selected}
        onOpenChange={(o) => !o && setSelected(null)}
        onConfirm={handleConfirmBook}
      />
    </div>
  )
}
